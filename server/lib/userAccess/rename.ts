import type {
  AppAccountSummary,
  UserAccessAppClient,
} from '@server/api/userAccess/types';
import { MediaServerType } from '@server/constants/server';
import type { UserAccessApp } from '@server/constants/userAccess';
import { USER_ACCESS_APP_NAMES } from '@server/constants/userAccess';
import { getRepository } from '@server/datasource';
import type { User } from '@server/entity/User';
import { UserAppAccount } from '@server/entity/UserAppAccount';
import { getNoBookEndsSignInUrl } from '@server/lib/nobookends';
import notificationManager, { Notification } from '@server/lib/notifications';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

// Accounts Allseerr and its companions use in the apps, never a person's
export const SERVICE_ACCOUNT_NAMES = [
  'allseerr',
  'allseerr-match',
  'talearr',
  'nobookends-sync',
  'appdev',
  'appreview',
];

// The renames kept for the admin's list
const MAX_RENAMES = 100;

export type ServiceReason = 'name' | 'connection' | 'marked';

/**
 * Why an account is a service account and no person's, or null when it is
 * a person's: its name is one Allseerr's own tools use, the app connection
 * signs in with it, or an admin marked it. An admin can mark the account
 * the connection uses as a person's, for an admin who set the connection up
 * with their own account.
 */
export const serviceReasonFor = (
  app: UserAccessApp,
  account: Pick<AppAccountSummary, 'id' | 'username'>,
  connectionAccountId: string | null
): ServiceReason | null => {
  const { serviceAccounts, personAccounts } = getSettings().userAccess;

  if (serviceAccounts?.[app]?.includes(account.id)) {
    return 'marked';
  }
  if (personAccounts?.[app]?.includes(account.id)) {
    return null;
  }
  if (SERVICE_ACCOUNT_NAMES.includes(account.username.trim().toLowerCase())) {
    return 'name';
  }
  if (connectionAccountId && connectionAccountId === account.id) {
    return 'connection';
  }

  return null;
};

/**
 * The account the app connection signs in with, null when the app cannot
 * say
 */
export const connectionAccountIdFor = async (
  client: UserAccessAppClient
): Promise<string | null> =>
  client.ownAccountId ? client.ownAccountId().catch(() => null) : null;

/**
 * Marks an account as a service account, or as a person's, or clears the
 * admin's choice so the usual rules decide
 */
export const markServiceAccount = async (
  app: UserAccessApp,
  remoteUserId: string,
  service: boolean | null
): Promise<void> => {
  const settings = getSettings();
  const userAccess = settings.userAccess;
  const without = (ids?: string[]) =>
    (ids ?? []).filter((id) => id !== remoteUserId);
  const serviceIds = without(userAccess.serviceAccounts?.[app]);
  const personIds = without(userAccess.personAccounts?.[app]);

  if (service === true) {
    serviceIds.push(remoteUserId);
  } else if (service === false) {
    personIds.push(remoteUserId);
  }

  // The settings hand out a copy, so the change is set back on them
  settings.userAccess = {
    ...userAccess,
    serviceAccounts: { ...userAccess.serviceAccounts, [app]: serviceIds },
    personAccounts: { ...userAccess.personAccounts, [app]: personIds },
  };
  await settings.save();
};

export const isMatchingPlexUsernames = (): boolean =>
  getSettings().userAccess.matchPlexUsernames !== false;

export type RenameOutcome =
  | { status: 'renamed'; from: string; to: string }
  | { status: 'same' | 'off' | 'unsupported' | 'skipped'; message?: string }
  | { status: 'clash' | 'failed'; message: string };

// A person renamed in a second app this soon after the first already heard
const TOLD_FOR_MS = 60 * 60 * 1000;

/**
 * Tells the person their username changed. People use the apps through
 * Allseerr and NoBookEnds, so the message names NoBookEnds when it is set up
 * and no app otherwise. With NoBookEnds and an Application URL, the email
 * opens NoBookEnds at its sign in with this server filled in.
 */
export const sendUsernameChanged = (user: User, username: string): void => {
  const settings = getSettings();
  const withNoBookEnds = !!settings.nobookendsSync.enabled;
  const applicationUrl = settings.main.applicationUrl?.trim();
  // NoBookEnds signs people in through Allseerr, with Plex on a Plex server
  const signIn =
    settings.main.mediaServerType === MediaServerType.PLEX
      ? 'If NoBookEnds asks you to sign in, tap Sign in with Plex.'
      : 'If NoBookEnds asks you to sign in, tap Sign in with Allseerr.';

  notificationManager.sendNotification(Notification.APP_USERNAME_CHANGED, {
    event: 'Username Changed',
    subject: withNoBookEnds
      ? 'Your NoBookEnds username now matches Plex'
      : 'Your reading app username now matches Plex',
    message: withNoBookEnds
      ? `The accounts NoBookEnds uses for your books and audiobooks changed their username to match your Plex name. Your new username is ${username}. Your password, progress and bookmarks stay the same. ${signIn}`
      : `The accounts your books and audiobooks are read in changed their username to match your Plex name. Your new username is ${username}. Your password, progress and bookmarks stay the same. If an app asks you to sign in, use the new username.`,
    notifyAdmin: false,
    notifySystem: false,
    notifyUser: user,
    actionPath: '/profile/settings/apps',
    ...(withNoBookEnds && applicationUrl
      ? {
          externalLink: {
            url: getNoBookEndsSignInUrl(applicationUrl),
            title: 'Open NoBookEnds',
          },
        }
      : {}),
  });
};

const recordRename = async (
  user: User,
  app: UserAccessApp,
  from: string,
  to: string
): Promise<void> => {
  const settings = getSettings();
  const userAccess = settings.userAccess;

  settings.userAccess = {
    ...userAccess,
    renames: [
      {
        userId: user.id,
        displayName: user.displayName,
        app,
        from,
        to,
        date: new Date().toISOString(),
      },
      ...(userAccess.renames ?? []),
    ].slice(0, MAX_RENAMES),
  };
  await settings.save();
};

/**
 * Renames a person's linked account to the username they get in the apps,
 * their Plex username, while Keep app usernames the same as Plex is on. The
 * account keeps its password, progress and bookmarks. Komga signs people in
 * by email and is left alone, as are service accounts, accounts whose name
 * another account in the app has, and app admin accounts other than an
 * Allseerr admin's own. The person is told of each rename.
 */
export const renameToPlexUsername = async ({
  user,
  account,
  client,
  accounts,
  connectionAccountId,
  targetName,
  keyStillWorks,
}: {
  user: User;
  account: UserAppAccount;
  client: UserAccessAppClient;
  // Every account in the app, read once for a whole sync
  accounts: AppAccountSummary[];
  connectionAccountId: string | null;
  // The username the person gets in the apps
  targetName: string;
  // Checks the NoBookEnds key made for the account, false when it stopped
  // signing in
  keyStillWorks?: (account: UserAppAccount) => Promise<boolean>;
}): Promise<RenameOutcome> => {
  const appName = USER_ACCESS_APP_NAMES[account.app];

  if (!isMatchingPlexUsernames()) {
    return { status: 'off' };
  }
  if (!client.renameAccount) {
    return { status: 'unsupported' };
  }

  const remote = accounts.find((a) => a.id === account.remoteUserId);

  if (!remote) {
    return { status: 'skipped', message: `${appName} has no such account.` };
  }
  if (serviceReasonFor(account.app, remote, connectionAccountId)) {
    return {
      status: 'skipped',
      message: `${remote.username} is a service account.`,
    };
  }
  if (remote.isAdmin && !user.hasPermission(Permission.ADMIN)) {
    return {
      status: 'skipped',
      message: `${remote.username} is a ${appName} admin account.`,
    };
  }
  if (remote.username === targetName) {
    return { status: 'same' };
  }

  const clash = accounts.find(
    (a) =>
      a.id !== remote.id &&
      a.username.trim().toLowerCase() === targetName.toLowerCase()
  );

  if (clash) {
    return {
      status: 'clash',
      message: `${appName} already has an account named ${clash.username}, so ${remote.username} keeps its name. Rename or remove the other account in ${appName} first.`,
    };
  }

  try {
    await client.renameAccount(remote, targetName);
  } catch (e) {
    return {
      status: 'failed',
      message: `Could not rename ${remote.username} in ${appName}: ${(e as Error).message}`,
    };
  }

  const from = remote.username;
  remote.username = targetName;
  account.remoteUsername = targetName;
  await getRepository(UserAppAccount).update(account.id, {
    remoteUsername: targetName,
  });

  // The connection signs in with the account's name, so it follows it
  const settings = getSettings();
  const connection = settings.userAccess[account.app];

  if (connection.username?.trim().toLowerCase() === from.toLowerCase()) {
    settings.userAccess = {
      ...settings.userAccess,
      [account.app]: { ...connection, username: targetName },
    };
    await settings.save();
  }

  // Keys belong to the account, so they keep working; one that stopped is
  // forgotten, and NoBookEnds gets a new one when it next connects
  if (keyStillWorks) {
    const works = await keyStillWorks(account).catch(() => true);

    if (!works) {
      await getRepository(UserAppAccount).update(account.id, {
        nobookendsToken: null,
        nobookendsTokenId: null,
      });
    }
  }

  // One message covers every app renamed to the same name
  const alreadyTold = (getSettings().userAccess.renames ?? []).some(
    (rename) =>
      rename.userId === user.id &&
      rename.to === targetName &&
      Date.now() - new Date(rename.date).getTime() < TOLD_FOR_MS
  );

  await recordRename(user, account.app, from, targetName);
  if (!alreadyTold) {
    sendUsernameChanged(user, targetName);
  }
  logger.info('Renamed an app account to match Plex', {
    label: 'User Access',
    app: account.app,
    userId: user.id,
    from,
    to: targetName,
  });

  return { status: 'renamed', from, to: targetName };
};
