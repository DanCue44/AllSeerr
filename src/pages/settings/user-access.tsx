import SettingsLayout from '@app/components/Settings/SettingsLayout';
import SettingsUserAccess from '@app/components/Settings/SettingsUserAccess';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const SettingsUserAccessPage: NextPage = () => {
  useRouteGuard(Permission.ADMIN);
  return (
    <SettingsLayout>
      <SettingsUserAccess />
    </SettingsLayout>
  );
};

export default SettingsUserAccessPage;
