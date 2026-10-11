import SonarrAPI from '@server/api/servarr/sonarr';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { getMediaServiceSettings } from '@server/lib/mediaFiles';
import logger from '@server/logger';

/**
 * Seerr only tracks seasons, so whether each episode is in the library comes
 * from Sonarr: an episode with a file is available, one in the download
 * queue is downloading, and a monitored one without a file is missing once
 * it has aired, or wanted before that.
 */
export type EpisodeAvailability =
  | 'available'
  | 'downloading'
  | 'missing'
  | 'wanted'
  | 'unmonitored';

export interface SonarrEpisodeState {
  episodeNumber: number;
  hasFile: boolean;
  monitored: boolean;
  airDateUtc?: string | null;
  queued: boolean;
}

export const getEpisodeAvailability = (
  episode: SonarrEpisodeState,
  now = new Date()
): EpisodeAvailability => {
  if (episode.hasFile) {
    return 'available';
  }
  if (episode.queued) {
    return 'downloading';
  }
  if (!episode.monitored) {
    return 'unmonitored';
  }
  const aired =
    !!episode.airDateUtc && new Date(episode.airDateUtc).getTime() <= +now;

  return aired ? 'missing' : 'wanted';
};

const CACHE_MS = 2 * 60 * 1000;
const cache = new Map<
  string,
  { at: number; value: Record<number, EpisodeAvailability> }
>();

/**
 * The availability of each episode of a season, keyed by episode number.
 * Empty when the series is not in Sonarr or Sonarr cannot be reached.
 */
export const getSeasonEpisodeAvailability = async (
  tmdbId: number,
  seasonNumber: number
): Promise<Record<number, EpisodeAvailability>> => {
  const key = `${tmdbId}:${seasonNumber}`;
  const cached = cache.get(key);

  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.value;
  }

  const media = await getRepository(Media).findOne({
    where: { tmdbId, mediaType: MediaType.TV },
  });
  const server = media ? getMediaServiceSettings(media, false) : undefined;

  if (!media || !server) {
    return {};
  }

  try {
    const sonarr = new SonarrAPI({
      apiKey: server.apiKey,
      url: SonarrAPI.buildUrl(server, '/api/v3'),
    });
    let seriesId = media.externalServiceId ?? undefined;

    if (!seriesId && media.tvdbId) {
      seriesId = (await sonarr.getSeriesByTvdbId(media.tvdbId))?.id;
    }
    if (!seriesId) {
      return {};
    }

    const [episodes, queue] = await Promise.all([
      sonarr.getEpisodes(seriesId),
      sonarr.getQueue().catch(() => []),
    ]);
    const queuedIds = new Set(
      queue
        .filter((item) => item.seriesId === seriesId)
        .map((item) => item.episodeId)
    );
    const value: Record<number, EpisodeAvailability> = {};

    for (const episode of episodes) {
      if (episode.seasonNumber === seasonNumber) {
        value[episode.episodeNumber] = getEpisodeAvailability({
          episodeNumber: episode.episodeNumber,
          hasFile: episode.hasFile,
          monitored: episode.monitored,
          airDateUtc: episode.airDateUtc,
          queued: queuedIds.has(episode.id),
        });
      }
    }

    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    logger.debug('Could not read episode availability from Sonarr', {
      label: 'Episode Availability',
      tmdbId,
      seasonNumber,
      errorMessage: e.message,
    });
    return {};
  }
};
