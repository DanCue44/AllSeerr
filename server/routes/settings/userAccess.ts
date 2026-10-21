import type { AppLibrary } from '@server/api/userAccess/types';
import type { UserAccessApp } from '@server/constants/userAccess';
import {
  USER_ACCESS_APPS,
  USER_ACCESS_APP_NAMES,
  isUserAccessApp,
} from '@server/constants/userAccess';
import type {
  UserAccessAppConnection,
  UserAccessSettings,
} from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { getAppClient } from '@server/lib/userAccess';
import logger from '@server/logger';
import { Router } from 'express';

const userAccessSettingsRoutes = Router();

export interface UserAccessAppConnectionResponse {
  url: string;
  publicUrl: string;
  username: string;
  apiKeySet: boolean;
  passwordSet: boolean;
}

export interface UserAccessSettingsResponse {
  audiobookshelf: UserAccessAppConnectionResponse;
  kavita: UserAccessAppConnectionResponse;
  komga: UserAccessAppConnectionResponse;
  emailPasswords: boolean;
}

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

/**
 * The connection without its secrets, only whether they are saved
 */
export const maskConnection = (
  connection: UserAccessAppConnection
): UserAccessAppConnectionResponse => ({
  url: connection.url ?? '',
  publicUrl: connection.publicUrl ?? '',
  username: connection.username ?? '',
  apiKeySet: !!connection.apiKey,
  passwordSet: !!connection.password,
});

export const maskUserAccessSettings = (
  settings: UserAccessSettings
): UserAccessSettingsResponse => ({
  audiobookshelf: maskConnection(settings.audiobookshelf),
  kavita: maskConnection(settings.kavita),
  komga: maskConnection(settings.komga),
  emailPasswords: settings.emailPasswords,
});

/**
 * A connection with the saved secrets kept where none were sent, and
 * removed where an empty one was
 */
const mergeConnection = (
  saved: UserAccessAppConnection,
  incoming: Partial<UserAccessAppConnection> | undefined
): UserAccessAppConnection => {
  if (!incoming) {
    return saved;
  }

  return {
    url: trimmedUrl(incoming.url) ?? saved.url,
    publicUrl: trimmedUrl(incoming.publicUrl) ?? saved.publicUrl,
    username: trimmed(incoming.username) ?? saved.username,
    apiKey:
      incoming.apiKey !== undefined ? trimmed(incoming.apiKey) : saved.apiKey,
    password:
      incoming.password !== undefined ? incoming.password : saved.password,
  };
};

userAccessSettingsRoutes.get('/', (_req, res) => {
  res.status(200).json(maskUserAccessSettings(getSettings().userAccess));
});

userAccessSettingsRoutes.post<
  never,
  UserAccessSettingsResponse,
  Partial<
    Record<UserAccessApp, Partial<UserAccessAppConnection>> & {
      emailPasswords: boolean;
    }
  >
>('/', async (req, res, next) => {
  const settings = getSettings();
  const current = settings.userAccess;

  for (const app of USER_ACCESS_APPS) {
    const incoming = req.body[app];
    for (const field of ['url', 'publicUrl'] as const) {
      const value = trimmedUrl(incoming?.[field]);
      if (value && !isHttpUrl(value)) {
        return next({
          status: 400,
          message: `Invalid ${USER_ACCESS_APP_NAMES[app]} address.`,
        });
      }
    }
  }

  settings.userAccess = {
    ...current,
    audiobookshelf: mergeConnection(
      current.audiobookshelf,
      req.body.audiobookshelf
    ),
    kavita: mergeConnection(current.kavita, req.body.kavita),
    komga: mergeConnection(current.komga, req.body.komga),
    emailPasswords:
      typeof req.body.emailPasswords === 'boolean'
        ? req.body.emailPasswords
        : current.emailPasswords,
  };

  await settings.save();

  return res.status(200).json(maskUserAccessSettings(settings.userAccess));
});

/**
 * Checks an app's address and admin credentials, with the saved ones where
 * none are sent, and lists its libraries
 */
userAccessSettingsRoutes.post<
  { app: string },
  { version?: string; libraries: AppLibrary[] },
  Partial<UserAccessAppConnection>
>('/:app/test', async (req, res, next) => {
  const { app } = req.params;

  if (!isUserAccessApp(app)) {
    return next({ status: 404, message: 'Unknown app.' });
  }

  const connection = mergeConnection(getSettings().userAccess[app], req.body);

  if (!connection.url || !isHttpUrl(connection.url)) {
    return next({
      status: 400,
      message: `Invalid ${USER_ACCESS_APP_NAMES[app]} address.`,
    });
  }

  const client = getAppClient(app, connection);

  if (!client) {
    return next({
      status: 400,
      message: `Add the ${USER_ACCESS_APP_NAMES[app]} admin credentials.`,
    });
  }

  try {
    const { version } = await client.test();
    const libraries = await client.getLibraries();

    return res.status(200).json({ version, libraries });
  } catch (e) {
    logger.warn('Failed to test an app for user access', {
      label: 'User Access',
      app,
      message: (e as Error).message,
    });

    return next({ status: 502, message: (e as Error).message });
  }
});

export default userAccessSettingsRoutes;
