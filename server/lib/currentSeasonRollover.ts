import {
  MediaRequestMonitorMode,
  MediaRequestStatus,
  MediaStatus,
} from '@server/constants/media';

/**
 * Current season requests keep only the season that is airing. Once a newer
 * season has started in Sonarr, the older seasons are unmonitored and their
 * files deleted.
 *
 * A season counts as started once one of its episodes has aired (per the air
 * dates Sonarr has) AND has a file in Sonarr. Air dates alone are not enough,
 * as announced dates move and a season can air without being downloadable
 * yet, which would leave the series with nothing to watch. A file alone is not
 * enough either, as an early or mislabeled release could wipe a season that
 * is still current.
 */

export interface RolloverRequest {
  id: number;
  is4k: boolean;
  status: MediaRequestStatus;
  monitorMode?: MediaRequestMonitorMode | null;
  seasons: { seasonNumber: number }[];
}

export interface RolloverEpisode {
  id: number;
  seasonNumber: number;
  hasFile: boolean;
  episodeFileId?: number;
  monitored: boolean;
  airDateUtc?: string | null;
}

export interface RolloverSonarrSeason {
  seasonNumber: number;
  monitored: boolean;
}

export interface RolloverMediaSeason {
  seasonNumber: number;
  status: MediaStatus;
  status4k: MediaStatus;
}

export type RolloverSkipReason =
  | 'no-current-request'
  | 'other-requests'
  | 'no-aired-episodes'
  | 'behind-request'
  | 'no-aired-file';

export interface RollOff {
  // Older seasons that still have files or monitored episodes in Sonarr
  seasons: number[];
  episodeIdsToUnmonitor: number[];
  episodeFileIds: number[];
  // Seerr season rows that should now show as deleted
  seasonsToMarkDeleted: number[];
  // Current season requests that still point at an older season
  requestIdsToMove: number[];
}

export interface CurrentSeasonPlan {
  currentSeason: number | null;
  skipReason?: RolloverSkipReason;
  // Monitoring for the current and later seasons, which also runs before a
  // roll off is allowed so Sonarr picks up the new season
  seasonsToMonitor: number[];
  seasonsToUnmonitor: number[];
  episodeIdsToMonitor: number[];
  episodeIdsToSearch: number[];
  rollOff: RollOff | null;
}

const ACTIVE_STATUSES = [
  MediaRequestStatus.PENDING,
  MediaRequestStatus.APPROVED,
  MediaRequestStatus.COMPLETED,
];

const LIVE_SEASON_STATUSES = [
  MediaStatus.AVAILABLE,
  MediaStatus.PARTIALLY_AVAILABLE,
  MediaStatus.PROCESSING,
];

const unique = (values: number[]): number[] =>
  Array.from(new Set(values)).sort((a, b) => a - b);

const emptyPlan = (
  skipReason: RolloverSkipReason,
  currentSeason: number | null = null
): CurrentSeasonPlan => ({
  currentSeason,
  skipReason,
  seasonsToMonitor: [],
  seasonsToUnmonitor: [],
  episodeIdsToMonitor: [],
  episodeIdsToSearch: [],
  rollOff: null,
});

/**
 * Decides what a Sonarr scan does for a series with current season requests.
 * It is pure so every safety rule can be tested on its own:
 *
 * - Only series with an approved or completed current season request are
 *   touched, and only when every active request of the same quality (4K or
 *   not) is a current season one. Any other request wants seasons kept.
 * - Specials (season 0) are never monitored, unmonitored or deleted.
 * - Nothing is deleted until the newest season with an aired episode also
 *   has an aired episode with a file.
 * - That season and anything newer is never deleted, and neither is the
 *   newest season Sonarr knows.
 * - A request is never moved back to an older season than it follows.
 * - Running it again after a roll off finds nothing left to do.
 */
export const planCurrentSeasonRollover = (
  {
    requests,
    episodes,
    sonarrSeasons,
    mediaSeasons,
    is4k,
  }: {
    requests: RolloverRequest[];
    episodes: RolloverEpisode[];
    sonarrSeasons: RolloverSonarrSeason[];
    mediaSeasons: RolloverMediaSeason[];
    is4k: boolean;
  },
  now = new Date()
): CurrentSeasonPlan => {
  const activeRequests = requests.filter(
    (request) =>
      request.is4k === is4k && ACTIVE_STATUSES.includes(request.status)
  );
  const currentRequests = activeRequests.filter(
    (request) => request.monitorMode === MediaRequestMonitorMode.CURRENT
  );

  if (
    !currentRequests.some(
      (request) =>
        request.status === MediaRequestStatus.APPROVED ||
        request.status === MediaRequestStatus.COMPLETED
    )
  ) {
    return emptyPlan('no-current-request');
  }

  if (currentRequests.length !== activeRequests.length) {
    return emptyPlan('other-requests');
  }

  const isAired = (episode: RolloverEpisode): boolean =>
    !!episode.airDateUtc && new Date(episode.airDateUtc) <= now;
  const regularEpisodes = episodes.filter(
    (episode) => episode.seasonNumber > 0
  );
  const airedSeasons = regularEpisodes
    .filter(isAired)
    .map((episode) => episode.seasonNumber);

  if (airedSeasons.length === 0) {
    return emptyPlan('no-aired-episodes');
  }

  const currentSeason = Math.max(...airedSeasons);
  const newestSeason = Math.max(
    ...regularEpisodes.map((episode) => episode.seasonNumber),
    ...sonarrSeasons.map((season) => season.seasonNumber)
  );

  // The current and later seasons are followed, the later ones as they air
  const followedEpisodes = regularEpisodes.filter(
    (episode) => episode.seasonNumber >= currentSeason
  );
  const episodesToMonitor = followedEpisodes.filter(
    (episode) => !episode.monitored
  );

  const plan: CurrentSeasonPlan = {
    currentSeason,
    seasonsToMonitor: unique(
      sonarrSeasons
        .filter(
          (season) => season.seasonNumber >= currentSeason && !season.monitored
        )
        .map((season) => season.seasonNumber)
    ),
    seasonsToUnmonitor: [],
    episodeIdsToMonitor: episodesToMonitor.map((episode) => episode.id),
    episodeIdsToSearch: episodesToMonitor
      .filter((episode) => isAired(episode) && !episode.hasFile)
      .map((episode) => episode.id),
    rollOff: null,
  };

  const followedSeason = Math.max(
    ...currentRequests.flatMap((request) =>
      request.seasons.map((season) => season.seasonNumber)
    ),
    0
  );

  // Sonarr has not seen the season the request follows air yet
  if (currentSeason < followedSeason) {
    return { ...plan, skipReason: 'behind-request' };
  }

  const hasAiredFile = regularEpisodes.some(
    (episode) =>
      episode.seasonNumber === currentSeason &&
      isAired(episode) &&
      episode.hasFile
  );

  if (!hasAiredFile) {
    return { ...plan, skipReason: 'no-aired-file' };
  }

  const isOlder = (seasonNumber: number): boolean =>
    seasonNumber > 0 &&
    seasonNumber < currentSeason &&
    seasonNumber !== newestSeason;

  const olderEpisodes = regularEpisodes.filter((episode) =>
    isOlder(episode.seasonNumber)
  );
  const statusKey = is4k ? 'status4k' : 'status';

  const rollOff: RollOff = {
    seasons: unique(
      olderEpisodes
        .filter((episode) => episode.hasFile || episode.monitored)
        .map((episode) => episode.seasonNumber)
    ),
    episodeIdsToUnmonitor: olderEpisodes
      .filter((episode) => episode.monitored)
      .map((episode) => episode.id),
    episodeFileIds: unique(
      olderEpisodes
        .filter((episode) => episode.hasFile && !!episode.episodeFileId)
        .map((episode) => episode.episodeFileId as number)
    ),
    seasonsToMarkDeleted: unique(
      mediaSeasons
        .filter(
          (season) =>
            isOlder(season.seasonNumber) &&
            LIVE_SEASON_STATUSES.includes(season[statusKey])
        )
        .map((season) => season.seasonNumber)
    ),
    requestIdsToMove: currentRequests
      .filter(
        (request) =>
          request.seasons.length !== 1 ||
          request.seasons[0].seasonNumber !== currentSeason
      )
      .map((request) => request.id),
  };

  plan.seasonsToUnmonitor = unique(
    sonarrSeasons
      .filter((season) => isOlder(season.seasonNumber) && season.monitored)
      .map((season) => season.seasonNumber)
  );

  const hasWork =
    rollOff.seasons.length > 0 ||
    rollOff.episodeIdsToUnmonitor.length > 0 ||
    rollOff.episodeFileIds.length > 0 ||
    rollOff.seasonsToMarkDeleted.length > 0 ||
    rollOff.requestIdsToMove.length > 0;

  return { ...plan, rollOff: hasWork ? rollOff : null };
};
