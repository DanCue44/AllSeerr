import UserSettings from '@app/components/UserProfile/UserSettings';
import UserNoBookEnds from '@app/components/UserProfile/UserSettings/UserNoBookEnds';
import type { NextPage } from 'next';

const UserNoBookEndsPage: NextPage = () => {
  return (
    <UserSettings>
      <UserNoBookEnds />
    </UserSettings>
  );
};

export default UserNoBookEndsPage;
