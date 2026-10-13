import UserSettings from '@app/components/UserProfile/UserSettings';
import UserNoBookEnds from '@app/components/UserProfile/UserSettings/UserNoBookEnds';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const UserNoBookEndsPage: NextPage = () => {
  useRouteGuard(Permission.MANAGE_USERS);
  return (
    <UserSettings>
      <UserNoBookEnds />
    </UserSettings>
  );
};

export default UserNoBookEndsPage;
