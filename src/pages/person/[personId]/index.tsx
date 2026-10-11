import AmbientPersonDetails from '@app/components/AllSeerr/PersonDetails';
import PersonDetails from '@app/components/PersonDetails';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import type { NextPage } from 'next';

const PersonPage: NextPage = () => {
  const [interfaceStyle] = useInterfaceStyle();

  return interfaceStyle === 'ambient' ? (
    <AmbientPersonDetails />
  ) : (
    <PersonDetails />
  );
};

export default PersonPage;
