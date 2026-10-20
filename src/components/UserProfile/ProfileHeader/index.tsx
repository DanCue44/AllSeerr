import UserAvatar from '@app/components/Allseerr/RequestList/UserAvatar';
import { statusTone } from '@app/components/Allseerr/Title/styles';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import type { User } from '@app/hooks/useUser';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { CogIcon, UserIcon } from '@heroicons/react/24/solid';
import { hasPermission as userHasPermission } from '@server/lib/permissions';
import Link from 'next/link';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.UserProfile.ProfileHeader', {
  settings: 'Edit Settings',
  profile: 'View Profile',
  joindate: 'Joined {joindate}',
  userid: 'User ID: {userid}',
  owner: 'Owner',
  admin: 'Admin',
  user: 'User',
});

interface ProfileHeaderProps {
  user: User;
  isSettingsPage?: boolean;
}

const ProfileHeader = ({ user, isSettingsPage }: ProfileHeaderProps) => {
  const intl = useIntl();
  const { user: loggedInUser, hasPermission } = useUser();
  const [interfaceStyle] = useInterfaceStyle();

  const subtextItems: React.ReactNode[] = [
    intl.formatMessage(messages.joindate, {
      joindate: intl.formatDate(user.createdAt, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    }),
  ];

  if (hasPermission(Permission.MANAGE_REQUESTS)) {
    subtextItems.push(intl.formatMessage(messages.userid, { userid: user.id }));
  }

  const profileHref =
    user.id === loggedInUser?.id ? '/profile' : `/users/${user.id}`;

  const actionButton =
    (loggedInUser?.id === user.id ||
      (user.id !== 1 && hasPermission(Permission.MANAGE_USERS))) &&
    !isSettingsPage ? (
      <Link
        href={
          loggedInUser?.id === user.id
            ? `/profile/settings`
            : `/users/${user.id}/settings`
        }
        passHref
        legacyBehavior
      >
        <Button as="a">
          <CogIcon />
          <span>{intl.formatMessage(messages.settings)}</span>
        </Button>
      </Link>
    ) : (
      isSettingsPage && (
        <Link href={profileHref} passHref legacyBehavior>
          <Button as="a">
            <UserIcon />
            <span>{intl.formatMessage(messages.profile)}</span>
          </Button>
        </Link>
      )
    );

  if (interfaceStyle === 'ambient') {
    const isOwner = user.id === 1;
    const isAdmin =
      !isOwner && userHasPermission(Permission.ADMIN, user.permissions);

    return (
      <div className="relative z-40 mb-8 mt-6 flex flex-col items-center gap-5 rounded-[28px] bg-as-surface/90 px-6 py-7 text-center backdrop-blur-xl lg:flex-row lg:gap-7 lg:px-8 lg:text-left">
        <UserAvatar
          id={user.id}
          name={user.displayName}
          avatar={user.avatar}
          size={112}
          className="ring-4 ring-as-ground/60"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 lg:justify-start">
            <h1 className="min-w-0 break-words font-display text-[26px] font-medium leading-tight text-as-ink sm:text-[32px]">
              <Link href={profileHref} className="hover:text-as-accent-soft">
                {user.displayName}
              </Link>
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold ${
                isOwner || isAdmin ? statusTone.accent : statusTone.neutral
              }`}
            >
              {intl.formatMessage(
                isOwner
                  ? messages.owner
                  : isAdmin
                    ? messages.admin
                    : messages.user
              )}
            </span>
          </div>
          {user.email && user.displayName.toLowerCase() !== user.email && (
            <div className="mt-1 truncate text-[15px] text-as-ink-muted">
              {user.email}
            </div>
          )}
          <p className="mt-2 text-sm text-as-ink-faint">
            {subtextItems.reduce((prev, curr) => (
              <>
                {prev} · {curr}
              </>
            ))}
          </p>
        </div>
        {actionButton && (
          <div className="flex w-full justify-center sm:w-auto [&_a]:h-11 [&_a]:w-full sm:[&_a]:w-auto">
            {actionButton}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative z-40 mb-12 mt-6 lg:flex lg:items-end lg:justify-between lg:space-x-5">
      <div className="flex items-end justify-items-end space-x-5">
        <div className="flex-shrink-0">
          <div className="relative">
            <CachedImage
              type="avatar"
              className="h-24 w-24 rounded-full bg-gray-600 object-cover ring-1 ring-gray-700"
              src={user.avatar}
              alt=""
              width={96}
              height={96}
            />
            <span
              className="absolute inset-0 rounded-full shadow-inner"
              aria-hidden="true"
            />
          </div>
        </div>
        <div className="pt-1.5">
          <h1 className="mb-1 flex flex-col sm:flex-row sm:items-center">
            <Link
              href={
                user.id === loggedInUser?.id ? '/profile' : `/users/${user.id}`
              }
              className="text-overseerr text-lg font-bold hover:to-purple-200 sm:text-2xl"
            >
              {user.displayName}
            </Link>
            {user.email && user.displayName.toLowerCase() !== user.email && (
              <span className="text-sm text-gray-400 sm:ml-2 sm:text-lg">
                ({user.email})
              </span>
            )}
          </h1>
          <p className="text-sm font-medium text-gray-400">
            {subtextItems.reduce((prev, curr) => (
              <>
                {prev} | {curr}
              </>
            ))}
          </p>
        </div>
      </div>
      <div className="mt-6 flex flex-col-reverse justify-stretch space-y-4 space-y-reverse lg:flex-row lg:justify-end lg:space-x-3 lg:space-y-0 lg:space-x-reverse">
        {(loggedInUser?.id === user.id ||
          (user.id !== 1 && hasPermission(Permission.MANAGE_USERS))) &&
        !isSettingsPage ? (
          <Link
            href={
              loggedInUser?.id === user.id
                ? `/profile/settings`
                : `/users/${user.id}/settings`
            }
            passHref
            legacyBehavior
          >
            <Button as="a">
              <CogIcon />
              <span>{intl.formatMessage(messages.settings)}</span>
            </Button>
          </Link>
        ) : (
          isSettingsPage && (
            <Link
              href={
                loggedInUser?.id === user.id ? `/profile` : `/users/${user.id}`
              }
              passHref
              legacyBehavior
            >
              <Button as="a">
                <UserIcon />
                <span>{intl.formatMessage(messages.profile)}</span>
              </Button>
            </Link>
          )
        )}
      </div>
    </div>
  );
};

export default ProfileHeader;
