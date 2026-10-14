import type { AudiobookshelfLibrary } from '@server/api/audiobookshelf';
import AudiobookshelfAPI from '@server/api/audiobookshelf';
import { isAudiobookshelfMatchRegion } from '@server/constants/audiobookshelf';
import type {
  AudiobookshelfAuthorMatchResponse,
  AudiobookshelfSettingsResponse,
} from '@server/interfaces/api/settingsInterfaces';
import {
  AuthorMatchUnavailableError,
  matchAllAudiobookshelfAuthors,
} from '@server/lib/audiobookshelfAuthors';
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

/**
 * The settings without the admin API key, only whether one is saved
 */
export const maskAudiobookshelfSettings = ({
  adminApiKey,
  ...settings
}: AudiobookshelfSettings): AudiobookshelfSettingsResponse => ({
  ...settings,
  adminApiKeySet: !!adminApiKey?.trim(),
});

audiobookshelfRoutes.get('/', (_req, res) => {
  res
    .status(200)
    .json(maskAudiobookshelfSettings(getSettings().audiobookshelf));
});

/**
 * Saves the Audiobookshelf link. The address is the public one users open,
 * which the server may not reach itself, so saving does not test it. A
 * missing admin API key keeps the saved one, an empty one removes it.
 */
audiobookshelfRoutes.post<
  never,
  AudiobookshelfSettingsResponse,
  AudiobookshelfSettings
>('/', async (req, res, next) => {
  const settings = getSettings();
  const url = trimmed(req.body.url)?.replace(/\/+$/, '');

  if (url && !isHttpUrl(url)) {
    return next({ status: 400, message: 'Invalid Audiobookshelf URL.' });
  }

  if (
    req.body.authorMatchRegion !== undefined &&
    !isAudiobookshelfMatchRegion(req.body.authorMatchRegion)
  ) {
    return next({ status: 400, message: 'Invalid author match region.' });
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
    ...(req.body.adminApiKey !== undefined
      ? { adminApiKey: trimmed(req.body.adminApiKey) ?? '' }
      : {}),
    ...(req.body.authorMatchRegion !== undefined
      ? { authorMatchRegion: req.body.authorMatchRegion }
      : {}),
  };

  await settings.save();

  return res
    .status(200)
    .json(maskAudiobookshelfSettings(settings.audiobookshelf));
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

/**
 * Matches every author without a photo in the audiobook and ebook
 * libraries, with the saved admin API key. Answers with the counts once
 * done, or after a while with the counts so far while the rest goes on in
 * the background.
 */
audiobookshelfRoutes.post<never, AudiobookshelfAuthorMatchResponse>(
  '/match-authors',
  async (_req, res, next) => {
    try {
      return res.status(200).json(await matchAllAudiobookshelfAuthors());
    } catch (e) {
      if (e instanceof AuthorMatchUnavailableError) {
        return next({ status: 400, message: e.message });
      }

      logger.error('Failed to match Audiobookshelf authors', {
        label: 'Audiobookshelf',
        errorMessage: e.message,
      });

      return next({
        status: 500,
        message: 'Failed to list or match the Audiobookshelf authors.',
      });
    }
  }
);

export default audiobookshelfRoutes;
