import {
  DuplicateWatchlistRequestError,
  NotFoundError,
  Watchlist,
} from '@server/entity/Watchlist';
import logger from '@server/logger';
import { Router } from 'express';
import { QueryFailedError } from 'typeorm';

import { watchlistCreate } from '@server/interfaces/api/watchlistCreate';
import { isValidMediaListId, isWatchlistType } from '@server/lib/mediaListKeys';
import { ZodError } from 'zod';

const watchlistRoutes = Router();

watchlistRoutes.post<never, Watchlist, Watchlist>(
  '/',
  async (req, res, next) => {
    try {
      if (!req.user) {
        return next({
          status: 401,
          message: 'You must be logged in to add watchlist.',
        });
      }
      const values = watchlistCreate.parse(req.body);

      const request = await Watchlist.createWatchlist({
        watchlistRequest: values,
        user: req.user,
      });
      return res.status(201).json(request);
    } catch (error) {
      if (!(error instanceof Error)) {
        return;
      }
      if (error instanceof ZodError) {
        return next({ status: 400, message: error.message });
      }
      switch (error.constructor) {
        case QueryFailedError:
          logger.warn('Something wrong with data watchlist', {
            tmdbId: req.body.tmdbId,
            mbId: req.body.mbId,
            olId: req.body.olId,
            mediaType: req.body.mediaType,
            label: 'Watchlist',
          });
          return next({ status: 409, message: 'Something wrong' });
        case DuplicateWatchlistRequestError:
          return next({ status: 409, message: error.message });
        default:
          return next({ status: 500, message: error.message });
      }
    }
  }
);

watchlistRoutes.delete('/:tmdbId', async (req, res, next) => {
  if (!req.user) {
    return next({
      status: 401,
      message: 'You must be logged in to delete watchlist data.',
    });
  }
  try {
    // Albums are removed by MusicBrainz release group id and books by
    // OpenLibrary work id, in place of the TMDB id. Followed artists and
    // authors by MusicBrainz artist id and OpenLibrary author id.
    const mediaType = req.query.mediaType;
    if (
      !isWatchlistType(mediaType) ||
      !isValidMediaListId(mediaType, req.params.tmdbId)
    ) {
      return next({
        status: 400,
        message: 'Invalid mediaType query parameter.',
      });
    }

    await Watchlist.deleteWatchlist(req.params.tmdbId, mediaType, req.user);
    return res.status(204).send();
  } catch (e) {
    if (e instanceof NotFoundError) {
      return next({
        status: 404,
        message: e.message,
      });
    }
    return next({ status: 500, message: e.message });
  }
});

export default watchlistRoutes;
