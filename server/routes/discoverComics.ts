import type { TalearrComicDiscoverList } from '@server/api/servarr/talearrComics';
import MediaRequest from '@server/entity/MediaRequest';
import type { ComicDiscoverPage } from '@server/lib/comics';
import {
  discoverComics,
  getComicsStatus,
  interleaveComics,
  mapComicResults,
} from '@server/lib/comics';
import { canRequestComic } from '@server/lib/userAccess/ageLimits';
import logger from '@server/logger';
import type { RequestHandler } from 'express';
import { Router } from 'express';

const discoverComicsRoutes = Router();

// The lists do not report their length, so they stop after a few pages
const MAX_PAGES = 10;
const PAGE_SIZE = 20;

/**
 * Answers one page of comic or manga series, mapped like search results.
 * A person with an age limit is not shown series rated above it, as they
 * could not request them. A Talearr without discover lists answers an
 * empty page, so the rows stay hidden.
 */
const discoverHandler =
  (
    load: (page: number) => Promise<ComicDiscoverPage>,
    description: string
  ): RequestHandler =>
  async (req, res, next) => {
    const page = Math.min(Math.max(Number(req.query.page) || 1, 1), MAX_PAGES);

    try {
      const status = await getComicsStatus();

      if (!status.enabled) {
        return next({ status: 404, message: 'Comics are not turned on.' });
      }

      const { results, notices } = await load(page);
      const ageLimit = req.user
        ? await MediaRequest.getRequestAgeLimit(req.user)
        : null;
      const allowed = results.filter((row) => canRequestComic(ageLimit, row));
      const isLastPage = results.length === 0 || page >= MAX_PAGES;

      return res.status(200).json({
        page,
        totalPages: isLastPage ? page : page + 1,
        totalResults: (page - 1) * PAGE_SIZE + allowed.length,
        results: await mapComicResults(allowed, (m) => m.filter(req.user)),
        notices,
      });
    } catch (e) {
      logger.debug(`Something went wrong retrieving ${description}`, {
        label: 'API',
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      return next({
        status: 500,
        message: `Unable to retrieve ${description}.`,
      });
    }
  };

const listHandler = (list: TalearrComicDiscoverList, description: string) =>
  discoverHandler((page) => discoverComics(list, page), description);

/**
 * Trending manga and popular Western comics, taking turns, for the mixed
 * row on the For You home
 */
discoverComicsRoutes.get(
  '/',
  discoverHandler(async (page) => {
    const [manga, comics] = await Promise.all([
      discoverComics('trending', page),
      discoverComics('comics', page),
    ]);

    return {
      results: interleaveComics([manga.results, comics.results]),
      notices: [...new Set([...manga.notices, ...comics.notices])],
    };
  }, 'trending comics')
);

/**
 * Manga trending on AniList now
 */
discoverComicsRoutes.get(
  '/trending',
  listHandler('trending', 'trending manga')
);

/**
 * The most popular manga on AniList
 */
discoverComicsRoutes.get('/popular', listHandler('popular', 'popular manga'));

/**
 * Manga releasing now on AniList, newest first
 */
discoverComicsRoutes.get('/releasing', listHandler('releasing', 'new manga'));

/**
 * Popular Western comics, a list Talearr keeps from Hardcover
 */
discoverComicsRoutes.get('/western', listHandler('comics', 'popular comics'));

export default discoverComicsRoutes;
