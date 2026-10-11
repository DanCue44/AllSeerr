import type { TmdbTvDetails } from '@server/api/themoviedb/interfaces';
import {
  MediaRequestMonitorMode,
  MediaRequestStatus,
  MediaStatus,
} from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type Season from '@server/entity/Season';
import type SeasonRequest from '@server/entity/SeasonRequest';

export interface RequestedSeason {
  seasonNumber: number;
  // Episode numbers for an episode request, null for the whole season
  episodes: number[] | null;
}

export interface RequestedEpisodes {
  seasonNumber: number;
  episodeNumbers: number[];
}

type ActiveRequest = Pick<MediaRequest, 'id' | 'is4k' | 'status'> & {
  seasons: Pick<SeasonRequest, 'seasonNumber' | 'episodes'>[];
};

type CoveredSeason = Pick<Season, 'seasonNumber' | 'status' | 'status4k'>;

/**
 * Merges the seasons and episodes of a request body. A season listed in
 * episodes only requests those episodes, even if it is also in seasons.
 */
export const buildRequestedSeasons = (
  seasons: number[],
  episodes: RequestedEpisodes[] = []
): RequestedSeason[] => {
  const episodeMap = new Map<number, number[]>();

  for (const { seasonNumber, episodeNumbers } of episodes) {
    const merged = new Set([
      ...(episodeMap.get(seasonNumber) ?? []),
      ...episodeNumbers.filter((ep) => Number.isInteger(ep) && ep > 0),
    ]);

    if (merged.size > 0) {
      episodeMap.set(
        seasonNumber,
        [...merged].sort((a, b) => a - b)
      );
    }
  }

  const seasonNumbers = Array.from(
    new Set([...seasons, ...episodeMap.keys()])
  ).sort((a, b) => a - b);

  return seasonNumbers.map((seasonNumber) => ({
    seasonNumber,
    episodes: episodeMap.get(seasonNumber) ?? null,
  }));
};

/**
 * The season details of a TMDB series that the future and current season
 * helpers below need.
 */
export const getTmdbSeasonInfo = (
  show: Pick<
    TmdbTvDetails,
    'seasons' | 'last_episode_to_air' | 'next_episode_to_air'
  >
) => ({
  seasons: show.seasons.map((season) => ({
    seasonNumber: season.season_number,
    airDate: season.air_date,
    episodeCount: season.episode_count,
  })),
  lastEpisodeToAir: show.last_episode_to_air && {
    seasonNumber: show.last_episode_to_air.season_number,
  },
  nextEpisodeToAir: show.next_episode_to_air && {
    seasonNumber: show.next_episode_to_air.season_number,
  },
});

/**
 * Seasons that are still airing or have not aired yet, which is what a future
 * only request follows. Specials are never included.
 */
export const getFutureSeasonNumbers = (
  {
    seasons,
    lastEpisodeToAir,
    nextEpisodeToAir,
  }: {
    seasons: { seasonNumber: number; airDate?: string | null }[];
    lastEpisodeToAir?: { seasonNumber: number } | null;
    nextEpisodeToAir?: { seasonNumber: number } | null;
  },
  now = new Date()
): number[] => {
  const lastAiredSeason = lastEpisodeToAir?.seasonNumber ?? 0;

  return seasons
    .filter(
      (season) =>
        season.seasonNumber > 0 &&
        (season.seasonNumber === nextEpisodeToAir?.seasonNumber ||
          (season.seasonNumber > lastAiredSeason &&
            (!season.airDate || new Date(season.airDate) > now)))
    )
    .map((season) => season.seasonNumber);
};

/**
 * The season a current season request follows: the one with the most recently
 * aired episode, or the first one to air for a series that has not started.
 * A season that is only announced does not count until its first episode airs.
 * Specials are never the current season.
 */
export const getCurrentSeasonNumber = (
  {
    seasons,
    lastEpisodeToAir,
    nextEpisodeToAir,
  }: {
    seasons: {
      seasonNumber: number;
      airDate?: string | null;
      episodeCount?: number;
    }[];
    lastEpisodeToAir?: { seasonNumber: number } | null;
    nextEpisodeToAir?: { seasonNumber: number } | null;
  },
  now = new Date()
): number | null => {
  if (lastEpisodeToAir && lastEpisodeToAir.seasonNumber > 0) {
    return lastEpisodeToAir.seasonNumber;
  }

  if (nextEpisodeToAir && nextEpisodeToAir.seasonNumber > 0) {
    return nextEpisodeToAir.seasonNumber;
  }

  const airedSeasons = seasons.filter(
    (season) =>
      season.seasonNumber > 0 &&
      season.episodeCount !== 0 &&
      !!season.airDate &&
      new Date(season.airDate) <= now
  );

  return airedSeasons.length > 0
    ? Math.max(...airedSeasons.map((season) => season.seasonNumber))
    : null;
};

/**
 * Drops seasons and episodes that are already requested or available.
 *
 * A whole season is blocked by any active request for it, and by a season the
 * media already covers. An episode request is only blocked by an active whole
 * season request or an available season, and loses the episodes other active
 * requests hold. Seasons in keptSeasons skip the media check, so an edit keeps
 * the seasons it already holds.
 */
export const filterRequestableSeasons = ({
  requested,
  requests,
  seasons,
  is4k,
  keptSeasons = [],
}: {
  requested: RequestedSeason[];
  requests: ActiveRequest[];
  seasons: CoveredSeason[];
  is4k: boolean;
  keptSeasons?: number[];
}): RequestedSeason[] => {
  const statusKey = is4k ? 'status4k' : 'status';
  const activeSeasons = requests
    .filter(
      (request) =>
        request.is4k === is4k &&
        request.status !== MediaRequestStatus.DECLINED &&
        request.status !== MediaRequestStatus.COMPLETED
    )
    .flatMap((request) => request.seasons);

  return requested
    .map((season): RequestedSeason | null => {
      const held = activeSeasons.filter(
        (s) => s.seasonNumber === season.seasonNumber
      );
      const mediaSeason = seasons.find(
        (s) => s.seasonNumber === season.seasonNumber
      );
      const isKept = keptSeasons.includes(season.seasonNumber);

      if (!season.episodes) {
        const isCovered =
          !!mediaSeason &&
          mediaSeason[statusKey] !== MediaStatus.UNKNOWN &&
          mediaSeason[statusKey] !== MediaStatus.DELETED;

        return held.length > 0 || (isCovered && !isKept) ? null : season;
      }

      if (
        held.some((s) => !s.episodes) ||
        (mediaSeason?.[statusKey] === MediaStatus.AVAILABLE && !isKept)
      ) {
        return null;
      }

      const heldEpisodes = held.flatMap((s) => s.episodes ?? []);
      const episodes = season.episodes.filter(
        (ep) => !heldEpisodes.includes(ep)
      );

      return episodes.length > 0 ? { ...season, episodes } : null;
    })
    .filter((season): season is RequestedSeason => !!season);
};

/**
 * Requests whose completion depends on episodes rather than whole seasons, so
 * the Sonarr scan decides when they are done. A current season request is one
 * too, as its season is usually still airing.
 */
export const isPartialSeriesRequest = (
  request: Pick<MediaRequest, 'monitorMode'> & {
    seasons?: Pick<SeasonRequest, 'episodes'>[];
  }
): boolean =>
  request.monitorMode === MediaRequestMonitorMode.FUTURE ||
  request.monitorMode === MediaRequestMonitorMode.CURRENT ||
  (request.seasons ?? []).some((season) => !!season.episodes?.length);

/**
 * Season list for notifications, such as "1, 2 (E3, E5)".
 */
export const formatRequestedSeasons = (
  seasons: Pick<SeasonRequest, 'seasonNumber' | 'episodes'>[]
): string =>
  seasons
    .map((season) =>
      season.episodes?.length
        ? `${season.seasonNumber} (${season.episodes
            .map((ep) => `E${ep}`)
            .join(', ')})`
        : `${season.seasonNumber}`
    )
    .join(', ');
