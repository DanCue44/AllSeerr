/**
 * The services book requests can be sent to. TaleArr is a fork of
 * Chaptarr with the same API, so both use the Chaptarr servers, client
 * and request flow; picking TaleArr only turns on what TaleArr adds.
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
 * Whether book requests go to a Chaptarr server, stock Chaptarr or TaleArr
 */
export const usesChaptarr = (
  service?: BookService | string | null
): service is ChaptarrBookService =>
  service === 'chaptarr' || service === 'talearr';

/**
 * Whether the TaleArr only extras are on
 */
export const isTalearrService = (
  service?: BookService | string | null
): service is 'talearr' => service === 'talearr';

/**
 * The name of a book service as shown to users
 */
export const bookServiceName = (service?: BookService | string | null) =>
  service === 'talearr'
    ? 'TaleArr'
    : service === 'lazylibrarian'
      ? 'LazyLibrarian'
      : 'Chaptarr';

/**
 * The arr book requests go to: Chaptarr or TaleArr, otherwise LazyLibrarian
 */
export const bookArrName = (service?: BookService | string | null) =>
  usesChaptarr(service) ? bookServiceName(service) : 'LazyLibrarian';
