import { DiscoverMusicList } from '@app/components/Discover/DiscoverMusic';
import type { NextPage } from 'next';

const DiscoverNewMusicPage: NextPage = () => {
  return <DiscoverMusicList list="new" />;
};

export default DiscoverNewMusicPage;
