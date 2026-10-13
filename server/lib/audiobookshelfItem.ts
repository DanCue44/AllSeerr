import { isEditionMatch, normalizeTitle } from '@server/api/audible/match';
import type { AudiobookshelfBookItem } from '@server/api/audiobookshelf';
import AudiobookshelfAPI from '@server/api/audiobookshelf';
import OpenLibrary from '@server/api/openlibrary';
import { MediaStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import cacheManager from '@server/lib/cache';
import {
  getNoBookEndsItemUrl,
  isNoBookEndsLinkEnabled,
} from '@server/lib/nobookends';
import type { AudiobookshelfSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { getAudiobookshelfUrl } from '@server/models/Book';

// Matches change rarely, misses are asked again sooner as Audiobookshelf may
// still be scanning a new import, and failures are not retried right away
const MATCH_TTL = 12 * 60 * 60;
const MISS_TTL = 30 * 60;
const UNKNOWN_TTL = 2 * 60;
// Each search may take this long, and the book page waits this long for
// all of them before linking to a title search instead. A lookup that runs
// over keeps going and is remembered for the next page load.
const REQUEST_TIMEOUT = 1500;
export const LOOKUP_BUDGET = 2000;
const SEARCH_LIMIT = 10;
// Single words shorter than this find too many books to be worth a search
const MIN_WORD_SEARCH_LENGTH = 4;

// A series number before a title, such as "Book 2 - " or "01. "
const SERIES_NUMBER =
  /^(?:(?:book|vol(?:ume)?|part|no)\.?\s*)?#?\d+(?:\.\d+)?\s*(?:[-:.)\u2013]\s*)?/i;
const SURROUNDING_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export interface AudiobookshelfBook {
  olId: string;
  title: string;
  authors: string[];
  // Audible product of the audiobook, matched against the item's ASIN
  asin?: string;
}

interface CachedItem {
  // undefined while unknown, null when the library has no such book
  itemId?: string | null;
}

const normalizeId = (value?: string): string =>
  (value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

/**
 * Titles an item may go by: its own, the part after a series prefix such as
 * "The Expanse 01 - Leviathan Wakes" and the main title of an alternative
 * title such as "The Hobbit, or There and Back Again"
 */
export const getItemTitles = (item: AudiobookshelfBookItem): string[] => {
  const titles = [item.title];
  const dashParts = item.title.split(/\s[-\u2013\u2014]\s/);

  if (dashParts.length > 1) {
    titles.push(dashParts.slice(1).join(' - '));
  }

  for (const series of item.series) {
    if (
      series &&
      item.title.toLowerCase().startsWith(series.toLowerCase()) &&
      item.title.length > series.length
    ) {
      titles.push(
        item.title
          .slice(series.length)
          .replace(/^[\s,:.\-\u2013\u2014]+/, '')
          .replace(SERIES_NUMBER, '')
      );
    }
  }

  titles.push(item.title.replace(SERIES_NUMBER, ''));
  titles.push(item.title.split(/,\s*or\s+/i)[0]);

  return [...new Set(titles.map((title) => title.trim()).filter(Boolean))];
};

/**
 * Whether an item is the book: by ASIN or ISBN when both sides have one,
 * otherwise by title and author. Exact titles count for more than titles
 * that only contain the other.
 */
const scoreItem = (
  book: AudiobookshelfBook,
  item: AudiobookshelfBookItem,
  isbns: Set<string>
): number => {
  if (book.asin && normalizeId(item.asin) === normalizeId(book.asin)) {
    return 3;
  }

  if (item.isbn && isbns.has(normalizeId(item.isbn))) {
    return 3;
  }

  const source = normalizeTitle(book.title);
  const titles = getItemTitles(item);
  const exact = titles.some((title) => normalizeTitle(title) === source);

  // Without authors on both sides only an exact title is trusted
  if (!book.authors.length || !item.authors.length) {
    return exact && !!source ? 1 : 0;
  }

  const matches = titles.some((title) =>
    isEditionMatch(book.title, book.authors, {
      title,
      subtitle: item.subtitle,
      authors: item.authors,
    })
  );

  return matches ? (exact ? 2 : 1) : 0;
};

/**
 * Picks the library item that is the book, if any
 */
export const findAudiobookshelfItem = (
  book: AudiobookshelfBook,
  items: AudiobookshelfBookItem[],
  isbns: string[] = []
): AudiobookshelfBookItem | undefined => {
  const isbnSet = new Set(isbns.map(normalizeId).filter(Boolean));
  let best: AudiobookshelfBookItem | undefined;
  let bestScore = 0;

  for (const item of items) {
    const score = scoreItem(book, item, isbnSet);

    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  return best;
};

/**
 * Searches that may find the book, in order: its ASIN, its main title, the
 * main title without a leading article, and its longest plain word, which
 * still finds the book when the punctuation differs ("Mr Fox", "Mr. Fox")
 */
export const getSearchQueries = (book: AudiobookshelfBook): string[] => {
  const mainTitle = book.title
    .split(':')[0]
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const longestWord = mainTitle
    .split(' ')
    .map((word) => word.replace(SURROUNDING_PUNCTUATION, ''))
    .filter((word) => /^[\p{L}\p{N}]+$/u.test(word))
    .sort((a, b) => b.length - a.length)[0];

  return [
    ...new Set(
      [
        book.asin,
        mainTitle,
        mainTitle.replace(/^(the|a|an)\s+/i, ''),
        longestWord && longestWord.length >= MIN_WORD_SEARCH_LENGTH
          ? longestWord
          : undefined,
      ].filter((query): query is string => !!query)
    ),
  ];
};

const inFlight = new Map<string, Promise<CachedItem>>();

const searchLibrary = async (
  settings: AudiobookshelfSettings,
  libraryId: string,
  book: AudiobookshelfBook
): Promise<CachedItem> => {
  const api = new AudiobookshelfAPI({
    url: settings.url ?? '',
    apiKey: settings.apiKey,
    timeout: REQUEST_TIMEOUT,
  });
  const seen = new Map<string, AudiobookshelfBookItem>();

  for (const query of getSearchQueries(book)) {
    const items = await api.searchBooks(libraryId, query, SEARCH_LIMIT);
    items.forEach((item) => seen.set(item.id, item));

    const match = findAudiobookshelfItem(book, items);

    if (match) {
      return { itemId: match.id };
    }
  }

  // Books found under another title may still share an ISBN with the work
  if ([...seen.values()].some((item) => item.isbn)) {
    const isbns = await new OpenLibrary()
      .getWorkIsbns(book.olId)
      .catch((): string[] => []);
    const match = findAudiobookshelfItem(book, [...seen.values()], isbns);

    if (match) {
      return { itemId: match.id };
    }
  }

  return { itemId: null };
};

/**
 * The library item of a book, from memory when it was looked up recently.
 * Resolves undefined when Audiobookshelf could not be asked.
 */
export const lookupAudiobookshelfItem = (
  settings: AudiobookshelfSettings,
  libraryId: string,
  book: AudiobookshelfBook
): Promise<string | null | undefined> => {
  const cache = cacheManager.getCache('audiobookshelf').data;
  const baseUrl = (settings.url ?? '').replace(/\/+$/, '');
  const cacheKey = `item:${baseUrl}:${libraryId}:${book.olId}`;
  const cached = cache.get<CachedItem>(cacheKey);

  if (cached) {
    return Promise.resolve(cached.itemId);
  }

  let pending = inFlight.get(cacheKey);

  if (!pending) {
    pending = searchLibrary(settings, libraryId, book)
      .catch((e): CachedItem => {
        logger.debug('Failed to look a book up in Audiobookshelf', {
          label: 'Audiobookshelf',
          olId: book.olId,
          errorMessage: e.message,
        });
        return {};
      })
      .then((result) => {
        cache.set(
          cacheKey,
          result,
          result.itemId === undefined
            ? UNKNOWN_TTL
            : result.itemId
              ? MATCH_TTL
              : MISS_TTL
        );
        return result;
      })
      .finally(() => inFlight.delete(cacheKey));
    inFlight.set(cacheKey, pending);
  }

  return pending.then((result) => result.itemId);
};

/**
 * Like lookupAudiobookshelfItem, but gives up waiting after the budget so a
 * slow server never holds a page up for long
 */
export const getAudiobookshelfItemId = async (
  settings: AudiobookshelfSettings,
  libraryId: string,
  book: AudiobookshelfBook,
  budget = LOOKUP_BUDGET
): Promise<string | null | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), budget);
  });

  try {
    return await Promise.race([
      lookupAudiobookshelfItem(settings, libraryId, book),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export interface AudiobookshelfLinks {
  audiobookshelfUrl: string | null;
  audiobookshelfEbookUrl: string | null;
  audiobookshelfAudiobookUrl: string | null;
  // Library items of the available formats, once the book is found in them
  audiobookshelfEbookItemId: string | null;
  audiobookshelfAudiobookItemId: string | null;
  // Open the items in the NoBookEnds app, unless an admin turned that off
  nobookendsEbookUrl: string | null;
  nobookendsAudiobookUrl: string | null;
}

/**
 * Where a book opens in Audiobookshelf, per format. With an API key, links
 * go straight to the book in the format's library; without one, or while
 * the book cannot be found, they open a title search there.
 */
export const getAudiobookshelfLinks = async (
  settings: AudiobookshelfSettings,
  book: AudiobookshelfBook,
  media?: Media
): Promise<AudiobookshelfLinks> => {
  const baseUrl = settings.url?.replace(/\/+$/, '');
  const searchLinks: AudiobookshelfLinks = {
    audiobookshelfUrl: getAudiobookshelfUrl(settings, book.title, media),
    audiobookshelfEbookUrl: getAudiobookshelfUrl(
      settings,
      book.title,
      media,
      'ebook'
    ),
    audiobookshelfAudiobookUrl: getAudiobookshelfUrl(
      settings,
      book.title,
      media,
      'audiobook'
    ),
    audiobookshelfEbookItemId: null,
    audiobookshelfAudiobookItemId: null,
    nobookendsEbookUrl: null,
    nobookendsAudiobookUrl: null,
  };

  if (!baseUrl || !settings.apiKey) {
    return searchLinks;
  }

  const findItem = async (
    searchLink: string | null,
    libraryId: string | undefined,
    lookupBook: AudiobookshelfBook
  ): Promise<string | null> => {
    if (!searchLink || !libraryId) {
      return null;
    }

    return (
      (await getAudiobookshelfItemId(settings, libraryId, lookupBook)) ?? null
    );
  };

  // The Audible ASIN only belongs to the audiobook
  const [ebookItemId, audiobookItemId] = await Promise.all([
    findItem(
      searchLinks.audiobookshelfEbookUrl,
      settings.ebookLibraryId || settings.libraryId,
      { ...book, asin: undefined }
    ),
    findItem(searchLinks.audiobookshelfAudiobookUrl, settings.libraryId, book),
  ]);

  const itemUrl = (itemId: string | null, searchLink: string | null) =>
    itemId ? `${baseUrl}/item/${encodeURIComponent(itemId)}` : searchLink;
  const ebookUrl = itemUrl(ebookItemId, searchLinks.audiobookshelfEbookUrl);
  const audiobookUrl = itemUrl(
    audiobookItemId,
    searchLinks.audiobookshelfAudiobookUrl
  );
  const showNoBookEnds = isNoBookEndsLinkEnabled(settings);

  return {
    // Like the search link, the audiobook when it is available
    audiobookshelfUrl:
      media?.statusAudio === MediaStatus.AVAILABLE
        ? audiobookUrl
        : (ebookUrl ?? searchLinks.audiobookshelfUrl),
    audiobookshelfEbookUrl: ebookUrl,
    audiobookshelfAudiobookUrl: audiobookUrl,
    audiobookshelfEbookItemId: ebookItemId,
    audiobookshelfAudiobookItemId: audiobookItemId,
    nobookendsEbookUrl:
      showNoBookEnds && ebookItemId
        ? getNoBookEndsItemUrl(baseUrl, ebookItemId, 'ebook')
        : null,
    nobookendsAudiobookUrl:
      showNoBookEnds && audiobookItemId
        ? getNoBookEndsItemUrl(baseUrl, audiobookItemId, 'audiobook')
        : null,
  };
};
