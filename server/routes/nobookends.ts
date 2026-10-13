import { ArrActionError } from '@server/lib/arrActions';
import { getNoBookEndsStatus } from '@server/lib/nobookends';
import {
  dismissAttentionItem,
  getAttentionItems,
} from '@server/lib/nobookendsAttention';
import { findNoBookEndsItem } from '@server/lib/nobookendsItem';
import { Permission } from '@server/lib/permissions';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import { Router } from 'express';

const nobookendsRoutes = Router();

// Audiobookshelf item ids are UUIDs, or li_ followed by letters and digits
const ITEM_ID = /^[\w-]{1,100}$/;

// Stuck download keys: chaptarr:<server id>:<download id>:<state>
const ATTENTION_KEY = /^chaptarr:\d+:.{1,300}:[a-z]+$/;

const getHint = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 300)
    : undefined;

/**
 * What the NoBookEnds app may offer the signed in user. The app calls it
 * with the key from its connect link to check the key and the features.
 */
nobookendsRoutes.get('/status', async (req, res, next) => {
  if (!req.user) {
    return next({ status: 403, message: 'Not signed in.' });
  }

  try {
    return res.status(200).json(await getNoBookEndsStatus(req.user));
  } catch (e) {
    logger.error('Failed to read the NoBookEnds status', {
      label: 'NoBookEnds',
      errorMessage: e.message,
    });
    return next({ status: 500, message: 'Unable to read the status.' });
  }
});

/**
 * Book downloads Chaptarr is stuck on, for the app's attention screen
 */
nobookendsRoutes.get(
  '/attention',
  isAuthenticated(Permission.MANAGE_REQUESTS),
  async (_req, res, next) => {
    try {
      return res.status(200).json({ results: await getAttentionItems() });
    } catch (e) {
      logger.error('Failed to list the stuck book downloads', {
        label: 'NoBookEnds',
        errorMessage: e.message,
      });
      return next({ status: 500, message: 'Unable to list the downloads.' });
    }
  }
);

/**
 * Removes a stuck download from Chaptarr and searches for the book again
 */
nobookendsRoutes.post<{ key: string }>(
  '/attention/:key/dismiss',
  isAuthenticated(Permission.MANAGE_REQUESTS),
  async (req, res, next) => {
    const { key } = req.params;

    if (!req.user || !ATTENTION_KEY.test(key)) {
      return next({ status: 400, message: 'Invalid download key.' });
    }

    const blocklist = String(req.query.blocklist ?? '').toLowerCase();

    try {
      return res.status(200).json(
        await dismissAttentionItem(key, req.user, {
          blocklist: blocklist !== 'false' && blocklist !== '0',
        })
      );
    } catch (e) {
      if (e instanceof ArrActionError) {
        return next({ status: e.status, message: e.message });
      }

      logger.error('Failed to remove a stuck book download', {
        label: 'NoBookEnds',
        key,
        errorMessage: e.message,
      });
      return next({ status: 502, message: e.message });
    }
  }
);

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
