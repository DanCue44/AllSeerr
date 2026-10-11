import type { RadarrMovie } from '@server/api/servarr/radarr';
import RadarrAPI from '@server/api/servarr/radarr';
import type { SonarrEpisodeFile } from '@server/api/servarr/sonarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import { MediaType } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type { MediaFileInfo } from '@server/interfaces/api/mediaInterfaces';
import type { RadarrSettings, SonarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';

type MovieFile = NonNullable<RadarrMovie['movieFile']>;
type ServarrMediaInfo = NonNullable<SonarrEpisodeFile['mediaInfo']>;

/**
 * Radarr and Sonarr report audio languages and subtitles as a single
 * slash separated string ("English/Spanish").
 */
export const splitLanguages = (value?: string): string[] =>
  value
    ? value
        .split('/')
        .map((language) => language.trim())
        .filter((language) => language.length > 0)
    : [];

const fileNameFromPath = (path?: string, relativePath?: string): string => {
  const source = relativePath ?? path ?? '';
  const parts = source.split(/[\\/]/);
  return parts[parts.length - 1] ?? source;
};

const normalizeMediaInfo = (
  mediaInfo?: Partial<ServarrMediaInfo>
): MediaFileInfo['mediaInfo'] => {
  if (!mediaInfo) {
    return undefined;
  }

  return {
    videoCodec: mediaInfo.videoCodec,
    videoBitDepth: mediaInfo.videoBitDepth,
    videoBitrate: mediaInfo.videoBitrate,
    videoFps: mediaInfo.videoFps,
    videoDynamicRange:
      mediaInfo.videoDynamicRangeType || mediaInfo.videoDynamicRange,
    resolution: mediaInfo.resolution,
    scanType: mediaInfo.scanType,
    runTime: mediaInfo.runTime,
    audioCodec: mediaInfo.audioCodec,
    audioChannels: mediaInfo.audioChannels,
    audioBitrate: mediaInfo.audioBitrate,
    audioStreamCount: mediaInfo.audioStreamCount,
    audioLanguages: splitLanguages(mediaInfo.audioLanguages),
    subtitles: splitLanguages(mediaInfo.subtitles),
  };
};

export const normalizeMovieFile = (
  file: MovieFile,
  includePath: boolean
): MediaFileInfo => ({
  id: file.id,
  fileName: fileNameFromPath(file.path, file.relativePath),
  path: includePath ? file.path : undefined,
  size: file.size,
  dateAdded: file.dateAdded,
  quality: file.quality?.quality.name,
  resolution: file.quality?.quality.resolution,
  releaseGroup: file.releaseGroup,
  sceneName: file.sceneName,
  edition: file.edition,
  languages: (file.languages ?? []).map((language) => language.name),
  mediaInfo: normalizeMediaInfo(file.mediaInfo),
});

export const normalizeEpisodeFile = (
  file: SonarrEpisodeFile,
  episodeNumbers: number[],
  includePath: boolean
): MediaFileInfo => ({
  id: file.id,
  fileName: fileNameFromPath(file.path, file.relativePath),
  path: includePath ? file.path : undefined,
  size: file.size,
  dateAdded: file.dateAdded,
  quality: file.quality?.quality.name,
  resolution: file.quality?.quality.resolution,
  releaseGroup: file.releaseGroup,
  sceneName: file.sceneName,
  languages: (file.languages ?? []).map((language) => language.name),
  seasonNumber: file.seasonNumber,
  episodeNumbers,
  mediaInfo: normalizeMediaInfo(file.mediaInfo),
});

/**
 * Finds the Radarr or Sonarr server that holds this media, preferring the
 * server it was added to and falling back to the default server.
 */
export const getMediaServiceSettings = (
  media: Media,
  is4k: boolean
): RadarrSettings | SonarrSettings | undefined => {
  const settings = getSettings();
  const servers: (RadarrSettings | SonarrSettings)[] =
    media.mediaType === MediaType.MOVIE ? settings.radarr : settings.sonarr;
  const serviceId = is4k ? media.serviceId4k : media.serviceId;

  if (serviceId !== undefined && serviceId !== null && serviceId >= 0) {
    const server = servers.find((s) => s.id === serviceId);
    if (server) {
      return server;
    }
  }

  return servers.find((s) => s.isDefault && s.is4k === is4k);
};

/**
 * Returns the files on disk for a movie or series, or undefined when the
 * media is not tracked by Radarr or Sonarr.
 */
export const getMediaFiles = async (
  media: Media,
  is4k: boolean,
  includePath: boolean
): Promise<MediaFileInfo[] | undefined> => {
  const externalServiceId = is4k
    ? media.externalServiceId4k
    : media.externalServiceId;

  if (externalServiceId === undefined || externalServiceId === null) {
    return undefined;
  }

  const serviceSettings = getMediaServiceSettings(media, is4k);

  if (!serviceSettings) {
    return undefined;
  }

  if (media.mediaType === MediaType.MOVIE) {
    const radarr = new RadarrAPI({
      apiKey: serviceSettings.apiKey,
      url: RadarrAPI.buildUrl(serviceSettings, '/api/v3'),
    });
    const movie = await radarr.getMovie({ id: externalServiceId });

    return movie.movieFile
      ? [normalizeMovieFile(movie.movieFile, includePath)]
      : [];
  }

  const sonarr = new SonarrAPI({
    apiKey: serviceSettings.apiKey,
    url: SonarrAPI.buildUrl(serviceSettings, '/api/v3'),
  });
  const [episodeFiles, episodes] = await Promise.all([
    sonarr.getEpisodeFiles(externalServiceId),
    sonarr.getEpisodes(externalServiceId),
  ]);

  const episodesByFile = new Map<number, number[]>();
  for (const episode of episodes) {
    if (!episode.episodeFileId) {
      continue;
    }
    const numbers = episodesByFile.get(episode.episodeFileId) ?? [];
    numbers.push(episode.episodeNumber);
    episodesByFile.set(episode.episodeFileId, numbers);
  }

  return episodeFiles
    .map((file) =>
      normalizeEpisodeFile(
        file,
        (episodesByFile.get(file.id) ?? []).sort((a, b) => a - b),
        includePath
      )
    )
    .sort(
      (a, b) =>
        (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) ||
        (a.episodeNumbers?.[0] ?? 0) - (b.episodeNumbers?.[0] ?? 0)
    );
};
