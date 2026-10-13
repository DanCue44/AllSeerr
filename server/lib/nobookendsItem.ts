import OpenLibrary, { getOlId } from '@server/api/openlibrary';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import {
  ITEM_ID_KEYS,
  getAudiobookshelfItemId,
  getLibraryId,
  rememberAudiobookshelfItemIds,
} from '@server/lib/audiobookshelfItem';
import type { NoBookEndsFormat } from '@server/lib/nobookends';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

// Books from the title search that are checked against the library
const MAX_HINT_CANDIDATES = 3;

export interface NoBookEndsItem {
  olId: string;
  format: NoBookEndsFormat;
  mediaId: number;
  title: string | null;
  status: MediaStatus;
  statusAudio: MediaStatus;
}

export interface NoBookEndsItemHints {
  title?: string;
  author?: string;
}

const LIVE_STATUSES = [MediaStatus.AVAILABLE, MediaStatus.PARTIALLY_AVAILABLE];

const getStatus = (media: Media, format: NoBookEndsFormat): MediaStatus =>
  format === 'ebook' ? media.status : media.statusAudio;

/**
 * The format an item is of a book. An item that is both, in a single
 * library, counts as the audiobook when that is available.
 */
const getItemFormat = (media: Media, itemId: string): NoBookEndsFormat => {
  if (media.absAudiobookItemId !== itemId) {
    return 'ebook';
  }

  return media.absEbookItemId === itemId &&
    !LIVE_STATUSES.includes(media.statusAudio) &&
    LIVE_STATUSES.includes(media.status)
    ? 'ebook'
    : 'audiobook';
};

const getWorkTitle = async (olId: string): Promise<string | null> => {
  try {
    return (await new OpenLibrary().getWork(olId)).title || null;
  } catch (e) {
    logger.debug('Failed to fetch the title of a book', {
      label: 'NoBookEnds',
      olId,
      errorMessage: e.message,
    });
    return null;
  }
};

const toItem = (
  media: Media,
  format: NoBookEndsFormat,
  title: string | null
): NoBookEndsItem => ({
  olId: media.olId as string,
  format,
  mediaId: media.id,
  title,
  status: media.status,
  statusAudio: media.statusAudio,
});

/**
 * Finds the book of an unknown item from the title and author the app
 * has: books with that title AllSeerr knows are looked up in the library
 * the way book pages do, and the item ids they turn out to have are kept.
 */
const resolveFromHints = async (
  itemId: string,
  hints: NoBookEndsItemHints
): Promise<NoBookEndsItem | undefined> => {
  const settings = getSettings().audiobookshelf;
  const title = hints.title?.trim();
  const author = hints.author?.trim();

  if (!title || !settings.url?.trim() || !settings.apiKey) {
    return undefined;
  }

  const search = await new OpenLibrary()
    .searchBooks({
      query: [title, author].filter(Boolean).join(' '),
      limit: 10,
    })
    .catch(() => undefined);
  const docs = new Map(
    (search?.docs ?? []).map((doc) => [getOlId(doc.key), doc])
  );

  if (!docs.size) {
    return undefined;
  }

  const known = await getRepository(Media).find({
    where: [...docs.keys()].map((olId) => ({
      olId,
      mediaType: MediaType.BOOK,
    })),
  });
  const candidates = [...docs.keys()]
    .map((olId) => known.find((media) => media.olId === olId))
    .filter((media): media is Media => !!media)
    .slice(0, MAX_HINT_CANDIDATES);

  const lookups = candidates.flatMap((media) =>
    (['ebook', 'audiobook'] as const)
      .filter((format) => LIVE_STATUSES.includes(getStatus(media, format)))
      .map(async (format) => {
        const libraryId = getLibraryId(settings, format);
        const doc = docs.get(media.olId as string);

        if (!libraryId || !doc) {
          return undefined;
        }

        const found = await getAudiobookshelfItemId(settings, libraryId, {
          olId: media.olId as string,
          title: doc.title,
          authors: doc.author_name ?? (author ? [author] : []),
        });

        if (found !== undefined) {
          await rememberAudiobookshelfItemIds(media, { [format]: found });
        }

        return found === itemId ? toItem(media, format, doc.title) : undefined;
      })
  );

  return (await Promise.all(lookups)).find((item) => !!item);
};

/**
 * The book an Audiobookshelf library item is of, among the books AllSeerr
 * knows. Items found before are looked up in the database; with a title,
 * an unknown item is looked for in the library.
 */
export const findNoBookEndsItem = async (
  itemId: string,
  hints: NoBookEndsItemHints = {}
): Promise<NoBookEndsItem | undefined> => {
  const media = await getRepository(Media).findOne({
    where: [
      { [ITEM_ID_KEYS.audiobook]: itemId, mediaType: MediaType.BOOK },
      { [ITEM_ID_KEYS.ebook]: itemId, mediaType: MediaType.BOOK },
    ],
  });

  if (media?.olId) {
    return toItem(
      media,
      getItemFormat(media, itemId),
      await getWorkTitle(media.olId)
    );
  }

  return resolveFromHints(itemId, hints);
};
