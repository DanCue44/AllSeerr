import { getAuthorLastNames } from '@server/api/audible/match';
import ExternalAPI from '@server/api/externalapi';
import { BOOK_LANGUAGE_ANY } from '@server/constants/bookLanguages';
import { getRepository } from '@server/datasource';
import MetadataBookEbook from '@server/entity/MetadataBookEbook';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import axios from 'axios';
import type {
  GoogleBooksErrorResponse,
  GoogleBooksVolume,
  GoogleBooksVolumesResponse,
} from './interfaces';
import { findEbookEvidence } from './match';

// The API allows 1000 requests a day by default, so searches and the answer
// per book are kept for a week, and the answer is saved for much longer
const CACHE_TTL = 86400 * 7;
// Failed lookups are not saved, but are not retried right away either
const UNKNOWN_TTL = 600;
const MAX_RPS = 2;
const MAX_RESULTS = 20;
// Saved answers are asked again after this long. Books without an ebook
// are checked more often, as editions keep being published.
const FOUND_STALE_AFTER = 90 * 24 * 60 * 60 * 1000;
const MISSING_STALE_AFTER = 14 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

// Only what the matcher reads, to keep responses small
const VOLUME_FIELDS =
  'totalItems,items(id,volumeInfo(title,subtitle,authors,language),' +
  'saleInfo(country,saleability,isEbook),' +
  'accessInfo(epub/isAvailable,pdf/isAvailable))';

// The newest books of an author, for the books Upcoming page
const NEWEST_FIELDS =
  'items(id,volumeInfo(title,subtitle,authors,language,publishedDate,' +
  'imageLinks/thumbnail))';
const NEWEST_MAX_RESULTS = 40;
// New listings appear a few times a week, so a day is fresh enough
const NEWEST_TTL = 86400;

// Reasons Google gives when the daily or per minute quota is used up
const QUOTA_REASONS = new Set([
  'rateLimitExceeded',
  'dailyLimitExceeded',
  'userRateLimitExceeded',
  'quotaExceeded',
]);

export interface EbookAvailability {
  // null when Google Books could not be asked or has no volume of the book
  exists: boolean | null;
  volumeId?: string;
}

interface EbookLookup extends EbookAvailability {
  // Set when Google Books could not be asked, so the answer is not saved
  failed?: boolean;
}

// Keys whose quota ran out, with the time it resets
const quotaBlockedUntil = new Map<string, number>();

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError<GoogleBooksErrorResponse>(error)) {
    return error.response?.data?.error?.message ?? error.message;
  }

  return error instanceof Error ? error.message : 'Unknown error';
};

export const isQuotaError = (error: unknown): boolean => {
  if (!axios.isAxiosError<GoogleBooksErrorResponse>(error)) {
    return false;
  }

  const status = error.response?.status;

  if (status === 429) {
    return true;
  }

  return (
    status === 403 &&
    (error.response?.data?.error?.errors ?? []).some(
      (entry) => !!entry.reason && QUOTA_REASONS.has(entry.reason)
    )
  );
};

/**
 * When the daily quota resets: midnight Pacific time, the time zone Google
 * counts quotas in
 */
export const getNextQuotaReset = (now = new Date()): Date => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  const sinceMidnight =
    ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000 +
    now.getMilliseconds();

  return new Date(now.getTime() - sinceMidnight + DAY);
};

export const getGoogleBooksCountry = (countryCode?: string): string =>
  /^[A-Za-z]{2}$/.test(countryCode ?? '')
    ? (countryCode as string).toUpperCase()
    : 'US';

const isStale = (row: MetadataBookEbook, region: string): boolean =>
  row.region !== region ||
  Date.now() - new Date(row.checkedAt).getTime() >
    (row.hasEbook ? FOUND_STALE_AFTER : MISSING_STALE_AFTER);

class GoogleBooks extends ExternalAPI {
  public readonly country: string;
  private readonly apiKey: string;
  private inFlight = new Map<string, Promise<EbookAvailability>>();

  constructor(apiKey: string, countryCode?: string) {
    super(
      'https://www.googleapis.com/books/v1',
      {},
      {
        // The key goes in a header so it stays out of URLs and cache keys
        headers: { 'X-Goog-Api-Key': apiKey },
        nodeCache: cacheManager.getCache('googlebooks').data,
        timeout: 10000,
        rateLimit: { maxRequests: MAX_RPS, maxRPS: MAX_RPS },
      }
    );

    this.apiKey = apiKey;
    this.country = getGoogleBooksCountry(countryCode);
  }

  /**
   * Makes one small request to check that the key is accepted
   */
  public static async testApiKey(apiKey: string): Promise<void> {
    await axios.get('https://www.googleapis.com/books/v1/volumes', {
      headers: { 'X-Goog-Api-Key': apiKey },
      params: { q: 'inauthor:tolkien', maxResults: 1, fields: 'totalItems' },
      timeout: 10000,
    });
  }

  public hasApiKey(apiKey: string): boolean {
    return this.apiKey === apiKey;
  }

  public isQuotaExhausted(): boolean {
    const until = quotaBlockedUntil.get(this.apiKey);

    if (until && until > Date.now()) {
      return true;
    }

    quotaBlockedUntil.delete(this.apiKey);
    return false;
  }

  private async searchVolumes(
    params: Record<string, string>
  ): Promise<GoogleBooksVolume[]> {
    const data = await this.get<GoogleBooksVolumesResponse>(
      '/volumes',
      {
        params: {
          ...params,
          maxResults: String(MAX_RESULTS),
          country: this.country,
          printType: 'books',
          fields: VOLUME_FIELDS,
        },
      },
      CACHE_TTL
    );

    return data.items ?? [];
  }

  /**
   * The author's books, newest first (books not out yet included), or
   * undefined when Google Books cannot be asked right now
   */
  public async getNewestByAuthor(
    authorName: string
  ): Promise<GoogleBooksVolume[] | undefined> {
    const name = authorName.replace(/"/g, '').trim();

    if (!name || this.isQuotaExhausted()) {
      return undefined;
    }

    try {
      const data = await this.get<GoogleBooksVolumesResponse>(
        '/volumes',
        {
          params: {
            q: `inauthor:"${name}"`,
            orderBy: 'newest',
            maxResults: String(NEWEST_MAX_RESULTS),
            country: this.country,
            printType: 'books',
            fields: NEWEST_FIELDS,
          },
        },
        NEWEST_TTL
      );

      return data.items ?? [];
    } catch (e) {
      if (isQuotaError(e)) {
        quotaBlockedUntil.set(this.apiKey, getNextQuotaReset().getTime());
        logger.warn(
          'Google Books quota is used up, lookups pause until it resets',
          { label: 'Google Books' }
        );
      } else {
        logger.debug('Failed to list the newest books of an author', {
          label: 'Google Books',
          authorName,
          errorMessage: getErrorMessage(e),
        });
      }

      return undefined;
    }
  }

  /**
   * Asks Google Books for an ebook edition of a book. Searches ebooks only
   * first, which finds editions the full search ranks too low, then every
   * volume, since many list a download format without being sold as one.
   */
  public async findEbook(
    title: string,
    authors: string[],
    language?: string
  ): Promise<EbookLookup> {
    const mainTitle = title.split(':')[0].trim() || title;
    const [lastName] = getAuthorLastNames(authors);

    if (!mainTitle || !lastName) {
      return { exists: null, failed: true };
    }

    // intitle: and isbn: searches come back empty for books Google lists,
    // so the title words are left free and the author narrows them down
    const q = `${mainTitle} inauthor:${lastName}`;
    const searches: Record<string, string>[] = [{ q, filter: 'ebooks' }, { q }];
    const volumes: GoogleBooksVolume[] = [];

    for (const params of searches) {
      if (this.isQuotaExhausted()) {
        return { exists: null, failed: true };
      }

      try {
        volumes.push(...(await this.searchVolumes(params)));
      } catch (e) {
        if (isQuotaError(e)) {
          quotaBlockedUntil.set(this.apiKey, getNextQuotaReset().getTime());
          logger.warn(
            'Google Books quota is used up, ebook lookups pause until it resets',
            { label: 'Google Books' }
          );
        } else {
          logger.debug('Failed to search Google Books', {
            label: 'Google Books',
            title,
            errorMessage: getErrorMessage(e),
          });
        }

        return { exists: null, failed: true };
      }

      const evidence = findEbookEvidence(title, authors, volumes, language);

      if (evidence.exists) {
        return evidence;
      }
    }

    return findEbookEvidence(title, authors, volumes, language);
  }

  /**
   * Whether an OpenLibrary work has an ebook edition, from memory or
   * metadata_book_ebook when it was looked up before
   */
  public async getAvailability(
    olId: string,
    title: string,
    authors: string[]
  ): Promise<EbookAvailability> {
    const cache = cacheManager.getCache('googlebooks').data;
    const cacheKey = `availability:${this.country}:${olId}`;
    const cached = cache.get<EbookAvailability>(cacheKey);

    if (cached) {
      return cached;
    }

    const pending = this.inFlight.get(cacheKey);

    if (pending) {
      return pending;
    }

    const lookup = this.lookupAvailability(olId, title, authors)
      .then(({ failed, ...result }) => {
        cache.set(cacheKey, result, failed ? UNKNOWN_TTL : CACHE_TTL);
        return result;
      })
      .finally(() => this.inFlight.delete(cacheKey));

    this.inFlight.set(cacheKey, lookup);

    return lookup;
  }

  private async lookupAvailability(
    olId: string,
    title: string,
    authors: string[]
  ): Promise<EbookLookup> {
    const repository = getRepository(MetadataBookEbook);
    const row = await repository.findOne({ where: { olId } }).catch(() => null);
    const saved = (entry: MetadataBookEbook): EbookAvailability => ({
      exists: entry.hasEbook,
      volumeId: entry.volumeId ?? undefined,
    });

    if (row && !isStale(row, this.country)) {
      return saved(row);
    }

    const bookLanguage = getSettings().main.bookLanguage;
    const result = await this.findEbook(
      title,
      authors,
      bookLanguage === BOOK_LANGUAGE_ANY ? undefined : bookLanguage
    );

    if (!result.failed) {
      await repository
        .upsert(
          {
            olId,
            region: this.country,
            hasEbook: result.exists,
            volumeId: result.volumeId ?? null,
            checkedAt: new Date(),
          },
          { conflictPaths: ['olId'] }
        )
        .catch((e) => {
          logger.error('Failed to save ebook availability', {
            label: 'Google Books',
            olId,
            errorMessage: getErrorMessage(e),
          });
        });
    } else if (row) {
      // An older answer beats none while Google Books cannot be asked
      return saved(row);
    }

    return result;
  }
}

let instance: GoogleBooks | undefined;

/**
 * Client for the configured key and the discover region, or undefined when
 * no key is set. Shared, so every lookup goes through the same rate limit.
 */
export const getGoogleBooks = (): GoogleBooks | undefined => {
  const { googleBooksApiKey, discoverRegion } = getSettings().main;
  const apiKey = googleBooksApiKey?.trim();

  if (!apiKey) {
    return undefined;
  }

  const country = getGoogleBooksCountry(discoverRegion);

  if (!instance?.hasApiKey(apiKey) || instance.country !== country) {
    instance = new GoogleBooks(apiKey, country);
  }

  return instance;
};

export default GoogleBooks;
