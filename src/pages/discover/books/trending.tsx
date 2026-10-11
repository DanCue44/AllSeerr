import { DiscoverBookList } from '@app/components/Discover/DiscoverBooks';
import type { NextPage } from 'next';

const DiscoverTrendingBooksPage: NextPage = () => {
  return <DiscoverBookList list="trending" />;
};

export default DiscoverTrendingBooksPage;
