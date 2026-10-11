import { DiscoverBookList } from '@app/components/Discover/DiscoverBooks';
import type { NextPage } from 'next';

const DiscoverPopularBooksPage: NextPage = () => {
  return <DiscoverBookList list="popular" />;
};

export default DiscoverPopularBooksPage;
