import type { WatchlistType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import type { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import { getMediaListKey } from '@server/lib/mediaListKeys';

/**
 * Whether the user has the title on their watchlist, for the title pages,
 * or follows the artist or author, for the artist and author pages
 */
export const isOnUserWatchlist = async (
  user: User | undefined,
  mediaType: WatchlistType,
  id: number | string
): Promise<boolean> => {
  // An unset user id would match every user's watchlist
  if (!user) {
    return false;
  }

  return getRepository(Watchlist).exist({
    where: {
      ...getMediaListKey(mediaType, id),
      mediaType,
      requestedBy: { id: user.id },
    },
  });
};
