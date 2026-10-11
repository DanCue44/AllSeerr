import OpenLibrary, { getOlId } from '@server/api/openlibrary';
import type {
  OlAuthorSearchResponse,
  OlSearchResponse,
} from '@server/api/openlibrary/interfaces';
import Media from '@server/entity/Media';
import { mapAuthorResult, mapBookResult } from '@server/models/Book';
import type { AuthorResult, BookResult } from '@server/models/Search';

export const BOOK_PAGE_SIZE = 20;

const emptySearch = { numFound: 0, start: 0, docs: [] };

/**
 * Searches OpenLibrary for books, best matches first, and on the first page
 * for authors as well
 */
export const searchBooks = async ({
  query,
  page = 1,
  bookLimit = BOOK_PAGE_SIZE,
  authorLimit = 10,
}: {
  query: string;
  page?: number;
  bookLimit?: number;
  authorLimit?: number;
}): Promise<{
  results: (BookResult | AuthorResult)[];
  totalResults: number;
  totalPages: number;
}> => {
  const openLibrary = new OpenLibrary();

  const [books, authors] = await Promise.all([
    openLibrary
      .searchBooks({ query, page, limit: bookLimit })
      .catch((): OlSearchResponse => emptySearch),
    page === 1 && authorLimit > 0
      ? openLibrary
          .searchAuthors({ query, limit: authorLimit })
          .catch((): OlAuthorSearchResponse => emptySearch)
      : emptySearch,
  ]);

  const media = await Media.getRelatedBooks(
    books.docs.map((doc) => getOlId(doc.key))
  );
  const mediaMap = new Map(media.map((m) => [m.olId, m]));

  return {
    results: [
      ...books.docs.map((doc) =>
        mapBookResult(doc, mediaMap.get(getOlId(doc.key)))
      ),
      ...authors.docs.map((doc) => mapAuthorResult(doc)),
    ],
    totalResults: books.numFound + authors.docs.length,
    totalPages: Math.max(Math.ceil(books.numFound / bookLimit), 1),
  };
};
