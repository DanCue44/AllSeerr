import { DiscoverMusicList } from '@app/components/Discover/DiscoverMusic';
import type { NextPage } from 'next';

const DiscoverPopularMusicPage: NextPage = () => {
  return <DiscoverMusicList list="popular" />;
};

export default DiscoverPopularMusicPage;
