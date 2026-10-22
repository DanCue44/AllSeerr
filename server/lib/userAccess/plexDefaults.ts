import PlexTvAPI from '@server/api/plextv';
import { UserType } from '@server/constants/user';
import type { UserAccessApp } from '@server/constants/userAccess';
import {
  USER_ACCESS_APPS,
  UserAppAccountGrant,
  UserAppAccountStatus,
} from '@server/constants/userAccess';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { UserAccessProfile } from '@server/entity/UserAccessProfile';
import { UserAppAccount } from '@server/entity/UserAppAccount';
import type { PlexDefaultChange } from '@server/interfaces/api/userAccessInterfaces';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { isAgeLimit, isRestricted } from '@server/lib/userAccess/ageLimits';
import logger from '@server/logger';

export type { PlexDefaultChange };

/**
 * The Plex ids of everyone the Plex server is shared with, read from the
 * owner's Plex account: a person counts when their entry on the shared list
 * names this server's machine id. Null when the list cannot be read, so a
 * Plex outage never takes access away.
 */
export type PlexMemberSource = () => Promise<Set<number> | null>;

const readPlexMembers: PlexMemberSource = async () => {
  const settings = getSettings();

  if (!settings.plex.machineId) {
    return null;
  }

  const owner = await getRepository(User).findOne({
    select: { id: true, plexToken: true },
    where: { id: 1 },
  });

  if (!owner?.plexToken) {
    return null;
  }

  try {
    const response = await new PlexTvAPI(owner.plexToken).getUsers();
    const members = new Set<number>();

    for (const shared of response.MediaContainer.User ?? []) {
      const onThisServer = shared.Server?.some(
        (server) => server.$.machineIdentifier === settings.plex.machineId
      );

      if (onThisServer) {
        members.add(parseInt(shared.$.id));
      }
    }

    return members;
  } catch (e) {
    logger.warn('Could not read the Plex shared list for default access', {
      label: 'User Access',
      errorMessage: (e as Error).message,
    });
    return null;
  }
};

let memberSource: PlexMemberSource = readPlexMembers;

// Lets tests stand in for the Plex shared list
export const setPlexMemberSource = (source: PlexMemberSource | null): void => {
  memberSource = source ?? readPlexMembers;
};

/**
 * Whether a person shares the Plex server. The owner (the first user) always
 * does.
 */
const isPlexMember = (user: User, members: Set<number>): boolean =>
  user.id === 1 ||
  (user.userType === UserType.PLEX &&
    user.plexId != null &&
    members.has(user.plexId));

/**
 * Gives the default apps to everyone with access to the Plex server and takes
 * them back from people who lost it. Only accounts the default gave are
 * changed: an admin's choice for a person, on or off, is left alone. Returns
 * what changed, for showing after "Apply to everyone now".
 */
export const applyPlexDefaults = async (
  options: { userIds?: number[] } = {}
): Promise<PlexDefaultChange[]> => {
  const defaults = getSettings().userAccess.plexDefault;

  if (!defaults?.enabled) {
    return [];
  }

  const members = await memberSource();

  if (!members) {
    return [];
  }

  const userRepository = getRepository(User);
  const accountRepository = getRepository(UserAppAccount);
  const profileRepository = getRepository(UserAccessProfile);
  const users = await userRepository.find({ order: { id: 'ASC' } });
  const changes: PlexDefaultChange[] = [];

  for (const user of users) {
    if (options.userIds && !options.userIds.includes(user.id)) {
      continue;
    }

    const member = isPlexMember(user, members);
    const accounts = await accountRepository.find({
      where: { user: { id: user.id } },
    });

    for (const app of USER_ACCESS_APPS as readonly UserAccessApp[]) {
      const appDefault = defaults.apps[app];
      const account = accounts.find((a) => a.app === app);
      const explicit =
        !!account && account.grantedBy !== UserAppAccountGrant.PLEX;

      if (explicit) {
        continue;
      }

      const shouldHave = member && !!appDefault?.enabled;

      if (shouldHave && !account) {
        await accountRepository.save(
          new UserAppAccount({
            user,
            app,
            enabled: true,
            libraryIds: appDefault.libraryIds?.length
              ? appDefault.libraryIds
              : null,
            status: UserAppAccountStatus.NONE,
            grantedBy: UserAppAccountGrant.PLEX,
          })
        );
        changes.push(changeFor(user, app, 'granted'));
      } else if (shouldHave && account && !account.enabled) {
        account.enabled = true;
        await accountRepository.save(account);
        changes.push(changeFor(user, app, 'granted'));
      } else if (!shouldHave && account?.enabled) {
        account.enabled = false;
        await accountRepository.save(account);
        changes.push(changeFor(user, app, 'removed'));
      }
    }

    // The default age limit only fills in for people with none set, and never
    // for admins, who are never limited
    if (
      member &&
      isAgeLimit(defaults.ageLimit) &&
      isRestricted(defaults.ageLimit) &&
      !user.hasPermission(Permission.ADMIN)
    ) {
      const profile = await profileRepository.findOne({
        where: { user: { id: user.id } },
      });

      if (!profile) {
        await profileRepository.save(
          new UserAccessProfile({
            user,
            ageLimit: defaults.ageLimit,
            includeUnrated: defaults.includeUnrated,
          })
        );
      }
    }
  }

  if (changes.length) {
    logger.info('Applied default access for Plex users', {
      label: 'User Access',
      granted: changes.filter((c) => c.change === 'granted').length,
      removed: changes.filter((c) => c.change === 'removed').length,
    });
  }

  return changes;
};

const changeFor = (
  user: User,
  app: UserAccessApp,
  change: PlexDefaultChange['change']
): PlexDefaultChange => ({
  userId: user.id,
  displayName: user.displayName,
  app,
  change,
});

/**
 * Gives new Plex users the default apps right away instead of at the next
 * sync. Never fails the sign-in or import it runs after.
 */
export const grantPlexDefaults = async (
  userIds: number | number[]
): Promise<void> => {
  try {
    await applyPlexDefaults({
      userIds: Array.isArray(userIds) ? userIds : [userIds],
    });
  } catch (e) {
    logger.error('Could not give default access to a new Plex user', {
      label: 'User Access',
      errorMessage: (e as Error).message,
    });
  }
};
