import type {
  DownloadRemoveBody,
  DownloadRemoveResponse,
  DownloadsResponse,
} from '@server/interfaces/api/downloadInterfaces';
import { ArrActionError } from '@server/lib/arrActions';
import {
  getDownloads,
  removeDownload,
  searchDownload,
} from '@server/lib/downloads';
import { Permission } from '@server/lib/permissions';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import type { NextFunction } from 'express';
import { Router } from 'express';

// The count only feeds the badge in the navigation, so it may be older
const COUNT_MAX_AGE_MS = 60 * 1000;

/**
 * The queues of every Radarr, Sonarr, Lidarr and Chaptarr server in one
 * list, for admins, mounted at /downloads
 */
const downloadRoutes = Router();

downloadRoutes.use(isAuthenticated(Permission.ADMIN));

const handleError = (
  e: Error,
  id: string | undefined,
  next: NextFunction,
  action: string
) => {
  if (e instanceof ArrActionError) {
    return next({ status: e.status, message: e.message });
  }

  logger.error(`Something went wrong ${action}`, {
    label: 'Downloads',
    downloadId: id,
    errorMessage: e.message,
  });
  return next({ status: 502, message: e.message });
};

downloadRoutes.get<never, DownloadsResponse>('/', async (_req, res, next) => {
  try {
    return res.status(200).json(await getDownloads());
  } catch (e) {
    return handleError(e, undefined, next, 'listing the downloads');
  }
});

downloadRoutes.get<never, { total: number; attention: number }>(
  '/count',
  async (_req, res, next) => {
    try {
      const { totals } = await getDownloads({ maxAgeMs: COUNT_MAX_AGE_MS });

      return res
        .status(200)
        .json({ total: totals.total, attention: totals.attention });
    } catch (e) {
      return handleError(e, undefined, next, 'counting the downloads');
    }
  }
);

downloadRoutes.post<{ downloadId: string }, DownloadRemoveResponse>(
  '/:downloadId/search',
  async (req, res, next) => {
    if (!req.user) {
      return next({ status: 500, message: 'User missing from request.' });
    }

    try {
      await searchDownload(req.params.downloadId, req.user);
      return res
        .status(200)
        .json({ removed: false, blocklisted: false, searched: true });
    } catch (e) {
      return handleError(e, req.params.downloadId, next, 'searching again');
    }
  }
);

downloadRoutes.post<
  { downloadId: string },
  DownloadRemoveResponse,
  DownloadRemoveBody
>('/:downloadId/remove', async (req, res, next) => {
  if (!req.user) {
    return next({ status: 500, message: 'User missing from request.' });
  }

  try {
    return res.status(200).json(
      await removeDownload(req.params.downloadId, req.user, {
        removeFromClient: req.body?.removeFromClient !== false,
        blocklist: req.body?.blocklist === true,
        search: req.body?.search === true,
      })
    );
  } catch (e) {
    return handleError(e, req.params.downloadId, next, 'removing the download');
  }
});

export default downloadRoutes;
