import type { LazyLibrarianSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { proxyRequestInterceptor } from '@server/utils/customProxyAgent';
import { userAgentRequestInterceptor } from '@server/utils/userAgent';
import type { AxiosInstance } from 'axios';
import axios from 'axios';

export type LazyLibrarianBookType = 'eBook' | 'AudioBook';

export type LazyLibrarianState = 'available' | 'processing' | 'skip';

/**
 * A book as LazyLibrarian lists it. LazyLibrarian returns its database rows
 * with mixed case column names (BookID, Status, audiostatus), so rows are
 * normalized by mapLazyLibrarianBook.
 */
export interface LazyLibrarianBook {
  bookId: string;
  title: string;
  authorId?: string;
  authorName?: string;
  status: string;
  audioStatus: string;
  bookLibrary?: string;
  audioLibrary?: string;
  isbn?: string;
  image?: string;
  date?: string;
}

export interface LazyLibrarianSearchResult {
  bookId: string;
  title: string;
  authorId?: string;
  authorName?: string;
  isbn?: string;
  year?: string;
  // LazyLibrarian's own match score against the search term
  score: number;
  source?: string;
}

interface LazyLibrarianError {
  Success: false;
  Data?: string;
  Error?: { Code: number; Message: string };
}

const isLazyLibrarianError = (data: unknown): data is LazyLibrarianError =>
  typeof data === 'object' &&
  data !== null &&
  (data as { Success?: unknown }).Success === false;

const pick = (
  row: Record<string, unknown>,
  key: string
): string | undefined => {
  const match = Object.keys(row).find(
    (rowKey) => rowKey.toLowerCase() === key.toLowerCase()
  );
  const value = match ? row[match] : undefined;

  return value === null || value === undefined || value === ''
    ? undefined
    : String(value);
};

export const mapLazyLibrarianBook = (
  row: Record<string, unknown>
): LazyLibrarianBook => ({
  bookId: pick(row, 'BookID') ?? '',
  title: pick(row, 'BookName') ?? '',
  authorId: pick(row, 'AuthorID'),
  authorName: pick(row, 'AuthorName'),
  status: pick(row, 'Status') ?? 'Skipped',
  audioStatus: pick(row, 'AudioStatus') ?? 'Skipped',
  bookLibrary: pick(row, 'BookLibrary'),
  audioLibrary: pick(row, 'AudioLibrary'),
  isbn: pick(row, 'BookIsbn'),
  image: pick(row, 'BookImg'),
  date: pick(row, 'BookDate'),
});

export const mapLazyLibrarianSearchResult = (
  row: Record<string, unknown>
): LazyLibrarianSearchResult => ({
  bookId: pick(row, 'bookid') ?? '',
  title: pick(row, 'bookname') ?? '',
  authorId: pick(row, 'authorid'),
  authorName: pick(row, 'authorname'),
  isbn: pick(row, 'bookisbn'),
  year: pick(row, 'bookpub') ?? pick(row, 'bookdate'),
  score: Number(pick(row, 'highest_fuzz') ?? 0) || 0,
  source: pick(row, 'source'),
});

/**
 * LazyLibrarian marks a format Open or Have once its file is in the library,
 * and Wanted or Snatched while it is being searched for or downloaded.
 * Skipped and Ignored formats were never asked for.
 */
export const getLazyLibrarianState = (status?: string): LazyLibrarianState => {
  switch (status?.toLowerCase()) {
    case 'open':
    case 'have':
      return 'available';
    case 'wanted':
    case 'snatched':
    case 'seeding':
      return 'processing';
    default:
      return 'skip';
  }
};

export const isLazyLibrarianConfigured = (
  settings: LazyLibrarianSettings
): boolean => !!settings.hostname && !!settings.apiKey;

class LazyLibrarianAPI {
  private axios: AxiosInstance;
  private apiKey: string;

  /**
   * Base url of the LazyLibrarian web interface. LazyLibrarian often runs
   * behind a web root (http_root), which goes in urlBase.
   */
  public static buildUrl(settings: LazyLibrarianSettings, path = ''): string {
    const urlBase = settings.urlBase
      ? `/${settings.urlBase.replace(/^\/+|\/+$/g, '')}`
      : '';

    return `${settings.useSsl ? 'https' : 'http'}://${settings.hostname}:${
      settings.port ?? 5299
    }${urlBase}${path}`;
  }

  constructor(settings: LazyLibrarianSettings) {
    this.apiKey = settings.apiKey ?? '';
    this.axios = axios.create({
      baseURL: LazyLibrarianAPI.buildUrl(settings),
      timeout: 60000,
    });
    this.axios.interceptors.request.use(proxyRequestInterceptor);
    this.axios.interceptors.request.use(userAgentRequestInterceptor);
  }

  /**
   * Runs an API command. LazyLibrarian answers 200 even on errors, either
   * with an error object or with a plain text message, so callers that
   * expect "OK" check for it with expectOk.
   */
  private async command<T>(
    cmd: string,
    params: Record<string, string> = {}
  ): Promise<T> {
    const response = await this.axios.get<T | LazyLibrarianError>('/api', {
      params: { apikey: this.apiKey, cmd, ...params },
    });

    if (isLazyLibrarianError(response.data)) {
      throw new Error(
        response.data.Error?.Message ?? `LazyLibrarian command ${cmd} failed`
      );
    }

    return response.data as T;
  }

  private async expectOk(
    cmd: string,
    params: Record<string, string>
  ): Promise<void> {
    const data = await this.command<unknown>(cmd, params);

    if (typeof data === 'string' && data.trim() !== 'OK') {
      throw new Error(data.trim());
    }
  }

  public async getVersion(): Promise<string> {
    try {
      const data = await this.command<{ current_version?: string }>(
        'getVersion'
      );

      if (typeof data !== 'object' || data === null) {
        throw new Error('Unexpected response');
      }

      return data.current_version ?? '';
    } catch (e) {
      logger.error('Something went wrong fetching LazyLibrarian version', {
        label: 'LazyLibrarian API',
        errorMessage: e.message,
      });
      throw new Error(`[LazyLibrarian] Failed to fetch version: ${e.message}`, {
        cause: e,
      });
    }
  }

  /**
   * Searches LazyLibrarian's book source (OpenLibrary, Google Books,
   * Goodreads or Hardcover, as configured) for a title
   */
  public async findBook(name: string): Promise<LazyLibrarianSearchResult[]> {
    try {
      const data = await this.command<unknown>('findBook', { name });

      if (!Array.isArray(data)) {
        return [];
      }

      return data
        .map((row) => mapLazyLibrarianSearchResult(row))
        .filter((result) => result.bookId);
    } catch (e) {
      throw new Error(`[LazyLibrarian] Failed to search books: ${e.message}`, {
        cause: e,
      });
    }
  }

  /**
   * Adds a book by its id, waiting until it is in the database. Without a
   * source the id is looked up in LazyLibrarian's configured book source.
   */
  public async addBook(
    bookId: string,
    { source }: { source?: string } = {}
  ): Promise<void> {
    try {
      await this.command<unknown>('addBook', {
        id: bookId,
        wait: '1',
        ...(source ? { source } : {}),
      });
    } catch (e) {
      throw new Error(`[LazyLibrarian] Failed to add book: ${e.message}`, {
        cause: e,
      });
    }
  }

  /**
   * Marks one format of a book as Wanted
   */
  public async queueBook(
    bookId: string,
    type: LazyLibrarianBookType
  ): Promise<void> {
    try {
      await this.expectOk('queueBook', { id: bookId, type });
    } catch (e) {
      throw new Error(`[LazyLibrarian] Failed to queue book: ${e.message}`, {
        cause: e,
      });
    }
  }

  /**
   * Starts a search for one format of a book, in the background
   */
  public async searchBook(
    bookId: string,
    type: LazyLibrarianBookType
  ): Promise<void> {
    try {
      await this.expectOk('searchBook', { id: bookId, type });
    } catch (e) {
      throw new Error(`[LazyLibrarian] Failed to search book: ${e.message}`, {
        cause: e,
      });
    }
  }

  /**
   * Marks one format of a book as Skipped, so LazyLibrarian stops searching
   * for it. LazyLibrarian's API has no command that deletes book files.
   */
  public async unqueueBook(
    bookId: string,
    type: LazyLibrarianBookType
  ): Promise<void> {
    try {
      await this.expectOk('unqueueBook', { id: bookId, type });
    } catch (e) {
      throw new Error(`[LazyLibrarian] Failed to unqueue book: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async getAllBooks(): Promise<LazyLibrarianBook[]> {
    try {
      const data = await this.command<unknown>('getAllBooks');

      if (!Array.isArray(data)) {
        throw new Error('Unexpected response');
      }

      return data
        .map((row) => mapLazyLibrarianBook(row))
        .filter((book) => book.bookId);
    } catch (e) {
      throw new Error(`[LazyLibrarian] Failed to fetch books: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async getBook(bookId: string): Promise<LazyLibrarianBook | undefined> {
    const books = await this.getAllBooks();

    return books.find((book) => book.bookId === bookId);
  }
}

export default LazyLibrarianAPI;
