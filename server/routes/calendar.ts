import LidarrAPI from '@server/api/servarr/lidarr';
import RadarrAPI from '@server/api/servarr/radarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import TheMovieDb from '@server/api/themoviedb';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type {
  CalendarItem,
  CalendarResponse,
} from '@server/interfaces/api/calendarInterfaces';
import type { CalendarRange } from '@server/lib/calendar';
import {
  applyMediaToCalendarItems,
  dedupeCalendarItems,
  normalizeLidarrCalendar,
  normalizeRadarrCalendar,
  normalizeSonarrCalendar,
  parseCalendarRange,
  shiftDate,
} from '@server/lib/calendar';
import { Permission } from '@server/lib/permissions';
import type { DVRSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';
import { uniqWith } from 'lodash';
import { In } from 'typeorm';

const calendarRoutes = Router();

// Servers pointing at the same instance only need to be asked once
const uniqueServers = <T extends DVRSettings>(servers: T[]): T[] =>
  uniqWith(
    servers,
    (a, b) =>
      a.hostname === b.hostname && a.port === b.port && a.baseUrl === b.baseUrl
  );

const fetchFromServers = async <T extends DVRSettings>(
  servers: T[],
  serviceName: string,
  fetchItems: (server: T) => Promise<CalendarItem[]>
): Promise<CalendarItem[]> => {
  const results = await Promise.all(
    uniqueServers(servers).map(async (server) => {
      try {
        return await fetchItems(server);
      } catch (e) {
        logger.error(
          `Unable to get calendar from ${serviceName} server: ${server.name}`,
          { label: 'Calendar', errorMessage: e.message }
        );
        return [];
      }
    })
  );

  return results.flat();
};

/**
 * Older Sonarr versions do not include the TMDB ID of a series, so it is
 * looked up from the TVDB ID. TMDB responses are cached by the API client.
 */
const resolveSeriesTmdbIds = async (
  items: CalendarItem[]
): Promise<CalendarItem[]> => {
  const tvdbIds = Array.from(
    new Set(
      items
        .filter((item) => item.type === 'episode' && !item.tmdbId)
        .map((item) => item.tvdbId)
        .filter((tvdbId): tvdbId is number => !!tvdbId)
    )
  );

  if (tvdbIds.length === 0) {
    return items;
  }

  const tmdb = new TheMovieDb();
  const tmdbIds = new Map<number, { tmdbId: number; posterPath?: string }>();

  await Promise.all(
    tvdbIds.map(async (tvdbId) => {
      try {
        const response = await tmdb.getByExternalId({
          externalId: tvdbId,
          type: 'tvdb',
        });

        if (response.tv_results[0]) {
          tmdbIds.set(tvdbId, {
            tmdbId: response.tv_results[0].id,
            posterPath: response.tv_results[0].poster_path,
          });
        }
      } catch (e) {
        logger.debug('Unable to find TMDB ID for calendar series', {
          label: 'Calendar',
          tvdbId,
          errorMessage: e.message,
        });
      }
    })
  );

  return items.map((item) => {
    const match =
      item.type === 'episode' && !item.tmdbId && item.tvdbId
        ? tmdbIds.get(item.tvdbId)
        : undefined;

    if (!match) {
      return item;
    }

    return {
      ...item,
      tmdbId: match.tmdbId,
      posterUrl:
        item.posterUrl ??
        (match.posterPath
          ? `https://image.tmdb.org/t/p/w300_and_h450_face${match.posterPath}`
          : undefined),
    };
  });
};

const findCalendarMedia = async (items: CalendarItem[]): Promise<Media[]> => {
  const movieTmdbIds = new Set<number>();
  const seriesTmdbIds = new Set<number>();
  const seriesTvdbIds = new Set<number>();

  items.forEach((item) => {
    if (item.type === 'movie' && item.tmdbId) {
      movieTmdbIds.add(item.tmdbId);
    } else if (item.type === 'episode') {
      if (item.tmdbId) {
        seriesTmdbIds.add(item.tmdbId);
      }

      if (item.tvdbId) {
        seriesTvdbIds.add(item.tvdbId);
      }
    }
  });

  const where = [
    ...(movieTmdbIds.size > 0
      ? [{ mediaType: MediaType.MOVIE, tmdbId: In([...movieTmdbIds]) }]
      : []),
    ...(seriesTmdbIds.size > 0
      ? [{ mediaType: MediaType.TV, tmdbId: In([...seriesTmdbIds]) }]
      : []),
    ...(seriesTvdbIds.size > 0
      ? [{ mediaType: MediaType.TV, tvdbId: In([...seriesTvdbIds]) }]
      : []),
  ];

  if (where.length === 0) {
    return [];
  }

  return getRepository(Media).find({
    where,
    relations: { requests: { requestedBy: true } },
  });
};

calendarRoutes.get<never, CalendarResponse>('/', async (req, res, next) => {
  let range: CalendarRange;

  try {
    range = parseCalendarRange(req.query.start, req.query.end);
  } catch (e) {
    return next({ status: 400, message: e.message });
  }

  try {
    const settings = getSettings();

    // Pad the range by a day so releases near midnight UTC are not missed,
    // the normalized items are then filtered by their calendar day.
    const lookup = {
      start: shiftDate(range.start, -1),
      end: shiftDate(range.end, 1),
    };

    const results = await Promise.all([
      fetchFromServers(settings.radarr, 'Radarr', async (server) => {
        const radarr = new RadarrAPI({
          apiKey: server.apiKey,
          url: RadarrAPI.buildUrl(server, '/api/v3'),
        });

        return normalizeRadarrCalendar(await radarr.getCalendar(lookup), range);
      }),
      fetchFromServers(settings.sonarr, 'Sonarr', async (server) => {
        const sonarr = new SonarrAPI({
          apiKey: server.apiKey,
          url: SonarrAPI.buildUrl(server, '/api/v3'),
        });

        return normalizeSonarrCalendar(await sonarr.getCalendar(lookup), range);
      }),
      fetchFromServers(settings.lidarr ?? [], 'Lidarr', async (server) => {
        const lidarr = new LidarrAPI({
          apiKey: server.apiKey,
          url: LidarrAPI.buildUrl(server, '/api/v1'),
        });

        return normalizeLidarrCalendar(await lidarr.getCalendar(lookup), range);
      }),
    ]);

    const items = await resolveSeriesTmdbIds(
      dedupeCalendarItems(results.flat())
    );
    const media = await findCalendarMedia(items);

    return res.status(200).json({
      start: range.start,
      end: range.end,
      results: applyMediaToCalendarItems(items, media, {
        userId: req.user?.id ?? 0,
        showRequesters: !!req.user?.hasPermission(
          [Permission.MANAGE_REQUESTS, Permission.REQUEST_VIEW],
          { type: 'or' }
        ),
      }),
    });
  } catch (e) {
    logger.error('Something went wrong retrieving the release calendar', {
      label: 'Calendar',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve the release calendar.',
    });
  }
});

export default calendarRoutes;
