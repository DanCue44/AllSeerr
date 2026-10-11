import { DiscoverBookList } from '@app/components/Discover/DiscoverBooks';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';

const DiscoverSubjectBooksPage: NextPage = () => {
  const router = useRouter();

  return (
    <DiscoverBookList list="subject" subject={router.query.subject as string} />
  );
};

export default DiscoverSubjectBooksPage;
