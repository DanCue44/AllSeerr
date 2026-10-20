/**
 * The services book requests can be sent to. Talearr is a fork of
 * Chaptarr with the same API, so both use the Chaptarr servers, client
 * and request flow; picking Talearr only turns on what Talearr adds.
 */
export type BookService = 'chaptarr' | 'talearr' | 'lazylibrarian';

export const BOOK_SERVICES: readonly BookService[] = [
  'chaptarr',
  'talearr',
  'lazylibrarian',
];

export const isBookService = (value: unknown): value is BookService =>
  typeof value === 'string' && BOOK_SERVICES.includes(value as BookService);

export type ChaptarrBookService = Extract<BookService, 'chaptarr' | 'talearr'>;

/**
 * Whether book requests go to a Chaptarr server, stock Chaptarr or Talearr
 */
export const usesChaptarr = (
  service?: BookService | string | null
): service is ChaptarrBookService =>
  service === 'chaptarr' || service === 'talearr';

/**
 * Whether the Talearr only extras are on
 */
export const isTalearrService = (
  service?: BookService | string | null
): service is 'talearr' => service === 'talearr';

/**
 * The name of a book service as shown to users
 */
export const bookServiceName = (service?: BookService | string | null) =>
  service === 'talearr'
    ? 'Talearr'
    : service === 'lazylibrarian'
      ? 'LazyLibrarian'
      : 'Chaptarr';

/**
 * The arr book requests go to: Chaptarr or Talearr, otherwise LazyLibrarian
 */
export const bookArrName = (service?: BookService | string | null) =>
  usesChaptarr(service) ? bookServiceName(service) : 'LazyLibrarian';
