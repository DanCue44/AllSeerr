import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import type { NoBookEndsDirectoryStatus } from '@server/interfaces/api/userAccessInterfaces';
import type { NoBookEndsDirectoryResult } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import axios from 'axios';
import { randomBytes } from 'crypto';

/**
 * The NoBookEnds directory lets people who sign in to NoBookEnds with Plex
 * find the Allseerr that goes with their Plex servers. Allseerr lists itself
 * with the admin's Plex token, which the directory only uses to read the
 * servers the admin owns. It keeps a one-way code of each server and the
 * Application URL, and checks the address answers with a code Allseerr made.
 */
export const NOBOOKENDS_DIRECTORY_URL = 'https://dir.nobookends.com';

const getDirectoryUrl = (): string =>
  (process.env.NOBOOKENDS_DIRECTORY_URL || NOBOOKENDS_DIRECTORY_URL).replace(
    /\/+$/,
    ''
  );

// The directory checks the address within 10 seconds, so a code is only
// good for a little longer than a registration takes
const NONCE_TTL_MS = 2 * 60 * 1000;
const pendingNonces = new Map<string, number>();

const createNonce = (): string => {
  const now = Date.now();

  for (const [nonce, expiresAt] of pendingNonces) {
    if (expiresAt <= now) {
      pendingNonces.delete(nonce);
    }
  }

  const nonce = randomBytes(24).toString('hex');
  pendingNonces.set(nonce, now + NONCE_TTL_MS);
  return nonce;
};

/**
 * Whether the directory is checking this address with this code right now
 */
export const isPendingDirectoryNonce = (nonce: unknown): boolean => {
  if (typeof nonce !== 'string' || !nonce) {
    return false;
  }

  const expiresAt = pendingNonces.get(nonce);
  return !!expiresAt && expiresAt > Date.now();
};

const getApplicationUrl = (): string | undefined =>
  getSettings().main.applicationUrl?.trim().replace(/\/+$/, '') || undefined;

// The token Allseerr reads Plex with, the admin's own
const getAdminPlexToken = async (): Promise<string | undefined> => {
  if (getSettings().main.mediaServerType !== MediaServerType.PLEX) {
    return undefined;
  }

  const admin = await getRepository(User).findOne({
    select: { id: true, plexToken: true },
    where: { id: 1 },
  });

  return admin?.plexToken || undefined;
};

export const getDirectoryStatus =
  async (): Promise<NoBookEndsDirectoryStatus> => {
    const userAccess = getSettings().userAccess;

    return {
      enabled: !!userAccess.nobookendsDirectory,
      applicationUrlMissing: !getApplicationUrl(),
      plexMissing: !(await getAdminPlexToken()),
      lastResult: userAccess.nobookendsDirectoryResult ?? null,
    };
  };

const saveResult = async (
  result: NoBookEndsDirectoryResult | null
): Promise<void> => {
  const settings = getSettings();
  settings.userAccess = {
    ...settings.userAccess,
    nobookendsDirectoryResult: result,
  };
  await settings.save();
};

const errorMessage = (e: unknown): string => {
  if (axios.isAxiosError(e)) {
    const message = (e.response?.data as { message?: unknown } | undefined)
      ?.message;

    if (typeof message === 'string' && message) {
      return message;
    }
    if (e.response) {
      return `The directory answered ${e.response.status}.`;
    }
  }

  return (e as Error).message;
};

/**
 * Lists this server in the directory, or refreshes its listing, and saves
 * how it went
 */
export const registerWithDirectory =
  async (): Promise<NoBookEndsDirectoryResult> => {
    const url = getApplicationUrl();
    const plexToken = await getAdminPlexToken();
    let result: NoBookEndsDirectoryResult;

    if (!url || !plexToken) {
      result = {
        date: new Date().toISOString(),
        registered: null,
        error: !url
          ? 'Set the Application URL in the General settings first.'
          : 'Set up Plex first.',
      };
      await saveResult(result);
      return result;
    }

    const nonce = createNonce();

    try {
      const response = await axios.post<{ registered?: number }>(
        `${getDirectoryUrl()}/v1/servers`,
        { plexToken, url, nonce },
        { timeout: 30 * 1000 }
      );

      result = {
        date: new Date().toISOString(),
        registered: Number(response.data?.registered ?? 0),
        error: null,
      };
      logger.info('Listed this server in the NoBookEnds directory', {
        label: 'NoBookEnds',
        registered: result.registered,
      });
    } catch (e) {
      result = {
        date: new Date().toISOString(),
        registered: null,
        error: errorMessage(e),
      };
      logger.warn('Could not list this server in the NoBookEnds directory', {
        label: 'NoBookEnds',
        errorMessage: result.error,
      });
    } finally {
      pendingNonces.delete(nonce);
    }

    await saveResult(result);
    return result;
  };

/**
 * Takes this server's Plex servers out of the directory
 */
export const unregisterFromDirectory = async (): Promise<void> => {
  const plexToken = await getAdminPlexToken();

  if (!plexToken) {
    await saveResult(null);
    return;
  }

  try {
    await axios.delete(`${getDirectoryUrl()}/v1/servers`, {
      data: { plexToken },
      timeout: 30 * 1000,
    });
    await saveResult(null);
    logger.info('Took this server out of the NoBookEnds directory', {
      label: 'NoBookEnds',
    });
  } catch (e) {
    const error = errorMessage(e);
    await saveResult({
      date: new Date().toISOString(),
      registered: null,
      error,
    });
    logger.warn('Could not take this server out of the NoBookEnds directory', {
      label: 'NoBookEnds',
      errorMessage: error,
    });
  }
};

let jobRunning = false;

export const isDirectoryJobRunning = (): boolean => jobRunning;

/**
 * Keeps the listing fresh while it is on: the directory drops servers that
 * did not register again for 30 days
 */
export const runDirectoryJob = async (): Promise<void> => {
  if (!getSettings().userAccess.nobookendsDirectory || jobRunning) {
    return;
  }

  jobRunning = true;
  try {
    await registerWithDirectory();
  } finally {
    jobRunning = false;
  }
};
