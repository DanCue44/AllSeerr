import type { AppLibrary } from '@server/api/userAccess/types';
import {
  USER_ACCESS_APPS,
  USER_ACCESS_APP_NAMES,
  isUserAccessApp,
} from '@server/constants/userAccess';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import type { UserAccessAppInfo } from '@server/interfaces/api/userAccessInterfaces';
import { getSettings } from '@server/lib/settings';
import type {
  PersonAccess,
  PersonAccessChanges,
  PersonUpdateResult,
} from '@server/lib/userAccess';
import {
  getAppClient,
  getAppPublicUrl,
  getPerson,
  isAppConnected,
  listPeople,
  removeAppAccount,
  resetAppPassword,
  syncPerson,
  updatePerson,
} from '@server/lib/userAccess';
import { isAgeLimit } from '@server/lib/userAccess/ageLimits';
import type { InviteSummary } from '@server/lib/userAccess/invites';
import {
  createInvite,
  listInvites,
  revokeInvite,
} from '@server/lib/userAccess/invites';
import logger from '@server/logger';
import { Router } from 'express';

const userAccessRoutes = Router();

/**
 * The apps and their libraries, for picking who sees which
 */
userAccessRoutes.get<never, UserAccessAppInfo[]>('/apps', async (_req, res) => {
  const apps = await Promise.all(
    USER_ACCESS_APPS.map(async (app): Promise<UserAccessAppInfo> => {
      const client = getAppClient(app);
      let libraries: AppLibrary[] = [];
      let error: string | null = null;

      if (client) {
        try {
          libraries = await client.getLibraries();
        } catch (e) {
          error = (e as Error).message;
        }
      }

      return {
        app,
        name: USER_ACCESS_APP_NAMES[app],
        connected: isAppConnected(app),
        publicUrl: getAppPublicUrl(app) ?? null,
        libraries,
        error,
      };
    })
  );

  res.status(200).json(apps);
});

userAccessRoutes.get<never, PersonAccess[]>('/people', async (_req, res) => {
  res.status(200).json(await listPeople());
});

const parseUserId = (value: string): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const userExists = async (id: number): Promise<boolean> =>
  (await getRepository(User).count({ where: { id } })) > 0;

userAccessRoutes.get<{ userId: string }, PersonAccess>(
  '/people/:userId',
  async (req, res, next) => {
    const userId = parseUserId(req.params.userId);

    if (!userId || !(await userExists(userId))) {
      return next({ status: 404, message: 'User not found.' });
    }

    return res.status(200).json(await getPerson(userId));
  }
);

/**
 * Validates a change sent by the settings page
 */
export const parsePersonChanges = (
  body: unknown
): PersonAccessChanges | string => {
  if (!body || typeof body !== 'object') {
    return 'Invalid change.';
  }

  const { ageLimit, includeUnrated, apps } = body as Record<string, unknown>;
  const changes: PersonAccessChanges = {};

  if (ageLimit !== undefined) {
    if (ageLimit !== null && !isAgeLimit(ageLimit)) {
      return 'Invalid age limit.';
    }
    changes.ageLimit = ageLimit;
  }

  if (includeUnrated !== undefined) {
    if (typeof includeUnrated !== 'boolean') {
      return 'Invalid unrated setting.';
    }
    changes.includeUnrated = includeUnrated;
  }

  if (apps !== undefined) {
    if (!apps || typeof apps !== 'object') {
      return 'Invalid apps.';
    }

    changes.apps = {};

    for (const [app, value] of Object.entries(apps)) {
      if (!isUserAccessApp(app) || !value || typeof value !== 'object') {
        return 'Invalid apps.';
      }

      const { enabled, libraryIds } = value as Record<string, unknown>;

      if (enabled !== undefined && typeof enabled !== 'boolean') {
        return 'Invalid apps.';
      }
      if (
        libraryIds !== undefined &&
        libraryIds !== null &&
        !(
          Array.isArray(libraryIds) &&
          libraryIds.every((id) => typeof id === 'string' && id.length < 200)
        )
      ) {
        return 'Invalid libraries.';
      }

      changes.apps[app] = {
        ...(enabled !== undefined ? { enabled } : {}),
        ...(libraryIds !== undefined
          ? { libraryIds: libraryIds as string[] | null }
          : {}),
      };
    }
  }

  return changes;
};

/**
 * Saves a person's age limit and app access and brings their accounts in
 * line. New passwords come back once, to show the admin.
 */
userAccessRoutes.post<{ userId: string }, PersonUpdateResult>(
  '/people/:userId',
  async (req, res, next) => {
    const userId = parseUserId(req.params.userId);

    if (!userId || !(await userExists(userId))) {
      return next({ status: 404, message: 'User not found.' });
    }

    const changes = parsePersonChanges(req.body);

    if (typeof changes === 'string') {
      return next({ status: 400, message: changes });
    }

    try {
      return res.status(200).json(await updatePerson(userId, changes));
    } catch (e) {
      logger.error('Failed to update user access', {
        label: 'User Access',
        userId,
        message: (e as Error).message,
      });
      return next({ status: 500, message: 'Failed to update user access.' });
    }
  }
);

/**
 * Tries the person's app accounts again, such as after an app was down
 */
userAccessRoutes.post<{ userId: string }, PersonUpdateResult>(
  '/people/:userId/sync',
  async (req, res, next) => {
    const userId = parseUserId(req.params.userId);
    const user = userId
      ? await getRepository(User).findOne({ where: { id: userId } })
      : null;

    if (!user) {
      return next({ status: 404, message: 'User not found.' });
    }

    const passwords = await syncPerson(user);

    return res
      .status(200)
      .json({ person: await getPerson(user.id), passwords });
  }
);

userAccessRoutes.post<
  { userId: string; app: string },
  { username: string; password: string; emailed: boolean }
>('/people/:userId/apps/:app/password', async (req, res, next) => {
  const userId = parseUserId(req.params.userId);
  const { app } = req.params;

  if (!userId || !(await userExists(userId))) {
    return next({ status: 404, message: 'User not found.' });
  }
  if (!isUserAccessApp(app)) {
    return next({ status: 404, message: 'Unknown app.' });
  }

  try {
    return res.status(200).json(await resetAppPassword(userId, app));
  } catch (e) {
    return next({ status: 400, message: (e as Error).message });
  }
});

/**
 * Deletes the person's account in the app, with its reading progress
 */
userAccessRoutes.delete<{ userId: string; app: string }, PersonAccess>(
  '/people/:userId/apps/:app',
  async (req, res, next) => {
    const userId = parseUserId(req.params.userId);
    const { app } = req.params;

    if (!userId || !(await userExists(userId))) {
      return next({ status: 404, message: 'User not found.' });
    }
    if (!isUserAccessApp(app)) {
      return next({ status: 404, message: 'Unknown app.' });
    }

    try {
      return res.status(200).json(await removeAppAccount(userId, app));
    } catch (e) {
      return next({
        status: 502,
        message: `${USER_ACCESS_APP_NAMES[app]}: ${(e as Error).message}`,
      });
    }
  }
);

userAccessRoutes.get<never, InviteSummary[]>('/invites', async (_req, res) => {
  res.status(200).json(await listInvites());
});

/**
 * Makes an invite link. The link is only shown now, Allseerr keeps a hash
 * of it.
 */
userAccessRoutes.post<
  never,
  { invite: InviteSummary; link: string; token: string }
>('/invites', async (req, res, next) => {
  const parsed = parsePersonChanges({
    ageLimit: req.body?.ageLimit,
    includeUnrated: req.body?.includeUnrated,
    apps: req.body?.apps ?? {},
  });
  const days = req.body?.days;
  const label = req.body?.label;

  if (typeof parsed === 'string') {
    return next({ status: 400, message: parsed });
  }
  if (
    days !== undefined &&
    (typeof days !== 'number' || !Number.isFinite(days) || days <= 0)
  ) {
    return next({ status: 400, message: 'Invalid number of days.' });
  }
  if (
    label !== undefined &&
    label !== null &&
    (typeof label !== 'string' || label.length > 100)
  ) {
    return next({ status: 400, message: 'Invalid label.' });
  }

  const apps = Object.fromEntries(
    Object.entries(parsed.apps ?? {})
      .filter(([, access]) => access.enabled !== false)
      .map(([app, access]) => [app, { libraryIds: access.libraryIds ?? null }])
  );

  if (!Object.keys(apps).length) {
    return next({ status: 400, message: 'Pick at least one app.' });
  }

  const { invite, token } = await createInvite(req.user!, {
    label,
    apps,
    ageLimit: parsed.ageLimit,
    includeUnrated: parsed.includeUnrated,
    days,
  });
  const base = getSettings().main.applicationUrl.replace(/\/+$/, '');

  return res
    .status(201)
    .json({ invite, token, link: `${base}/invite/${token}` });
});

userAccessRoutes.delete<{ id: string }>(
  '/invites/:id',
  async (req, res, next) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || !(await revokeInvite(id))) {
      return next({ status: 404, message: 'Invite not found.' });
    }

    return res.status(204).send();
  }
);

export default userAccessRoutes;
