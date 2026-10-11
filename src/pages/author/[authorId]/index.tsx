import AmbientAuthorDetails from '@app/components/AllSeerr/AuthorDetails';
import AuthorDetails from '@app/components/AuthorDetails';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import type { NextPage } from 'next';

const AuthorPage: NextPage = () => {
  const [interfaceStyle] = useInterfaceStyle();

  return interfaceStyle === 'ambient' ? (
    <AmbientAuthorDetails />
  ) : (
    <AuthorDetails />
  );
};

export default AuthorPage;
