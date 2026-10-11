/**
 * Sorting and filters of the music and books libraries, kept in the address
 * bar as sortBy, albumType and format, and turned into GET /media options.
 */
export const MEDIA_LIBRARY_SORT_OPTIONS = [
  'mediaAdded.desc',
  'title.asc',
  'title.desc',
  'creator.asc',
  'creator.desc',
  'releaseDate.desc',
  'releaseDate.asc',
] as const;

export type MediaLibrarySortOption =
  (typeof MEDIA_LIBRARY_SORT_OPTIONS)[number];

export const ALBUM_TYPE_FILTERS = ['album', 'ep', 'single', 'other'] as const;
export type AlbumTypeFilter = (typeof ALBUM_TYPE_FILTERS)[number];

export const BOOK_FORMAT_FILTERS = ['ebook', 'audiobook', 'both'] as const;
export type BookFormatFilter = (typeof BOOK_FORMAT_FILTERS)[number];

const pick = <T extends string>(
  options: readonly T[],
  value: unknown
): T | undefined => (options.includes(value as T) ? (value as T) : undefined);

export const getMediaLibrarySort = (value: unknown): MediaLibrarySortOption =>
  pick(MEDIA_LIBRARY_SORT_OPTIONS, value) ?? 'mediaAdded.desc';

/**
 * The GET /media query string for a page of the library. Recently added is
 * the media table's own order, so it needs no sort.
 */
export const getMediaLibraryQuery = ({
  mediaType,
  sortBy,
  albumType,
  format,
  take,
  skip,
}: {
  mediaType: 'music' | 'book';
  sortBy?: unknown;
  albumType?: unknown;
  format?: unknown;
  take: number;
  skip: number;
}): string => {
  const params = new URLSearchParams({
    filter: 'allavailable',
    mediaType,
    take: String(take),
    skip: String(skip),
  });
  const [sort, direction] = getMediaLibrarySort(sortBy).split('.');

  if (sort !== 'mediaAdded') {
    params.set('sort', sort);
    params.set('sortDirection', direction);
  }

  const type =
    mediaType === 'music' ? pick(ALBUM_TYPE_FILTERS, albumType) : undefined;
  const bookFormat =
    mediaType === 'book' ? pick(BOOK_FORMAT_FILTERS, format) : undefined;

  if (type) {
    params.set('albumType', type);
  }

  if (bookFormat) {
    params.set('format', bookFormat);
  }

  return params.toString();
};
