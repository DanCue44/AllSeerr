import type LazyLibrarianAPI from '@server/api/lazylibrarian';
import type {
  LazyLibrarianBook,
  LazyLibrarianSearchResult,
} from '@server/api/lazylibrarian';
import OpenLibrary from '@server/api/openlibrary';
import logger from '@server/logger';

// LazyLibrarian's default book source is OpenLibrary, whose book ids are
// the work ids books are keyed on here
const OPENLIBRARY_SOURCE = 'OpenLibrary';

// LazyLibrarian scores a search hit from 0 to 100 against the search term
const MIN_MATCH_SCORE = 90;

// Shared with the Chaptarr matching
export const normalizeBookTitle = (value = ''): string =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/^(the|a|an) /, '')
    .replace(/\s+/g, ' ')
    .trim();

const authorMatches = (
  result: LazyLibrarianSearchResult,
  authorName?: string
): boolean => {
  if (!authorName) {
    return true;
  }

  // Compared on the surname, as sources format given names differently
  const surname = normalizeBookTitle(authorName).split(' ').pop() ?? '';

  return !!surname && normalizeBookTitle(result.authorName).includes(surname);
};

/**
 * Picks the search hit that is the requested book: the same title by the
 * same author, or failing that a confident match by the same author
 */
export const pickLazyLibrarianMatch = (
  results: LazyLibrarianSearchResult[],
  { title, authorName }: { title: string; authorName?: string }
): LazyLibrarianSearchResult | undefined => {
  const byAuthor = results.filter((result) =>
    authorMatches(result, authorName)
  );
  const wantedTitle = normalizeBookTitle(title);

  return (
    byAuthor.find(
      (result) => normalizeBookTitle(result.title) === wantedTitle
    ) ??
    [...byAuthor]
      .filter((result) => result.score >= MIN_MATCH_SCORE)
      .sort((a, b) => b.score - a.score)[0]
  );
};

/**
 * Makes sure LazyLibrarian has the book and returns its LazyLibrarian book
 * id. LazyLibrarian identifies books by the id of its book source, which is
 * the OpenLibrary work id unless it is set up with Google Books, Goodreads or
 * Hardcover. A book is looked up by the id remembered from an earlier
 * request, then by its work id, then added by its work id and, when that
 * does not work, found by title and author in LazyLibrarian's source.
 */
export const addBookToLazyLibrarian = async (
  lazyLibrarian: LazyLibrarianAPI,
  { olId, bookId }: { olId: string; bookId?: string | null }
): Promise<string> => {
  const books = await lazyLibrarian.getAllBooks();
  const hasBook = (id: string, list: LazyLibrarianBook[] = books) =>
    list.some((book) => book.bookId === id);

  if (bookId && hasBook(bookId)) {
    return bookId;
  }

  if (hasBook(olId)) {
    return olId;
  }

  try {
    await lazyLibrarian.addBook(olId, { source: OPENLIBRARY_SOURCE });

    if (await lazyLibrarian.getBook(olId)) {
      return olId;
    }
  } catch (e) {
    logger.debug('LazyLibrarian could not add the book by its work id', {
      label: 'LazyLibrarian',
      olId,
      errorMessage: e.message,
    });
  }

  const summary = await new OpenLibrary().getWorkSummary(olId);

  if (!summary) {
    throw new Error(`OpenLibrary has no work ${olId}`);
  }

  const authorName = summary.author_name?.[0];
  const results = await lazyLibrarian.findBook(
    [summary.title, authorName].filter(Boolean).join(' ')
  );
  const match = pickLazyLibrarianMatch(results, {
    title: summary.title,
    authorName,
  });

  if (!match) {
    throw new Error(
      `LazyLibrarian found no match for ${summary.title}${
        authorName ? ` by ${authorName}` : ''
      }`
    );
  }

  if (hasBook(match.bookId)) {
    return match.bookId;
  }

  await lazyLibrarian.addBook(match.bookId);

  if (!(await lazyLibrarian.getBook(match.bookId))) {
    throw new Error(`LazyLibrarian did not add book ${match.bookId}`);
  }

  return match.bookId;
};
