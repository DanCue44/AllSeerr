import { DiscoverMusicList } from '@app/components/Discover/DiscoverMusic';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';

const DiscoverMusicGenrePage: NextPage = () => {
  const router = useRouter();

  return (
    <DiscoverMusicList list="genre" genre={router.query.genre as string} />
  );
};

export default DiscoverMusicGenrePage;
