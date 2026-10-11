import type { LidarrCalendarAlbum } from '@server/api/servarr/lidarr';
import type { RadarrCalendarMovie } from '@server/api/servarr/radarr';
import type { SonarrCalendarEpisode } from '@server/api/servarr/sonarr';
import { MediaType } from '@server/constants/media';
import type {
  CalendarItem,
  CalendarReleaseType,
  CalendarRequester,
} from '@server/interfaces/api/calendarInterfaces';

export const MAX_CALENDAR_DAYS = 62;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CalendarRange {
  start: string;
  end: string;
}

export interface CalendarMedia {
  id: number;
  mediaType: MediaType;
  tmdbId: number;
  tvdbId?: number | null;
  requests?: {
    requestedBy?: CalendarRequester | null;
  }[];
}

const parseDate = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const time = Date.parse(`${value}T00:00:00Z`);

  // Rejects dates like 2026-02-31 that Date.parse would roll over
  if (isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    return undefined;
  }

  return time;
};

/**
 * Validates the requested start and end dates (YYYY-MM-DD) and makes sure
 * the range does not span more than MAX_CALENDAR_DAYS.
 */
export const parseCalendarRange = (
  start: unknown,
  end: unknown
): CalendarRange => {
  const startTime = parseDate(start);
  const endTime = parseDate(end);

  if (startTime === undefined || endTime === undefined) {
    throw new Error('Start and end must be valid dates (YYYY-MM-DD).');
  }

  if (endTime < startTime) {
    throw new Error('End date must not be before the start date.');
  }

  if ((endTime - startTime) / DAY_MS > MAX_CALENDAR_DAYS) {
    throw new Error(
      `The calendar range cannot be longer than ${MAX_CALENDAR_DAYS} days.`
    );
  }

  return { start: start as string, end: end as string };
};

export const shiftDate = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

const toCalendarDate = (value?: string): string | undefined =>
  value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined;

const isInRange = (date: string, range: CalendarRange): boolean =>
  date >= range.start && date <= range.end;

const findImage = (
  images: { coverType: string; remoteUrl?: string }[] | undefined,
  coverType: string
): string | undefined =>
  images?.find((image) => image.coverType === coverType)?.remoteUrl ||
  undefined;

const padNumber = (value: number): string => value.toString().padStart(2, '0');

/**
 * Radarr returns a movie once even if more than one of its release dates
 * fall within the range, so every release date becomes its own item.
 */
export const normalizeRadarrCalendar = (
  movies: RadarrCalendarMovie[],
  range: CalendarRange
): CalendarItem[] => {
  const releases: [CalendarReleaseType, keyof RadarrCalendarMovie][] = [
    ['cinema', 'inCinemas'],
    ['digital', 'digitalRelease'],
    ['physical', 'physicalRelease'],
  ];

  return movies.flatMap((movie) =>
    releases.flatMap(([releaseType, key]) => {
      const date = toCalendarDate(movie[key] as string | undefined);

      if (!date || !isInRange(date, range)) {
        return [];
      }

      return [
        {
          id: `movie-${movie.tmdbId}-${releaseType}`,
          type: 'movie' as const,
          date,
          releaseType,
          title: movie.title,
          subtitle: movie.year ? movie.year.toString() : undefined,
          tmdbId: movie.tmdbId || undefined,
          posterUrl: findImage(movie.images, 'poster'),
          hasFile: !!movie.hasFile,
          requestedByMe: false,
        },
      ];
    })
  );
};

export const normalizeSonarrCalendar = (
  episodes: SonarrCalendarEpisode[],
  range: CalendarRange
): CalendarItem[] =>
  episodes.flatMap((episode) => {
    const date = toCalendarDate(episode.airDate ?? episode.airDateUtc);

    if (!date || !isInRange(date, range)) {
      return [];
    }

    const series = episode.series;
    const episodeCode = `S${padNumber(episode.seasonNumber)}E${padNumber(
      episode.episodeNumber
    )}`;

    return [
      {
        id: `episode-${series?.tvdbId ?? episode.seriesId}-${
          episode.seasonNumber
        }-${episode.episodeNumber}`,
        type: 'episode' as const,
        date,
        airDateUtc: episode.airDateUtc,
        releaseType: 'airing' as const,
        title: series?.title ?? episodeCode,
        subtitle: episode.title
          ? `${episodeCode} - ${episode.title}`
          : episodeCode,
        tmdbId: series?.tmdbId || undefined,
        tvdbId: series?.tvdbId || undefined,
        posterUrl: findImage(series?.images, 'poster'),
        hasFile: !!episode.hasFile,
        requestedByMe: false,
      },
    ];
  });

export const normalizeLidarrCalendar = (
  albums: LidarrCalendarAlbum[],
  range: CalendarRange
): CalendarItem[] =>
  albums.flatMap((album) => {
    const date = toCalendarDate(album.releaseDate);

    if (!date || !isInRange(date, range)) {
      return [];
    }

    return [
      {
        id: `album-${album.foreignAlbumId}`,
        type: 'album' as const,
        date,
        releaseType: 'release' as const,
        title: album.title,
        subtitle: album.artist?.artistName,
        posterUrl: findImage(album.images, 'cover'),
        hasFile: (album.statistics?.percentOfTracks ?? 0) >= 100,
        requestedByMe: false,
      },
    ];
  });

/**
 * The same title can be on more than one server (for example a 4K and a
 * non-4K instance), so items are merged by id and sorted by date.
 */
export const dedupeCalendarItems = (items: CalendarItem[]): CalendarItem[] => {
  const merged = new Map<string, CalendarItem>();

  items.forEach((item) => {
    const existing = merged.get(item.id);

    if (!existing) {
      merged.set(item.id, { ...item });
      return;
    }

    existing.hasFile = existing.hasFile || item.hasFile;
    existing.tmdbId = existing.tmdbId ?? item.tmdbId;
    existing.tvdbId = existing.tvdbId ?? item.tvdbId;
    existing.posterUrl = existing.posterUrl ?? item.posterUrl;
  });

  return Array.from(merged.values()).sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.airDateUtc ?? '').localeCompare(b.airDateUtc ?? '') ||
      a.title.localeCompare(b.title)
  );
};

/**
 * Links calendar items to their media and marks the ones the user
 * requested. Requesters are only included when showRequesters is set.
 */
export const applyMediaToCalendarItems = (
  items: CalendarItem[],
  media: CalendarMedia[],
  { userId, showRequesters }: { userId: number; showRequesters: boolean }
): CalendarItem[] => {
  const movies = new Map<number, CalendarMedia>();
  const seriesByTvdbId = new Map<number, CalendarMedia>();
  const seriesByTmdbId = new Map<number, CalendarMedia>();

  media.forEach((m) => {
    if (m.mediaType === MediaType.MOVIE) {
      movies.set(m.tmdbId, m);
    } else {
      seriesByTmdbId.set(m.tmdbId, m);

      if (m.tvdbId) {
        seriesByTvdbId.set(m.tvdbId, m);
      }
    }
  });

  return items.map((item) => {
    let match: CalendarMedia | undefined;

    if (item.type === 'movie' && item.tmdbId) {
      match = movies.get(item.tmdbId);
    } else if (item.type === 'episode') {
      match =
        (item.tvdbId ? seriesByTvdbId.get(item.tvdbId) : undefined) ??
        (item.tmdbId ? seriesByTmdbId.get(item.tmdbId) : undefined);
    }

    if (!match) {
      return item;
    }

    const requesters = new Map<number, CalendarRequester>();

    (match.requests ?? []).forEach((request) => {
      if (request.requestedBy) {
        requesters.set(request.requestedBy.id, {
          id: request.requestedBy.id,
          displayName: request.requestedBy.displayName,
          avatar: request.requestedBy.avatar,
        });
      }
    });

    return {
      ...item,
      tmdbId: item.tmdbId ?? match.tmdbId,
      mediaId: match.id,
      requestedBy:
        showRequesters && requesters.size > 0
          ? Array.from(requesters.values())
          : undefined,
      requestedByMe: requesters.has(userId),
    };
  });
};
