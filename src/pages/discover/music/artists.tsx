import { DiscoverMusicList } from '@app/components/Discover/DiscoverMusic';
import type { NextPage } from 'next';

const DiscoverPopularArtistsPage: NextPage = () => {
  return <DiscoverMusicList list="artists" />;
};

export default DiscoverPopularArtistsPage;
