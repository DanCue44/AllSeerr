import OpenLibrary, { AUTHOR_ID_REGEX, getOlId } from '@server/api/openlibrary';
import { FollowType } from '@server/constants/media';
import Media from '@server/entity/Media';
import {
  AUTHOR_CATALOG_WORK_PAGES,
  getAuthorWorks,
} from '@server/lib/catalogs';
import { isOnUserWatchlist } from '@server/lib/watchlistStatus';
import logger from '@server/logger';
import { mapAuthorDetails, mapBookResult } from '@server/models/Book';
import { Router } from 'express';

const authorRoutes = Router();

/**
 * Author details and their best known works, by OpenLibrary author id
 */
authorRoutes.get<{ id: string }>('/:id', async (req, res, next) => {
  if (!AUTHOR_ID_REGEX.test(req.params.id)) {
    return next({ status: 404, message: 'Author not found.' });
  }

  const openLibrary = new OpenLibrary();

  try {
    const author = await openLibrary.getAuthor(req.params.id);
    // Prolific authors have thousands of works, the most published come
    // first
    const { works, total } = await getAuthorWorks(
      openLibrary,
      getOlId(author.key)
    );

    const media = await Media.getRelatedBooks(
      works.map((doc) => getOlId(doc.key))
    );
    const mediaMap = new Map(media.map((m) => [m.olId, m]));
    const onUserWatchlist = await isOnUserWatchlist(
      req.user,
      FollowType.AUTHOR,
      getOlId(author.key)
    );

    return res.status(200).json({
      ...mapAuthorDetails(author),
      works: works.map((doc) =>
        mapBookResult(doc, mediaMap.get(getOlId(doc.key)))
      ),
      totalWorks: total,
      onUserWatchlist,
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving author', {
      label: 'API',
      errorMessage: e.message,
      authorId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve author.',
    });
  }
});

/**
 * All the works of an author, for requesting them in one go. The author
 * page shows only the most published ones.
 */
authorRoutes.get<{ id: string }>('/:id/catalog', async (req, res, next) => {
  if (!AUTHOR_ID_REGEX.test(req.params.id)) {
    return next({ status: 404, message: 'Author not found.' });
  }

  const openLibrary = new OpenLibrary();

  try {
    const author = await openLibrary.getAuthor(req.params.id);
    const authorId = getOlId(author.key);
    const { works, total } = await getAuthorWorks(
      openLibrary,
      authorId,
      AUTHOR_CATALOG_WORK_PAGES
    );

    const media = await Media.getRelatedBooks(
      works.map((doc) => getOlId(doc.key))
    );
    const mediaMap = new Map(media.map((m) => [m.olId, m]));

    return res.status(200).json({
      authorId,
      authorName: author.name,
      works: works.map((doc) =>
        mapBookResult(doc, mediaMap.get(getOlId(doc.key)))
      ),
      totalWorks: total,
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving author catalog', {
      label: 'API',
      errorMessage: e.message,
      authorId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve author catalog.',
    });
  }
});

export default authorRoutes;
