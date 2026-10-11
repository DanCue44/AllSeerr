import OpenLibrary, { getAuthorPhotoUrl } from '@server/api/openlibrary';
import PlexTvAPI from '@server/api/plextv';
import TheAudioDb from '@server/api/theaudiodb';
import { FollowType, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { Watchlist } from '@server/entity/Watchlist';
import type {
  WatchlistItem,
  WatchlistResponse,
} from '@server/interfaces/api/discoverInterfaces';
import { In } from 'typeorm';

// Plex has no albums, books, artists or authors, so these are only ever
// watchlisted here
const LOCAL_ONLY_TYPES = [
  MediaType.MUSIC,
  MediaType.BOOK,
  FollowType.ARTIST,
  FollowType.AUTHOR,
];

/**
 * Adds the photo of each followed artist and author, for their cards. Artist
 * photos come from the TheAudioDB metadata kept in the database, author
 * photos from the cached OpenLibrary author.
 */
export const withFollowImages = async (
  items: Watchlist[]
): Promise<WatchlistItem[]> => {
  const theAudioDb = new TheAudioDb();
  const openLibrary = new OpenLibrary();

  return Promise.all(
    items.map(async (item): Promise<WatchlistItem> => {
      if (item.mediaType === FollowType.ARTIST && item.mbId) {
        const images = await theAudioDb
          .getArtistImages(item.mbId)
          .catch(() => null);
        return { ...item, image: images?.artistThumb ?? null };
      }

      if (item.mediaType === FollowType.AUTHOR && item.olId) {
        const author = await openLibrary.getAuthor(item.olId).catch(() => null);
        return {
          ...item,
          image: getAuthorPhotoUrl(
            author?.photos?.find((photo) => photo > 0),
            'L'
          ),
        };
      }

      return item;
    })
  );
};

/**
 * True when the user keeps movies or series on the local watchlist, which
 * then stands in for their Plex watchlist
 */
export const hasLocalMovieOrSeriesWatchlist = async (
  userId: number
): Promise<boolean> =>
  getRepository(Watchlist).exist({
    where: {
      requestedBy: { id: userId },
      mediaType: In([MediaType.MOVIE, MediaType.TV]),
    },
  });

/**
 * A Plex user's watchlist: the albums, books, artists and authors they
 * watchlisted here, newest first, followed by their Plex watchlist. Without
 * those this is exactly the Plex watchlist.
 */
export const getPlexUserWatchlist = async ({
  userId,
  plexToken,
  page,
  itemsPerPage,
}: {
  userId: number;
  plexToken: string;
  page: number;
  itemsPerPage: number;
}): Promise<WatchlistResponse> => {
  const offset = (page - 1) * itemsPerPage;

  const [localItems, localTotal] = await getRepository(Watchlist).findAndCount({
    where: {
      requestedBy: { id: userId },
      mediaType: In(LOCAL_ONLY_TYPES),
    },
    order: { createdAt: 'DESC', id: 'DESC' },
    take: itemsPerPage,
    skip: offset,
  });

  const plexSize = itemsPerPage - localItems.length;
  const plexTV = new PlexTvAPI(plexToken);
  // A page filled by local items still needs the Plex total
  const watchlist = await plexTV.getWatchlist({
    offset: Math.max(offset - localTotal, 0),
    size: Math.max(plexSize, 1),
  });

  const plexItems =
    plexSize > 0
      ? watchlist.items.map((item) => ({
          id: item.tmdbId,
          ratingKey: item.ratingKey,
          title: item.title,
          mediaType:
            item.type === 'show' ? ('tv' as const) : ('movie' as const),
          tmdbId: item.tmdbId,
        }))
      : [];

  const totalResults = localTotal + watchlist.totalSize;

  return {
    page,
    totalPages: Math.ceil(totalResults / itemsPerPage),
    totalResults,
    results: [...(await withFollowImages(localItems)), ...plexItems],
  };
};
