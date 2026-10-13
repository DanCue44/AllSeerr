import type { AudiobookshelfLibrary } from '@server/api/audiobookshelf';
import AudiobookshelfAPI from '@server/api/audiobookshelf';
import type { AudiobookshelfSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const audiobookshelfRoutes = Router();

const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

const trimmed = (value: unknown): string | undefined =>
  typeof value === 'string' ? value.trim() : undefined;

audiobookshelfRoutes.get('/', (_req, res) => {
  res.status(200).json(getSettings().audiobookshelf);
});

/**
 * Saves the Audiobookshelf link. The address is the public one users open,
 * which the server may not reach itself, so saving does not test it.
 */
audiobookshelfRoutes.post<
  never,
  AudiobookshelfSettings,
  AudiobookshelfSettings
>('/', async (req, res, next) => {
  const settings = getSettings();
  const url = trimmed(req.body.url)?.replace(/\/+$/, '');

  if (url && !isHttpUrl(url)) {
    return next({ status: 400, message: 'Invalid Audiobookshelf URL.' });
  }

  settings.audiobookshelf = {
    ...(url !== undefined ? { url } : {}),
    ...(req.body.libraryId !== undefined
      ? { libraryId: trimmed(req.body.libraryId) }
      : {}),
    ...(req.body.ebookLibraryId !== undefined
      ? { ebookLibraryId: trimmed(req.body.ebookLibraryId) }
      : {}),
    ...(req.body.apiKey !== undefined
      ? { apiKey: trimmed(req.body.apiKey) }
      : {}),
    ...(typeof req.body.showNoBookEnds === 'boolean'
      ? { showNoBookEnds: req.body.showNoBookEnds }
      : {}),
  };

  await settings.save();

  return res.status(200).json(settings.audiobookshelf);
});

/**
 * Checks that Audiobookshelf answers at the address, and with an API key,
 * lists its libraries so one can be picked
 */
audiobookshelfRoutes.post<
  never,
  { version?: string; libraries?: AudiobookshelfLibrary[] },
  { url?: string; apiKey?: string }
>('/test', async (req, res, next) => {
  const url = trimmed(req.body.url);
  const apiKey = trimmed(req.body.apiKey);

  if (!url || !isHttpUrl(url)) {
    return next({ status: 400, message: 'Invalid Audiobookshelf URL.' });
  }

  const client = new AudiobookshelfAPI({ url, apiKey });

  try {
    const version = await client.getVersion();
    const libraries = apiKey ? await client.getLibraries() : undefined;

    return res.status(200).json({ version, libraries });
  } catch (e) {
    logger.error('Failed to test Audiobookshelf', {
      label: 'Audiobookshelf',
      message: e.message,
    });

    return next({
      status: 500,
      message: apiKey
        ? 'Failed to connect to Audiobookshelf or list its libraries.'
        : 'Failed to connect to Audiobookshelf.',
    });
  }
});

export default audiobookshelfRoutes;
