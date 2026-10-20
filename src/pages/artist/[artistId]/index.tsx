import AmbientArtistDetails from '@app/components/Allseerr/ArtistDetails';
import ArtistDetails from '@app/components/ArtistDetails';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import type { NextPage } from 'next';

const ArtistPage: NextPage = () => {
  const [interfaceStyle] = useInterfaceStyle();

  return interfaceStyle === 'ambient' ? (
    <AmbientArtistDetails />
  ) : (
    <ArtistDetails />
  );
};

export default ArtistPage;
