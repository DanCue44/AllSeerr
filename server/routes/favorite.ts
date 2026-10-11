import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Favorite from '@server/entity/Favorite';
import type {
  FavoriteItem,
  FavoriteRequestBody,
  FavoriteResultsResponse,
} from '@server/interfaces/api/favoriteInterfaces';
import {
  getMediaListBodyKey,
  getMediaListKey,
  isMediaListType,
  isValidMediaListId,
} from '@server/lib/mediaListKeys';
import { Permission } from '@server/lib/permissions';
import logger from '@server/logger';
import { Router } from 'express';
import type { FindOptionsWhere } from 'typeorm';

const favoriteRoutes = Router();

/**
 * The id a favorite is known by: tmdbId for movies and series, mbId for
 * albums and olId for books
 */
const getFavoriteId = (body: FavoriteRequestBody): string =>
  body.mediaType === MediaType.MUSIC
    ? String(body.mbId ?? '')
    : body.mediaType === MediaType.BOOK
      ? String(body.olId ?? '')
      : String(body.tmdbId ?? '');

const mapFavorite = (favorite: Favorite): FavoriteItem => ({
  id: favorite.id,
  ...(favorite.mediaType === MediaType.MUSIC
    ? { mbId: favorite.mbId ?? undefined }
    : favorite.mediaType === MediaType.BOOK
      ? { olId: favorite.olId ?? undefined }
      : { tmdbId: favorite.tmdbId ?? undefined }),
  mediaType: favorite.mediaType,
  createdAt: favorite.createdAt,
});

favoriteRoutes.get<Record<string, string>, FavoriteResultsResponse>(
  '/',
  async (req, res, next) => {
    const userId = req.query.userId ? Number(req.query.userId) : req.user?.id;

    if (!userId || !Number.isInteger(userId)) {
      return next({ status: 400, message: 'Invalid userId.' });
    }

    // Favourites follow the same visibility rules as the local watchlist
    if (
      userId !== req.user?.id &&
      !req.user?.hasPermission(
        [Permission.MANAGE_REQUESTS, Permission.WATCHLIST_VIEW],
        { type: 'or' }
      )
    ) {
      return next({
        status: 403,
        message: "You do not have permission to view this user's favorites.",
      });
    }

    const itemsPerPage = 20;
    const page = req.query.page ? Math.max(Number(req.query.page), 1) : 1;

    const where: FindOptionsWhere<Favorite> = { user: { id: userId } };

    if (req.query.tmdbId) {
      where.tmdbId = Number(req.query.tmdbId);
    }

    if (req.query.mbId) {
      where.mbId = String(req.query.mbId);
    }

    if (req.query.olId) {
      where.olId = String(req.query.olId);
    }

    if (isMediaListType(req.query.mediaType)) {
      where.mediaType = req.query.mediaType;
    }

    try {
      const [favorites, total] = await getRepository(Favorite).findAndCount({
        where,
        order: { createdAt: 'DESC', id: 'DESC' },
        take: itemsPerPage,
        skip: (page - 1) * itemsPerPage,
      });

      return res.status(200).json({
        page,
        totalPages: Math.ceil(total / itemsPerPage),
        totalResults: total,
        results: favorites.map(mapFavorite),
      });
    } catch (e) {
      logger.error('Something went wrong retrieving favorites', {
        label: 'API',
        errorMessage: e.message,
        userId,
      });
      return next({ status: 500, message: 'Unable to retrieve favorites.' });
    }
  }
);

favoriteRoutes.post<never, FavoriteItem, FavoriteRequestBody>(
  '/',
  async (req, res, next) => {
    const { mediaType } = req.body;

    if (!isMediaListType(mediaType)) {
      return next({ status: 400, message: 'Invalid mediaType.' });
    }

    const id = getFavoriteId(req.body);

    if (!isValidMediaListId(mediaType, id) || id === '0') {
      const field =
        mediaType === MediaType.MUSIC
          ? 'mbId'
          : mediaType === MediaType.BOOK
            ? 'olId'
            : 'tmdbId';

      return next({ status: 400, message: `Invalid ${field}.` });
    }

    const key = getMediaListBodyKey(req.body);
    const favoriteRepository = getRepository(Favorite);

    try {
      const existing = await favoriteRepository.exist({
        where: {
          user: { id: req.user?.id },
          ...key,
          mediaType,
        },
      });

      if (existing) {
        return next({ status: 409, message: 'Already in favorites.' });
      }

      const favorite = await favoriteRepository.save(
        new Favorite({
          ...key,
          mediaType,
          user: req.user,
        })
      );

      return res.status(201).json(mapFavorite(favorite));
    } catch (e) {
      logger.error('Something went wrong adding a favorite', {
        label: 'API',
        errorMessage: e.message,
        ...key,
        mediaType,
      });
      return next({ status: 500, message: 'Unable to add favorite.' });
    }
  }
);

favoriteRoutes.delete<{ tmdbId: string }>(
  '/:tmdbId',
  async (req, res, next) => {
    // Albums are removed by MusicBrainz release group id and books by
    // OpenLibrary work id, in place of the TMDB id
    const mediaType = req.query.mediaType;

    if (
      !isMediaListType(mediaType) ||
      !isValidMediaListId(mediaType, req.params.tmdbId)
    ) {
      return next({
        status: 400,
        message: 'Invalid mediaType query parameter.',
      });
    }

    try {
      const result = await getRepository(Favorite).delete({
        user: { id: req.user?.id },
        ...getMediaListKey(mediaType, req.params.tmdbId),
        mediaType,
      });

      if (!result.affected) {
        return next({ status: 404, message: 'Favorite not found.' });
      }

      return res.status(204).send();
    } catch (e) {
      logger.error('Something went wrong removing a favorite', {
        label: 'API',
        errorMessage: e.message,
        tmdbId: req.params.tmdbId,
        mediaType,
      });
      return next({ status: 500, message: 'Unable to remove favorite.' });
    }
  }
);

export default favoriteRoutes;
