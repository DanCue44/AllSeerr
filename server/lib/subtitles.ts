import type {
  BazarrEpisode,
  BazarrLanguage,
  BazarrLanguageProfile,
  BazarrSubtitle,
  BazarrSystemLanguage,
} from '@server/api/bazarr';
import BazarrAPI from '@server/api/bazarr';
import { MediaType } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type {
  EpisodeSubtitleStatus,
  MediaSubtitlesResponse,
  SubtitleLanguage,
  SubtitleTrack,
} from '@server/interfaces/api/subtitleInterfaces';
import { getSettings } from '@server/lib/settings';

export const isBazarrConfigured = (): boolean => {
  const settings = getSettings().bazarr;
  return !!(settings.hostname && settings.port && settings.apiKey);
};

export const getBazarr = (): BazarrAPI => new BazarrAPI(getSettings().bazarr);

const isTrue = (value: string | boolean | undefined): boolean =>
  value === true || String(value).toLowerCase() === 'true';

export const normalizeLanguage = (
  language: BazarrLanguage
): SubtitleLanguage => ({
  code: language.code2,
  name: language.name,
  forced: !!language.forced,
  hi: !!language.hi,
});

export const normalizeSubtitle = (subtitle: BazarrSubtitle): SubtitleTrack => {
  const embedded =
    subtitle.embedded_track_id !== undefined &&
    subtitle.embedded_track_id !== null;
  const fileName = subtitle.path
    ? subtitle.path.split(/[\\/]/).pop()
    : undefined;

  return {
    ...normalizeLanguage(subtitle),
    embedded,
    fileName,
    size: subtitle.file_size ?? undefined,
  };
};

/**
 * Turns a Bazarr language profile into the list of languages it wants,
 * using the system language list for display names.
 */
export const profileLanguages = (
  profile: BazarrLanguageProfile | undefined,
  languages: BazarrSystemLanguage[]
): SubtitleLanguage[] => {
  if (!profile) {
    return [];
  }

  return profile.items.map((item) => ({
    code: item.language,
    name:
      languages.find((language) => language.code2 === item.language)?.name ??
      item.language,
    forced: isTrue(item.forced),
    hi: isTrue(item.hi),
  }));
};

export const normalizeEpisode = (
  episode: BazarrEpisode
): EpisodeSubtitleStatus => ({
  seasonNumber: episode.season,
  episodeNumber: episode.episode,
  title: episode.title,
  subtitles: episode.subtitles.map(normalizeSubtitle),
  missing: episode.missing_subtitles.map(normalizeLanguage),
});

/**
 * Collects subtitle status from Bazarr for a movie or series. Bazarr keys
 * items by their Radarr and Sonarr ids, which Media already stores.
 * Returns undefined when the media is not in Radarr or Sonarr.
 */
export const getMediaSubtitles = async (
  media: Media
): Promise<MediaSubtitlesResponse | undefined> => {
  if (
    media.externalServiceId === undefined ||
    media.externalServiceId === null
  ) {
    return undefined;
  }

  const bazarr = getBazarr();
  const [languages, profiles] = await Promise.all([
    bazarr.getLanguages(),
    bazarr.getLanguageProfiles(),
  ]);
  const available = languages
    .filter((language) => language.enabled)
    .map((language) => ({ code: language.code2, name: language.name }));

  if (media.mediaType === MediaType.MOVIE) {
    const movie = await bazarr.getMovie(media.externalServiceId);

    if (!movie) {
      return undefined;
    }

    return {
      wanted: profileLanguages(
        profiles.find((profile) => profile.profileId === movie.profileId),
        languages
      ),
      available,
      movie: {
        subtitles: movie.subtitles.map(normalizeSubtitle),
        missing: movie.missing_subtitles.map(normalizeLanguage),
      },
    };
  }

  const [series, episodes] = await Promise.all([
    bazarr.getSeries(media.externalServiceId),
    bazarr.getEpisodes(media.externalServiceId),
  ]);

  if (!series) {
    return undefined;
  }

  return {
    wanted: profileLanguages(
      profiles.find((profile) => profile.profileId === series.profileId),
      languages
    ),
    available,
    episodes: episodes
      .map(normalizeEpisode)
      .sort(
        (a, b) =>
          a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber
      ),
  };
};

/**
 * Starts a Bazarr search for one subtitle language. For series, a season
 * and episode number pick the episode.
 */
export const searchMediaSubtitles = async (
  media: Media,
  options: {
    language: string;
    forced?: boolean;
    hi?: boolean;
    seasonNumber?: number;
    episodeNumber?: number;
  }
): Promise<void> => {
  if (
    media.externalServiceId === undefined ||
    media.externalServiceId === null
  ) {
    throw new Error('Media is not tracked by Radarr or Sonarr');
  }

  const bazarr = getBazarr();
  const search = {
    language: options.language,
    forced: options.forced,
    hi: options.hi,
  };

  if (media.mediaType === MediaType.MOVIE) {
    await bazarr.searchMovieSubtitles(media.externalServiceId, search);
    return;
  }

  const episodes = await bazarr.getEpisodes(media.externalServiceId);
  const episode = episodes.find(
    (e) =>
      e.season === options.seasonNumber && e.episode === options.episodeNumber
  );

  if (!episode) {
    throw new Error('Episode not found in Bazarr');
  }

  await bazarr.searchEpisodeSubtitles(
    media.externalServiceId,
    episode.sonarrEpisodeId,
    search
  );
};
