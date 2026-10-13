import type { NoBookEndsSyncHealth } from '@server/api/nobookendsSync';
import NoBookEndsSyncAPI from '@server/api/nobookendsSync';
import type {
  NoBookEndsSyncSettingsResponse,
  NoBookEndsSyncTestResponse,
} from '@server/interfaces/api/settingsInterfaces';
import {
  backfillNoBookEndsSync,
  getNoBookEndsSyncTarget,
} from '@server/lib/nobookendsSync';
import type { NoBookEndsSyncSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { isAxiosError } from 'axios';
import { Router } from 'express';

const nobookendsSyncRoutes = Router();

export const maskNoBookEndsSyncSettings = (
  settings: NoBookEndsSyncSettings
): NoBookEndsSyncSettingsResponse => ({
  enabled: !!settings.enabled,
  url: settings.url ?? '',
  internalUrl: settings.internalUrl ?? '',
  adminTokenSet: !!settings.adminToken?.trim(),
});

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

const trimmedUrl = (value: unknown): string | undefined =>
  trimmed(value)?.replace(/\/+$/, '');

nobookendsSyncRoutes.get('/', (_req, res) => {
  res
    .status(200)
    .json(maskNoBookEndsSyncSettings(getSettings().nobookendsSync));
});

/**
 * Saves the NoBookEnds Sync settings. A missing admin token keeps the saved
 * one, an empty one removes it.
 */
nobookendsSyncRoutes.post<
  never,
  NoBookEndsSyncSettingsResponse,
  NoBookEndsSyncSettings
>('/', async (req, res, next) => {
  const settings = getSettings();
  const url = trimmedUrl(req.body.url);
  const internalUrl = trimmedUrl(req.body.internalUrl);

  if (url && !isHttpUrl(url)) {
    return next({ status: 400, message: 'Invalid NoBookEnds Sync URL.' });
  }

  if (internalUrl && !isHttpUrl(internalUrl)) {
    return next({ status: 400, message: 'Invalid internal URL.' });
  }

  const changes: NoBookEndsSyncSettings = {
    ...(typeof req.body.enabled === 'boolean'
      ? { enabled: req.body.enabled }
      : {}),
    ...(url !== undefined ? { url } : {}),
    ...(internalUrl !== undefined ? { internalUrl } : {}),
    ...(req.body.adminToken !== undefined
      ? { adminToken: trimmed(req.body.adminToken) ?? '' }
      : {}),
  };
  const merged = { ...settings.nobookendsSync, ...changes };

  if (merged.enabled && !merged.url && !merged.internalUrl) {
    return next({
      status: 400,
      message: 'NoBookEnds Sync needs a URL to be enabled.',
    });
  }

  settings.nobookendsSync = changes;
  await settings.save();

  return res
    .status(200)
    .json(maskNoBookEndsSyncSettings(settings.nobookendsSync));
});

/**
 * Checks that the Sync server answers at the internal address (the public
 * one when there is none), and with an admin token, that the token works
 * by reading the queue. The saved token is only used for the saved server.
 */
nobookendsSyncRoutes.post<
  never,
  NoBookEndsSyncTestResponse,
  { url?: string; internalUrl?: string; adminToken?: string }
>('/test', async (req, res, next) => {
  const saved = getSettings().nobookendsSync;
  const url = trimmedUrl(req.body.internalUrl) || trimmedUrl(req.body.url);

  if (!url || !isHttpUrl(url)) {
    return next({ status: 400, message: 'Invalid NoBookEnds Sync URL.' });
  }

  const savedUrl =
    trimmedUrl(saved.internalUrl) || trimmedUrl(saved.url) || undefined;
  const adminToken =
    req.body.adminToken !== undefined
      ? trimmed(req.body.adminToken)
      : savedUrl === url
        ? saved.adminToken?.trim()
        : undefined;
  const client = new NoBookEndsSyncAPI({ url, adminToken });

  let health: NoBookEndsSyncHealth;

  try {
    health = await client.getHealth();
  } catch (e) {
    logger.error('Failed to reach NoBookEnds Sync', {
      label: 'NoBookEnds Sync',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Failed to connect to NoBookEnds Sync.',
    });
  }

  if (!adminToken) {
    return res.status(200).json(health);
  }

  try {
    const queue = await client.getQueue();

    return res.status(200).json({ ...health, tokenValid: true, queue });
  } catch (e) {
    const status = isAxiosError(e) ? e.response?.status : undefined;

    if (status === 401 || status === 403 || status === 404) {
      // 404 is what the Sync server answers while it has no ADMIN_TOKEN
      return res.status(200).json({ ...health, tokenValid: false });
    }

    logger.error('Failed to read the NoBookEnds Sync queue', {
      label: 'NoBookEnds Sync',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'NoBookEnds Sync answered, but its queue could not be read.',
    });
  }
});

/**
 * Queues every book with both an audiobook and an ebook in Audiobookshelf
 */
nobookendsSyncRoutes.post('/backfill', async (_req, res, next) => {
  const target = getNoBookEndsSyncTarget();

  if (!target) {
    return next({
      status: 400,
      message: 'NoBookEnds Sync is not enabled or has no admin token.',
    });
  }

  try {
    await new NoBookEndsSyncAPI(target).getHealth();
  } catch (e) {
    logger.error('Failed to reach NoBookEnds Sync for a backfill', {
      label: 'NoBookEnds Sync',
      errorMessage: e.message,
    });
    return next({
      status: 502,
      message: 'Failed to connect to NoBookEnds Sync.',
    });
  }

  try {
    return res.status(200).json(await backfillNoBookEndsSync());
  } catch (e) {
    logger.error('Failed to queue books on NoBookEnds Sync', {
      label: 'NoBookEnds Sync',
      errorMessage: e.message,
    });
    return next({ status: 500, message: 'Failed to queue the books.' });
  }
});

export default nobookendsSyncRoutes;
