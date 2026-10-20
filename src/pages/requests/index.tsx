import AmbientRequestList from '@app/components/Allseerr/RequestList';
import RequestList from '@app/components/RequestList';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import type { NextPage } from 'next';

const RequestsPage: NextPage = () => {
  const [interfaceStyle] = useInterfaceStyle();

  return interfaceStyle === 'ambient' ? (
    <AmbientRequestList />
  ) : (
    <RequestList />
  );
};

export default RequestsPage;
