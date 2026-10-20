import AmbientRequestList from '@app/components/Allseerr/RequestList';
import RequestList from '@app/components/RequestList';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const UserRequestsPage: NextPage = () => {
  useRouteGuard([Permission.MANAGE_REQUESTS, Permission.REQUEST_VIEW], {
    type: 'or',
  });
  const [interfaceStyle] = useInterfaceStyle();

  return interfaceStyle === 'ambient' ? (
    <AmbientRequestList />
  ) : (
    <RequestList />
  );
};

export default UserRequestsPage;
