import Downloads from '@app/components/AllSeerr/Downloads';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@server/lib/permissions';
import type { NextPage } from 'next';

const DownloadsPage: NextPage = () => {
  useRouteGuard(Permission.MANAGE_REQUESTS);
  return <Downloads />;
};

export default DownloadsPage;
