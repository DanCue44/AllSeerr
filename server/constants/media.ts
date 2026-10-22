export enum MediaRequestStatus {
  PENDING = 1,
  APPROVED,
  DECLINED,
  FAILED,
  COMPLETED,
}

export enum MediaType {
  MOVIE = 'movie',
  TV = 'tv',
  MUSIC = 'music',
  BOOK = 'book',
  // Comic and manga series, sent to Talearr's comics library
  COMIC = 'comic',
}

/**
 * Artists and authors are followed by putting them on the watchlist, beside
 * the titles: artists by their MusicBrainz artist id and authors by their
 * OpenLibrary author id
 */
export enum FollowType {
  ARTIST = 'artist',
  AUTHOR = 'author',
}

export type WatchlistType = MediaType | FollowType;

export enum MediaStatus {
  UNKNOWN = 1,
  PENDING,
  PROCESSING,
  PARTIALLY_AVAILABLE,
  AVAILABLE,
  BLOCKLISTED,
  DELETED,
}

export enum RemovalRequestStatus {
  PENDING = 1,
  APPROVED,
  DECLINED,
  FAILED,
}

export enum SeasonRolloverStatus {
  PENDING = 1,
  KEPT,
  COMPLETED,
  // The automatic seasons are gone, the preexisting ones await an admin
  REVIEW,
}

export enum MediaRequestMonitorMode {
  SEASONS = 'seasons',
  FUTURE = 'future',
  CURRENT = 'current',
}

export type BookFormatChoice = 'ebook' | 'audiobook' | 'both';

export type BookFormat = Exclude<BookFormatChoice, 'both'>;

/**
 * The kinds of comic series Talearr keeps, as its comics API names them
 */
export type ComicKind = 'manga' | 'comic';

export const isComicKind = (value: unknown): value is ComicKind =>
  value === 'manga' || value === 'comic';
