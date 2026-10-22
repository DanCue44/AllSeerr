import { AudiobookshelfAdminAPI } from '@server/api/userAccess/audiobookshelfAdmin';
import { KavitaAdminAPI } from '@server/api/userAccess/kavitaAdmin';
import { KomgaAdminAPI } from '@server/api/userAccess/komgaAdmin';
import type {
  AppAccess,
  RemoteAccount,
  UserAccessAppClient,
} from '@server/api/userAccess/types';
import type { UserAccessApp } from '@server/constants/userAccess';
import {
  USER_ACCESS_APPS,
  USER_ACCESS_APP_NAMES,
  UserAppAccountGrant,
  UserAppAccountStatus,
} from '@server/constants/userAccess';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { UserAccessProfile } from '@server/entity/UserAccessProfile';
import { UserAppAccount } from '@server/entity/UserAppAccount';
import type {
  NewPasswords,
  PersonAccess,
  PersonAppAccess,
  PersonUpdateResult,
} from '@server/interfaces/api/userAccessInterfaces';
import { Permission } from '@server/lib/permissions';
import type { UserAccessAppConnection } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import type { AgeLimit } from '@server/lib/userAccess/ageLimits';
import { isRestricted } from '@server/lib/userAccess/ageLimits';
import { sendAppAccountEmail } from '@server/lib/userAccess/email';
import { applyPlexDefaults } from '@server/lib/userAccess/plexDefaults';
import logger from '@server/logger';
import { randomInt } from 'crypto';

export type { NewPasswords, PersonAccess, PersonAppAccess, PersonUpdateResult };

export interface PersonAccessChanges {
  ageLimit?: AgeLimit | null;
  includeUnrated?: boolean;
  apps?: Partial<
    Record<UserAccessApp, { enabled?: boolean; libraryIds?: string[] | null }>
  >;
}

// Letters and digits that cannot be mistaken for each other when read aloud
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * A password that is easy to type: four groups of four, such as
 * kx7m-4qpr-9fhd-2wne
 */
export const generateAppPassword = (): string =>
  Array.from({ length: 4 }, () =>
    Array.from(
      { length: 4 },
      () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]
    ).join('')
  ).join('-');

/**
 * The username a person gets in the apps: their Allseerr, Plex or Jellyfin
 * username, else the start of their email, with only letters, digits, dots,
 * dashes and underscores
 */
export const appUsernameFor = (user: User): string => {
  const base =
    user.username ||
    user.plexUsername ||
    user.jellyfinUsername ||
    user.email?.split('@')[0] ||
    `user${user.id}`;
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '')
    .replace(/^[.-]+/, '');

  return cleaned || `user${user.id}`;
};

const connectionFor = (app: UserAccessApp): UserAccessAppConnection => {
  const settings = getSettings();
  const connection = settings.userAccess[app];

  // Audiobookshelf is often already linked for book links
  if (app === 'audiobookshelf' && !connection.url) {
    return {
      ...connection,
      url: settings.audiobookshelf.url,
      publicUrl: connection.publicUrl || settings.audiobookshelf.url,
    };
  }

  return connection;
};

export const isAppConnected = (app: UserAccessApp): boolean => {
  const { url, apiKey, username, password } = connectionFor(app);

  return !!url && (!!apiKey || (!!username && !!password));
};

/**
 * The admin client for an app, or null while it is not set up
 */
export const getAppClient = (
  app: UserAccessApp,
  connection: UserAccessAppConnection = connectionFor(app)
): UserAccessAppClient | null => {
  if (
    !connection.url ||
    (!connection.apiKey && !(connection.username && connection.password))
  ) {
    return null;
  }

  const options = {
    url: connection.url,
    apiKey: connection.apiKey,
    username: connection.username,
    password: connection.password,
  };

  switch (app) {
    case 'audiobookshelf':
      return new AudiobookshelfAdminAPI(options);
    case 'kavita':
      return new KavitaAdminAPI(options);
    case 'komga':
      return new KomgaAdminAPI(options);
  }
};

export const getAppPublicUrl = (app: UserAccessApp): string | undefined => {
  const connection = connectionFor(app);

  return connection.publicUrl || connection.url || undefined;
};

const emptyAppAccess = (): PersonAppAccess => ({
  enabled: false,
  libraryIds: null,
  status: UserAppAccountStatus.NONE,
  remoteUsername: null,
  lastError: null,
  syncedAt: null,
  grantedBy: null,
});

const toPersonAccess = (
  user: User,
  profile: UserAccessProfile | undefined,
  accounts: UserAppAccount[]
): PersonAccess => {
  const apps = Object.fromEntries(
    USER_ACCESS_APPS.map((app) => {
      const account = accounts.find((a) => a.app === app);

      return [
        app,
        account
          ? {
              enabled: account.enabled,
              libraryIds: account.libraryIds ?? null,
              status: account.status,
              remoteUsername: account.remoteUsername ?? null,
              lastError: account.lastError ?? null,
              syncedAt: account.syncedAt ?? null,
              grantedBy: account.grantedBy ?? null,
            }
          : emptyAppAccess(),
      ];
    })
  ) as Record<UserAccessApp, PersonAppAccess>;

  return {
    userId: user.id,
    displayName: user.displayName,
    email: user.email,
    avatar: user.avatar,
    userType: user.userType,
    isAdmin: user.hasPermission(Permission.ADMIN),
    ageLimit: profile?.ageLimit ?? null,
    includeUnrated: profile?.includeUnrated ?? false,
    apps,
  };
};

export const getAccessProfile = async (
  userId: number
): Promise<UserAccessProfile | null> =>
  getRepository(UserAccessProfile).findOne({
    where: { user: { id: userId } },
  });

/**
 * The age limit for a person, none when no limit is set. Admins are never
 * limited.
 */
export const getAgeLimit = async (
  user: User
): Promise<{ ageLimit: AgeLimit | null; includeUnrated: boolean }> => {
  if (user.hasPermission(Permission.ADMIN)) {
    return { ageLimit: null, includeUnrated: true };
  }

  const profile = await getAccessProfile(user.id);

  return {
    ageLimit: isRestricted(profile?.ageLimit) ? profile.ageLimit : null,
    includeUnrated: profile?.includeUnrated ?? false,
  };
};

export const listPeople = async (): Promise<PersonAccess[]> => {
  const users = await getRepository(User).find({ order: { id: 'ASC' } });
  const profiles = await getRepository(UserAccessProfile).find({
    relations: { user: true },
  });
  const accounts = await getRepository(UserAppAccount).find({
    relations: { user: true },
  });

  return users.map((user) =>
    toPersonAccess(
      user,
      profiles.find((profile) => profile.user?.id === user.id),
      accounts.filter((account) => account.user?.id === user.id)
    )
  );
};

export const getPerson = async (userId: number): Promise<PersonAccess> => {
  const user = await getRepository(User).findOneOrFail({
    where: { id: userId },
  });
  const profile = await getAccessProfile(userId);
  const accounts = await getRepository(UserAppAccount).find({
    where: { user: { id: userId } },
  });

  return toPersonAccess(user, profile ?? undefined, accounts);
};

const accessFor = (
  account: UserAppAccount,
  limit: { ageLimit: AgeLimit | null; includeUnrated: boolean }
): AppAccess => ({
  enabled: account.enabled,
  libraryIds: account.libraryIds ?? null,
  ageLimit: limit.ageLimit,
  includeUnrated: limit.includeUnrated,
});

const recordError = async (
  account: UserAppAccount,
  error: unknown
): Promise<void> => {
  account.status = UserAppAccountStatus.ERROR;
  account.lastError = (error as Error)?.message ?? String(error);
  await getRepository(UserAppAccount).save(account);

  logger.warn('Failed to sync an app account', {
    label: 'User Access',
    app: account.app,
    userId: account.user?.id,
    message: account.lastError,
  });
};

const remoteOf = (account: UserAppAccount): RemoteAccount | null =>
  account.remoteUserId
    ? {
        id: account.remoteUserId,
        username: account.remoteUsername ?? '',
      }
    : null;

/**
 * Makes sure the person's account in the app matches their access: links
 * an account with the same username or email, makes one with a new password
 * when access is on and there is none, and turns it off when access is off.
 * Answers with the new password when one was made.
 */
export const syncAppAccount = async (
  user: User,
  account: UserAppAccount,
  options: { sendEmail?: boolean; create?: boolean } = {}
): Promise<{ username: string; password: string; emailed: boolean } | null> => {
  const client = getAppClient(account.app);

  if (!client) {
    return null;
  }

  const limit = await getAgeLimit(user);
  const access = accessFor(account, limit);
  const repository = getRepository(UserAppAccount);

  try {
    let remote =
      remoteOf(account) ??
      (await client.findAccount({
        username: appUsernameFor(user),
        email: user.email,
      }));

    // A linked account that was removed in the app is looked up again
    if (remote && account.remoteUserId) {
      const found = await client.findAccount({ remoteUserId: remote.id });
      remote =
        found ??
        (await client.findAccount({
          username: appUsernameFor(user),
          email: user.email,
        }));
    }

    let created: {
      username: string;
      password: string;
      emailed: boolean;
    } | null = null;

    if (!remote) {
      if (!account.enabled || options.create === false) {
        account.status = UserAppAccountStatus.NONE;
        account.lastError = null;
        account.remoteUserId = null;
        account.remoteUsername = null;
        account.syncedAt = new Date();
        await repository.save(account);
        return null;
      }

      const username = appUsernameFor(user);
      const password = generateAppPassword();
      remote = await client.createAccount({
        ...access,
        username,
        email: user.email,
        password,
      });

      const emailed =
        options.sendEmail !== false &&
        getSettings().userAccess.emailPasswords &&
        (await sendAppAccountEmail({
          user,
          appName: USER_ACCESS_APP_NAMES[account.app],
          appUrl: getAppPublicUrl(account.app),
          username: remote.username || username,
          password,
        }));

      created = {
        username: remote.username || username,
        password,
        emailed: !!emailed,
      };
    } else {
      await client.updateAccount(remote, access);
    }

    account.remoteUserId = remote.id;
    account.remoteUsername = remote.username;
    account.status = account.enabled
      ? UserAppAccountStatus.ACTIVE
      : UserAppAccountStatus.DISABLED;
    account.lastError = null;
    account.syncedAt = new Date();
    await repository.save(account);

    return created;
  } catch (e) {
    await recordError(account, e);
    return null;
  }
};

/**
 * Saves a person's age limit and app access, then brings their accounts in
 * line with it
 */
export const updatePerson = async (
  userId: number,
  changes: PersonAccessChanges
): Promise<PersonUpdateResult> => {
  const user = await getRepository(User).findOneOrFail({
    where: { id: userId },
  });
  const profileRepository = getRepository(UserAccessProfile);
  const accountRepository = getRepository(UserAppAccount);

  if (changes.ageLimit !== undefined || changes.includeUnrated !== undefined) {
    const profile =
      (await getAccessProfile(userId)) ??
      new UserAccessProfile({ user, includeUnrated: false });

    if (changes.ageLimit !== undefined) {
      profile.ageLimit = isRestricted(changes.ageLimit)
        ? changes.ageLimit
        : null;
    }
    if (changes.includeUnrated !== undefined) {
      profile.includeUnrated = changes.includeUnrated;
    }

    await profileRepository.save(profile);
  }

  for (const app of USER_ACCESS_APPS) {
    const change = changes.apps?.[app];

    if (!change) {
      continue;
    }

    const account =
      (await accountRepository.findOne({
        where: { user: { id: userId }, app },
      })) ??
      new UserAppAccount({
        user,
        app,
        enabled: false,
        libraryIds: null,
        status: UserAppAccountStatus.NONE,
      });

    if (change.enabled !== undefined) {
      account.enabled = change.enabled;
    }
    // A choice made for this person wins over the default access for Plex
    // users from now on
    account.grantedBy = UserAppAccountGrant.ADMIN;
    if (change.libraryIds !== undefined) {
      account.libraryIds = change.libraryIds?.length ? change.libraryIds : null;
    }

    await accountRepository.save(account);
  }

  const passwords = await syncPerson(user);

  return { person: await getPerson(userId), passwords };
};

/**
 * Brings every app account of a person in line with their access
 */
export const syncPerson = async (
  user: User,
  options: { create?: boolean } = {}
): Promise<NewPasswords> => {
  const accounts = await getRepository(UserAppAccount).find({
    where: { user: { id: user.id } },
    relations: { user: true },
  });
  const passwords: NewPasswords = {};

  for (const account of accounts) {
    // Nothing to do for an app the person never had and still does not have
    if (!account.enabled && !account.remoteUserId) {
      continue;
    }

    const created = await syncAppAccount(user, account, options);

    if (created) {
      passwords[account.app] = created;
    }
  }

  return passwords;
};

/**
 * Gives the person a new password in an app, shown once and emailed when
 * email is set up
 */
export const resetAppPassword = async (
  userId: number,
  app: UserAccessApp
): Promise<{ username: string; password: string; emailed: boolean }> => {
  const user = await getRepository(User).findOneOrFail({
    where: { id: userId },
  });
  const account = await getRepository(UserAppAccount).findOne({
    where: { user: { id: userId }, app },
  });
  const client = getAppClient(app);
  const remote = account ? remoteOf(account) : null;

  if (!client || !account || !remote) {
    throw new Error(`${USER_ACCESS_APP_NAMES[app]} has no account to reset.`);
  }

  const password = generateAppPassword();
  await client.setPassword(remote, password);

  const emailed =
    getSettings().userAccess.emailPasswords &&
    (await sendAppAccountEmail({
      user,
      appName: USER_ACCESS_APP_NAMES[app],
      appUrl: getAppPublicUrl(app),
      username: remote.username,
      password,
    }));

  return { username: remote.username, password, emailed: !!emailed };
};

/**
 * Deletes the person's account in the app, with its reading progress, and
 * takes away their access to it
 */
export const removeAppAccount = async (
  userId: number,
  app: UserAccessApp
): Promise<PersonAccess> => {
  const account = await getRepository(UserAppAccount).findOne({
    where: { user: { id: userId }, app },
  });

  if (account) {
    const client = getAppClient(app);
    const remote = remoteOf(account);

    if (client && remote) {
      await client.deleteAccount(remote);
    }

    account.enabled = false;
    account.remoteUserId = null;
    account.remoteUsername = null;
    account.status = UserAppAccountStatus.NONE;
    account.lastError = null;
    account.syncedAt = new Date();
    await getRepository(UserAppAccount).save(account);
  }

  return getPerson(userId);
};

/**
 * Brings everyone's accounts in line, for the scheduled sync. Accounts
 * made by signing in with Allseerr get their libraries and age limit this
 * way.
 */
let syncRunning = false;

export const isSyncRunning = (): boolean => syncRunning;

export const syncEveryone = async (): Promise<void> => {
  if (syncRunning) {
    return;
  }
  syncRunning = true;

  try {
    // Plex shares can change any time, so the default access is checked
    // before the accounts are brought in line
    try {
      await applyPlexDefaults();
    } catch (e) {
      logger.error('Could not apply default access for Plex users', {
        label: 'User Access',
        errorMessage: (e as Error).message,
      });
    }
    await syncAllAccounts();
  } finally {
    syncRunning = false;
  }
};

const syncAllAccounts = async (): Promise<void> => {
  const accounts = await getRepository(UserAppAccount).find({
    relations: { user: true },
  });
  const users = new Map<number, User>();

  for (const account of accounts) {
    if (account.user) {
      users.set(account.user.id, account.user);
    }
  }

  // Accounts are only made when an admin turns access on, so nobody gets
  // a password they never see
  for (const user of users.values()) {
    await syncPerson(user, { create: false });
  }
};
