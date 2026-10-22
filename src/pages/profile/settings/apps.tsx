import UserSettings from '@app/components/UserProfile/UserSettings';
import UserReadingApps from '@app/components/UserProfile/UserSettings/UserReadingApps';
import type { NextPage } from 'next';

const UserReadingAppsPage: NextPage = () => {
  return (
    <UserSettings>
      <UserReadingApps />
    </UserSettings>
  );
};

export default UserReadingAppsPage;
