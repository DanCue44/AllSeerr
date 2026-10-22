import AmbientBookDetails from '@app/components/Allseerr/BookDetails';
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

// The page waits this long at most for the book before it is sent; after
// that it shows its loading state and fetches the book itself, so a slow
// catalog never leaves a blank screen
const SERVER_PROPS_TIMEOUT = 1500;

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
        timeout: SERVER_PROPS_TIMEOUT,
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
