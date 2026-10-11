import AmbientBookDetails from '@app/components/AllSeerr/BookDetails';
import BookDetails from '@app/components/BookDetails';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import { getHostAndPort } from '@app/utils/urlHelper';
import type { BookDetails as BookDetailsType } from '@server/models/Book';
import axios from 'axios';
import type { GetServerSideProps, NextPage } from 'next';

interface BookPageProps {
  book?: BookDetailsType;
}

const BookPage: NextPage<BookPageProps> = ({ book }) => {
  const [interfaceStyle] = useInterfaceStyle();

  return interfaceStyle === 'ambient' ? (
    <AmbientBookDetails book={book} />
  ) : (
    <BookDetails book={book} />
  );
};

export const getServerSideProps: GetServerSideProps<BookPageProps> = async (
  ctx
) => {
  try {
    const response = await axios.get<BookDetailsType>(
      `http://${getHostAndPort()}/api/v1/book/${ctx.query.bookId}`,
      {
        headers: ctx.req?.headers?.cookie
          ? { cookie: ctx.req.headers.cookie }
          : undefined,
      }
    );

    return {
      props: {
        book: response.data,
      },
    };
  } catch {
    // The page fetches the book again and shows the error itself
    return { props: {} };
  }
};

export default BookPage;
