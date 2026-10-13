import { getNoBookEndsStatus } from '@server/lib/nobookends';
import { findNoBookEndsItem } from '@server/lib/nobookendsItem';
import logger from '@server/logger';
import { Router } from 'express';

const nobookendsRoutes = Router();

// Audiobookshelf item ids are UUIDs, or li_ followed by letters and digits
const ITEM_ID = /^[\w-]{1,100}$/;

const getHint = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 300)
    : undefined;

/**
 * What the NoBookEnds app may offer the signed in user. The app calls it
 * with the key from its connect link to check the key and the features.
 */
nobookendsRoutes.get('/status', (req, res, next) => {
  if (!req.user) {
    return next({ status: 403, message: 'Not signed in.' });
  }

  return res.status(200).json(getNoBookEndsStatus(req.user));
});

/**
 * The book an Audiobookshelf library item is of, so the app can show its
 * request status or report an issue with it
 */
nobookendsRoutes.get<{ absItemId: string }>(
  '/item/:absItemId',
  async (req, res, next) => {
    if (!req.user) {
      return next({ status: 403, message: 'Not signed in.' });
    }

    const { absItemId } = req.params;

    if (!ITEM_ID.test(absItemId)) {
      return next({ status: 400, message: 'Invalid item id.' });
    }

    try {
      const item = await findNoBookEndsItem(absItemId, {
        title: getHint(req.query.title),
        author: getHint(req.query.author),
      });

      if (!item) {
        return next({ status: 404, message: 'Book not found.' });
      }

      return res.status(200).json(item);
    } catch (e) {
      logger.debug('Failed to find the book of an Audiobookshelf item', {
        label: 'NoBookEnds',
        absItemId,
        errorMessage: e.message,
      });
      return next({ status: 500, message: 'Unable to find the book.' });
    }
  }
);

export default nobookendsRoutes;
