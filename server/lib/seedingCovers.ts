import type ChaptarrAPI from '@server/api/servarr/chaptarr';
import type { SeedingTorrent } from '@server/interfaces/api/downloadInterfaces';
import cacheManager from '@server/lib/cache';
import logger from '@server/logger';

// A found cover rarely changes; a miss is tried again sooner in case the
// book reaches the metadata sources
const FOUND_TTL = 3 * 86400;
const MISSING_TTL = 6 * 3600;
// Lookups run a few at a time so the Seeding page stays fast
const CONCURRENCY = 3;
const MISSING = '';

export interface CoverSources {
  // Talearr's own metadata lookup (Hardcover backed)
  talearr: Pick<ChaptarrAPI, 'lookupBooks'>;
  // Google Books, when a key is set
  googleBooks?: {
    findCover(
      title: string,
      author: string | null
    ): Promise<string | undefined>;
  };
}

const cacheKey = (torrent: SeedingTorrent) =>
  `seeding-cover:${torrent.downloadId || torrent.title}`;

const absoluteCover = (
  images: { coverType?: string; remoteUrl?: string }[] | undefined
): string | undefined =>
  images?.find(
    (image) =>
      ['cover', 'poster'].includes(image.coverType?.toLowerCase() ?? '') &&
      /^https?:\/\//.test(image.remoteUrl ?? '')
  )?.remoteUrl ??
  images?.find((image) => /^https?:\/\//.test(image.remoteUrl ?? ''))
    ?.remoteUrl;

const findCover = async (
  sources: CoverSources,
  title: string,
  author: string | null
): Promise<string | undefined> => {
  try {
    const books = await sources.talearr.lookupBooks(
      [title, author].filter(Boolean).join(' ')
    );
    const cover = absoluteCover(
      (books[0] as { images?: { coverType?: string; remoteUrl?: string }[] })
        ?.images
    );

    if (cover) {
      return cover;
    }
  } catch (e) {
    logger.debug('Talearr could not look up a seeding book', {
      label: 'Downloads',
      title,
      errorMessage: e.message,
    });
  }

  return sources.googleBooks?.findCover(title, author);
};

/**
 * Gives torrents Talearr has no book for (ratio filler, unmatched downloads)
 * a cover, looked up from the title and author read from their file names
 */
export const addLookupCovers = async (
  sources: CoverSources,
  torrents: SeedingTorrent[]
): Promise<void> => {
  const store = cacheManager.getCache('chaptarr').data;
  const todo: SeedingTorrent[] = [];

  for (const torrent of torrents) {
    if (torrent.posterUrl || torrent.bookId !== null || !torrent.bookTitle) {
      continue;
    }

    const cached = store.get<string>(cacheKey(torrent));

    if (cached === undefined) {
      todo.push(torrent);
    } else if (cached !== MISSING) {
      torrent.posterUrl = cached;
    }
  }

  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const torrent = todo[next++];
      const cover = await findCover(
        sources,
        torrent.bookTitle ?? torrent.title,
        torrent.authorName
      );

      store.set(
        cacheKey(torrent),
        cover ?? MISSING,
        cover ? FOUND_TTL : MISSING_TTL
      );

      if (cover) {
        torrent.posterUrl = cover;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker)
  );
};
