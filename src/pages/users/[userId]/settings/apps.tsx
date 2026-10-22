import UserSettings from '@app/components/UserProfile/UserSettings';
import UserReadingApps from '@app/components/UserProfile/UserSettings/UserReadingApps';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const UserReadingAppsPage: NextPage = () => {
  useRouteGuard(Permission.MANAGE_USERS);
  return (
    <UserSettings>
      <UserReadingApps />
    </UserSettings>
  );
};

export default UserReadingAppsPage;
