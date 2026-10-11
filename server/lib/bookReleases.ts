import { isAuthorMatch, normalizeTitle } from '@server/api/audible/match';
import { getGoogleBooks } from '@server/api/googlebooks';
import type { GoogleBooksVolume } from '@server/api/googlebooks/interfaces';
import OpenLibrary, { getCoverUrl, getOlId } from '@server/api/openlibrary';
import {
  BOOK_LANGUAGE_ANY,
  getEffectiveBookLanguage,
} from '@server/constants/bookLanguages';
import { FollowType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import type { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import type {
  BookRelease,
  UpcomingBooksResponse,
} from '@server/interfaces/api/discoverInterfaces';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

/**
 * Upcoming and new books from the authors a user follows. Google Books lists
 * books before they come out (with the configured key), so it gives both;
 * OpenLibrary only knows the year a work was first published, so without a
 * key the page shows this year's books and says so. No free source ranks
 * upcoming books by popularity, so there is no general list.
 */

// Books published this many days ago or less count as new
export const RECENT_DAYS = 60;
// Authors looked up per page view, the most recently followed first. Each
// is one Google Books request a day at most, as answers are cached.
export const MAX_AUTHORS = 20;
const MAX_PER_SECTION = 60;
// The assembled page, so following someone shows up within the hour
const RESULT_TTL = 3600;

export interface FollowedAuthor {
  olId: string;
  name: string;
}

const DAY = 86400000;

const toDateKey = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * The first and last day a published date such as 2026, 2026-11 or
 * 2026-11-04 can mean, or undefined for dates Google Books garbles
 */
export const getDateRange = (
  date?: string
): { first: string; last: string } | undefined => {
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(date ?? '');

  if (!match) {
    return undefined;
  }

  const [, year, month, day] = match;

  if (day) {
    const value = `${year}-${month}-${day}`;
    return { first: value, last: value };
  }

  if (month) {
    const lastDay = new Date(Date.UTC(Number(year), Number(month), 0));
    return { first: `${year}-${month}-01`, last: toDateKey(lastDay) };
  }

  return { first: `${year}-01-01`, last: `${year}-12-31` };
};

const getCoverSource = (volume: GoogleBooksVolume): string | undefined =>
  volume.volumeInfo?.imageLinks?.thumbnail
    ?.replace(/^http:\/\//, 'https://')
    .replace(/&edge=curl/, '');

const isLanguage = (volume: GoogleBooksVolume, language?: string) =>
  !language ||
  !volume.volumeInfo?.language ||
  volume.volumeInfo.language.toLowerCase().split('-')[0] === language;

/**
 * Splits an author's newest Google Books volumes into books that are not
 * out yet and books out in the last RECENT_DAYS days. A title is listed
 * once, with its earliest date, and skipped when an older edition of it is
 * among the volumes, as that makes it a reissue rather than a new book.
 * A date known only to the year is too vague for either list, unless the
 * whole year is still ahead.
 */
export const selectBookReleases = (
  volumes: GoogleBooksVolume[],
  author: FollowedAuthor,
  { today = new Date(), language }: { today?: Date; language?: string } = {}
): { comingSoon: BookRelease[]; newReleases: BookRelease[] } => {
  const todayKey = toDateKey(today);
  const recentFrom = toDateKey(new Date(today.getTime() - RECENT_DAYS * DAY));
  const byTitle = new Map<
    string,
    { volume: GoogleBooksVolume; first: string; last: string; date: string }[]
  >();

  for (const volume of volumes) {
    const info = volume.volumeInfo;
    const range = getDateRange(info?.publishedDate);
    const key = info?.title ? normalizeTitle(info.title) : '';

    if (
      !info?.title ||
      !range ||
      !key ||
      !isAuthorMatch([author.name], info.authors ?? []) ||
      !isLanguage(volume, language)
    ) {
      continue;
    }

    const editions = byTitle.get(key) ?? [];
    editions.push({ volume, ...range, date: info.publishedDate as string });
    byTitle.set(key, editions);
  }

  const comingSoon: BookRelease[] = [];
  const newReleases: BookRelease[] = [];

  for (const editions of byTitle.values()) {
    const earliest = editions.reduce((a, b) => (b.first < a.first ? b : a));

    if (earliest.first < recentFrom) {
      // Out for a while already, the newer volumes are later editions
      continue;
    }

    const release: BookRelease = {
      id: earliest.volume.id,
      title: earliest.volume.volumeInfo?.title as string,
      authorName: author.name,
      authorId: author.olId,
      date: earliest.date.slice(0, 10),
      posterUrl: getCoverSource(earliest.volume),
    };
    const isFullDate = earliest.first === earliest.last;
    const isMonth = !isFullDate && earliest.date.length >= 7;

    if (earliest.first > todayKey) {
      comingSoon.push(release);
    } else if (isFullDate || isMonth) {
      // A book dated this month is taken to be out already
      newReleases.push(release);
    }
  }

  return { comingSoon, newReleases };
};

/** Soonest first for books to come, newest first for books out */
export const sortBookReleases = (
  comingSoon: BookRelease[],
  newReleases: BookRelease[]
): { comingSoon: BookRelease[]; newReleases: BookRelease[] } => ({
  comingSoon: [...comingSoon]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, MAX_PER_SECTION),
  newReleases: [...newReleases]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_PER_SECTION),
});

const getFollowedAuthors = async (user: User): Promise<FollowedAuthor[]> => {
  const follows = await getRepository(Watchlist).find({
    where: { mediaType: FollowType.AUTHOR, requestedBy: { id: user.id } },
    order: { createdAt: 'DESC' },
  });

  return follows
    .filter((follow) => !!follow.olId && !!follow.title)
    .map((follow) => ({ olId: follow.olId as string, name: follow.title }));
};

/** This year's works of the authors, which is all OpenLibrary can tell */
const getOpenLibraryReleases = async (
  authors: FollowedAuthor[],
  year: number
): Promise<BookRelease[]> => {
  const openLibrary = new OpenLibrary();
  const releases: BookRelease[] = [];
  // OpenLibrary often has a book as more than one work
  const seen = new Set<string>();

  for (const author of authors) {
    try {
      const { docs } = await openLibrary.searchBooks({
        query: `author_key:${author.olId} AND first_publish_year:${year}`,
        limit: 20,
      });

      for (const doc of docs) {
        const key = `${author.olId}:${normalizeTitle(doc.title)}`;

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        releases.push({
          id: getOlId(doc.key),
          olId: getOlId(doc.key),
          title: doc.title,
          authorName: author.name,
          authorId: author.olId,
          date: String(year),
          posterUrl: getCoverUrl(doc.cover_i, 'M') ?? undefined,
        });
      }
    } catch (e) {
      logger.debug('Failed to look up the new books of an author', {
        label: 'Book Releases',
        authorId: author.olId,
        errorMessage: e.message,
      });
    }
  }

  return releases;
};

export const getUpcomingBooks = async (
  user: User,
  today = new Date()
): Promise<UpcomingBooksResponse> => {
  const authors = await getFollowedAuthors(user);
  const looked = authors.slice(0, MAX_AUTHORS);
  const googleBooks = getGoogleBooks();
  const source = googleBooks ? 'googlebooks' : 'openlibrary';
  const language = getEffectiveBookLanguage(
    user.settings?.bookLanguage,
    getSettings().main.bookLanguage
  );
  const cache = cacheManager.getCache('googlebooks').data;
  const cacheKey = `upcoming:${source}:${language}:${toDateKey(today)}:${looked
    .map((author) => author.olId)
    .join(',')}`;
  const cached = cache.get<UpcomingBooksResponse>(cacheKey);

  if (cached) {
    return cached;
  }

  const response: UpcomingBooksResponse = {
    source,
    followedAuthors: authors.length,
    recentDays: RECENT_DAYS,
    comingSoon: [],
    newReleases: [],
  };

  if (!looked.length) {
    return response;
  }

  if (googleBooks) {
    const comingSoon: BookRelease[] = [];
    const newReleases: BookRelease[] = [];
    let failed = false;

    for (const author of looked) {
      const volumes = await googleBooks.getNewestByAuthor(author.name);

      if (!volumes) {
        failed = true;
        continue;
      }

      const selected = selectBookReleases(volumes, author, {
        today,
        language: language === BOOK_LANGUAGE_ANY ? undefined : language,
      });
      comingSoon.push(...selected.comingSoon);
      newReleases.push(...selected.newReleases);
    }

    Object.assign(response, sortBookReleases(comingSoon, newReleases));

    // A partial answer is not kept, so the missing authors are asked again
    if (!failed) {
      cache.set(cacheKey, response, RESULT_TTL);
    }

    return response;
  }

  response.newReleases = (
    await getOpenLibraryReleases(looked, today.getUTCFullYear())
  ).slice(0, MAX_PER_SECTION);
  cache.set(cacheKey, response, RESULT_TTL);

  return response;
};
