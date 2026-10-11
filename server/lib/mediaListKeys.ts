import { UUID_REGEX } from '@server/api/musicbrainz';
import { AUTHOR_ID_REGEX, WORK_ID_REGEX } from '@server/api/openlibrary';
import type { WatchlistType } from '@server/constants/media';
import { FollowType, MediaType } from '@server/constants/media';
import { z } from 'zod';

export type MediaListKey =
  | { tmdbId: number }
  | { mbId: string }
  | { olId: string };

interface MediaListIds {
  tmdbId?: number;
  mbId?: string;
  olId?: string;
}

/**
 * The field a watchlist or blocklist entry keeps its id in: tmdbId for movies
 * and series, mbId for albums and followed artists, olId for books and
 * followed authors
 */
export const getMediaListIdField = (
  mediaType: WatchlistType
): keyof MediaListIds => {
  switch (mediaType) {
    case MediaType.MUSIC:
    case FollowType.ARTIST:
      return 'mbId';
    case MediaType.BOOK:
    case FollowType.AUTHOR:
      return 'olId';
    default:
      return 'tmdbId';
  }
};

/**
 * Watchlist and blocklist entries are keyed on the id each media type is
 * known by: TMDB for movies and series, the MusicBrainz release group for
 * albums and the OpenLibrary work for books. Followed artists and authors
 * are keyed on their MusicBrainz artist and OpenLibrary author ids.
 */
export const getMediaListKey = (
  mediaType: WatchlistType,
  id: number | string
): MediaListKey => {
  const field = getMediaListIdField(mediaType);

  return field === 'tmdbId'
    ? { tmdbId: Number(id) }
    : field === 'mbId'
      ? { mbId: String(id) }
      : { olId: String(id) };
};

/**
 * The key of a request body that names its item with tmdbId, mbId or olId
 */
export const getMediaListBodyKey = (
  body: MediaListIds & { mediaType: WatchlistType }
): MediaListKey => {
  const field = getMediaListIdField(body.mediaType);

  return getMediaListKey(
    body.mediaType,
    field === 'tmdbId' ? Number(body.tmdbId) : (body[field] ?? '')
  );
};

export const isMediaListType = (mediaType: unknown): mediaType is MediaType =>
  Object.values(MediaType).includes(mediaType as MediaType);

/**
 * The watchlist also holds followed artists and authors, the blocklist and
 * favorites do not
 */
export const isWatchlistType = (
  mediaType: unknown
): mediaType is WatchlistType =>
  isMediaListType(mediaType) ||
  Object.values(FollowType).includes(mediaType as FollowType);

/**
 * Checks an id from a path parameter against its media type, so a lookup is
 * never made with an id the type cannot have
 */
export const isValidMediaListId = (
  mediaType: WatchlistType,
  id: string
): boolean => {
  switch (mediaType) {
    case MediaType.MUSIC:
    case FollowType.ARTIST:
      return UUID_REGEX.test(id);
    case MediaType.BOOK:
      return WORK_ID_REGEX.test(id);
    case FollowType.AUTHOR:
      return AUTHOR_ID_REGEX.test(id);
    default:
      return /^\d+$/.test(id);
  }
};

/**
 * Body fields naming a watchlist or blocklist item: tmdbId for movies and
 * series, mbId for albums and olId for books
 */
export const mediaListIds = {
  tmdbId: z.coerce.number().optional(),
  mbId: z.string().regex(UUID_REGEX).optional(),
  olId: z.string().regex(WORK_ID_REGEX).optional(),
};

export const requireMediaListId = (
  value: MediaListIds & { mediaType: WatchlistType },
  ctx: z.RefinementCtx
): void => {
  const field = getMediaListIdField(value.mediaType);

  if (value[field] === undefined || Number.isNaN(value[field])) {
    ctx.addIssue({
      code: 'custom',
      path: [field],
      message: `${field} is required for ${value.mediaType}`,
    });
    return;
  }

  if (
    field !== 'tmdbId' &&
    !isValidMediaListId(value.mediaType, String(value[field]))
  ) {
    ctx.addIssue({
      code: 'custom',
      path: [field],
      message: `${field} is not a valid id for ${value.mediaType}`,
    });
  }
};

/**
 * Body fields naming a watchlist item. The olId of a followed author is an
 * author id, checked against the media type by requireMediaListId.
 */
export const watchlistIds = {
  ...mediaListIds,
  olId: z
    .string()
    .regex(new RegExp(`${WORK_ID_REGEX.source}|${AUTHOR_ID_REGEX.source}`))
    .optional(),
};
