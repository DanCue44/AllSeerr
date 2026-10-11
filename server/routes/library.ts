import { MediaType } from '@server/constants/media';
import {
  LibrarySortOptionsIterable,
  getLibraryCollections,
  getLibraryTitles,
} from '@server/lib/library';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';
import { z } from 'zod';

const libraryRoutes = Router();

const LibraryQuerySchema = z.object({
  type: z.nativeEnum(MediaType),
  page: z.coerce.number().int().min(1).catch(1),
  sortBy: z.enum(LibrarySortOptionsIterable).catch('mediaAdded.desc'),
  genre: z.coerce.string().optional(),
});

const CollectionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
});

libraryRoutes.get('/', async (req, res, next) => {
  const query = LibraryQuerySchema.safeParse(req.query);

  if (!query.success) {
    return next({ status: 400, message: 'Invalid library type.' });
  }

  try {
    const genreIds = (query.data.genre ?? '')
      .split(',')
      .map((genre) => Number(genre))
      .filter((genre) => Number.isInteger(genre) && genre > 0);

    const data = await getLibraryTitles({
      mediaType: query.data.type,
      sortBy: query.data.sortBy,
      genreIds,
      page: query.data.page,
      language: req.locale ?? getSettings().main.locale,
      user: req.user,
    });

    return res.status(200).json(data);
  } catch (e) {
    logger.error('Something went wrong retrieving the library', {
      label: 'API',
      errorMessage: e.message,
      type: query.data.type,
    });
    return next({ status: 500, message: 'Unable to retrieve the library.' });
  }
});

libraryRoutes.get('/collections', async (req, res, next) => {
  const query = CollectionsQuerySchema.parse(req.query);

  try {
    const data = await getLibraryCollections({
      page: query.page,
      language: req.locale ?? getSettings().main.locale,
    });

    return res.status(200).json(data);
  } catch (e) {
    logger.error('Something went wrong retrieving library collections', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve library collections.',
    });
  }
});

export default libraryRoutes;
