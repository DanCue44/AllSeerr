import { proxyRequestInterceptor } from '@server/utils/customProxyAgent';
import { userAgentRequestInterceptor } from '@server/utils/userAgent';
import type { AxiosInstance } from 'axios';
import axios, { isAxiosError } from 'axios';

export interface AudiobookshelfLibrary {
  id: string;
  name: string;
  // book or podcast
  mediaType?: string;
}

/**
 * A book in a library, with the metadata used to match it to a work
 */
export interface AudiobookshelfBookItem {
  id: string;
  title: string;
  subtitle?: string;
  authors: string[];
  series: string[];
  isbn?: string;
  asin?: string;
}

interface AudiobookshelfSearchMetadata {
  title?: string | null;
  subtitle?: string | null;
  authors?: { name?: string }[];
  authorName?: string | null;
  series?: { name?: string }[];
  isbn?: string | null;
  asin?: string | null;
}

export interface AudiobookshelfSearchResponse {
  book?: {
    libraryItem?: {
      id?: string;
      isMissing?: boolean;
      media?: { metadata?: AudiobookshelfSearchMetadata };
    };
  }[];
}

/**
 * The books of a library search, leaving out items missing on disk
 */
export const mapSearchBooks = (
  data: AudiobookshelfSearchResponse
): AudiobookshelfBookItem[] =>
  (data.book ?? []).flatMap(({ libraryItem }) => {
    const metadata = libraryItem?.media?.metadata;

    if (!libraryItem?.id || libraryItem.isMissing || !metadata?.title) {
      return [];
    }

    const authors = (metadata.authors ?? [])
      .map((author) => author.name ?? '')
      .filter(Boolean);

    return [
      {
        id: libraryItem.id,
        title: metadata.title,
        subtitle: metadata.subtitle || undefined,
        authors: authors.length
          ? authors
          : metadata.authorName
            ? [metadata.authorName]
            : [],
        series: (metadata.series ?? [])
          .map((series) => series.name ?? '')
          .filter(Boolean),
        isbn: metadata.isbn || undefined,
        asin: metadata.asin || undefined,
      },
    ];
  });

/**
 * An author as Audiobookshelf keeps it. Without an imagePath the author has
 * no photo, which Audiobookshelf only fetches when the author is matched.
 */
export interface AudiobookshelfAuthor {
  id: string;
  name: string;
  asin?: string | null;
  imagePath?: string | null;
}

export interface AudiobookshelfAuthorMatchQuery {
  // Searched for by name, or looked up by Audible ASIN when known
  q?: string;
  asin?: string;
  region: string;
}

const mapAuthor = (author: Partial<AudiobookshelfAuthor> | undefined) =>
  author?.id
    ? {
        id: author.id,
        name: author.name ?? '',
        asin: author.asin || null,
        imagePath: author.imagePath || null,
      }
    : undefined;

interface AudiobookshelfStatus {
  isInit?: boolean;
  serverVersion?: string;
}

/**
 * Talks to an Audiobookshelf server: checks that it answers, lists its
 * libraries for the settings, searches a library for a book and matches
 * authors so they get a photo
 */
class AudiobookshelfAPI {
  private axios: AxiosInstance;

  constructor({
    url,
    apiKey,
    timeout = 10000,
  }: {
    url: string;
    apiKey?: string;
    timeout?: number;
  }) {
    this.axios = axios.create({
      baseURL: url.replace(/\/+$/, ''),
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      timeout,
    });
    this.axios.interceptors.request.use(proxyRequestInterceptor);
    this.axios.interceptors.request.use(userAgentRequestInterceptor);
  }

  /**
   * The server version from /status, or undefined when only the older
   * /ping answers
   */
  public async getVersion(): Promise<string | undefined> {
    try {
      const response = await this.axios.get<AudiobookshelfStatus>('/status');

      if (response.data && typeof response.data === 'object') {
        return response.data.serverVersion;
      }
    } catch {
      // Older servers have no /status, /ping below decides
    }

    try {
      const response = await this.axios.get<{ success?: boolean }>('/ping');

      if (!response.data?.success) {
        throw new Error('Unexpected answer to /ping');
      }

      return undefined;
    } catch (e) {
      throw new Error(`[Audiobookshelf] Failed to reach server: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async getLibraries(): Promise<AudiobookshelfLibrary[]> {
    try {
      const response = await this.axios.get<{
        libraries?: AudiobookshelfLibrary[];
      }>('/api/libraries');

      return (response.data.libraries ?? []).map((library) => ({
        id: library.id,
        name: library.name,
        mediaType: library.mediaType,
      }));
    } catch (e) {
      throw new Error(
        `[Audiobookshelf] Failed to list libraries: ${e.message}`,
        { cause: e }
      );
    }
  }

  /**
   * Books in a library whose title, subtitle, ISBN or ASIN contain the query
   */
  public async searchBooks(
    libraryId: string,
    query: string,
    limit = 10
  ): Promise<AudiobookshelfBookItem[]> {
    try {
      const response = await this.axios.get<AudiobookshelfSearchResponse>(
        `/api/libraries/${encodeURIComponent(libraryId)}/search`,
        { params: { q: query, limit } }
      );

      return mapSearchBooks(response.data ?? {});
    } catch (e) {
      throw new Error(
        `[Audiobookshelf] Failed to search library: ${e.message}`,
        {
          cause: e,
        }
      );
    }
  }

  /**
   * The authors of a library item, without their photos
   */
  public async getItemAuthors(
    itemId: string
  ): Promise<{ id: string; name: string }[]> {
    try {
      const response = await this.axios.get<{
        media?: {
          metadata?: { authors?: { id?: string; name?: string }[] };
        };
      }>(`/api/items/${encodeURIComponent(itemId)}`, {
        params: { expanded: 1 },
      });

      return (response.data?.media?.metadata?.authors ?? []).flatMap(
        (author) =>
          author.id ? [{ id: author.id, name: author.name ?? '' }] : []
      );
    } catch (e) {
      throw new Error(
        `[Audiobookshelf] Failed to read a library item: ${e.message}`,
        { cause: e }
      );
    }
  }

  public async getAuthor(authorId: string): Promise<AudiobookshelfAuthor> {
    try {
      const response = await this.axios.get<Partial<AudiobookshelfAuthor>>(
        `/api/authors/${encodeURIComponent(authorId)}`
      );
      const author = mapAuthor(response.data);

      if (!author) {
        throw new Error('Unexpected answer');
      }

      return author;
    } catch (e) {
      throw new Error(
        `[Audiobookshelf] Failed to read an author: ${e.message}`,
        {
          cause: e,
        }
      );
    }
  }

  public async getLibraryAuthors(
    libraryId: string
  ): Promise<AudiobookshelfAuthor[]> {
    try {
      const response = await this.axios.get<{
        authors?: Partial<AudiobookshelfAuthor>[];
      }>(`/api/libraries/${encodeURIComponent(libraryId)}/authors`);

      return (response.data?.authors ?? []).flatMap((author) => {
        const mapped = mapAuthor(author);
        return mapped ? [mapped] : [];
      });
    } catch (e) {
      throw new Error(
        `[Audiobookshelf] Failed to list the authors of a library: ${e.message}`,
        { cause: e }
      );
    }
  }

  /**
   * Has Audiobookshelf look the author up on Audnexus, which fills in the
   * photo and description it finds. Needs a user allowed to update. Resolves
   * undefined when Audnexus does not know the author.
   */
  public async matchAuthor(
    authorId: string,
    query: AudiobookshelfAuthorMatchQuery
  ): Promise<AudiobookshelfAuthor | undefined> {
    try {
      const response = await this.axios.post<{
        updated?: boolean;
        author?: Partial<AudiobookshelfAuthor>;
      }>(`/api/authors/${encodeURIComponent(authorId)}/match`, query);

      return mapAuthor(response.data?.author);
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 404) {
        return undefined;
      }

      throw new Error(
        `[Audiobookshelf] Failed to match an author: ${e.message}`,
        {
          cause: e,
        }
      );
    }
  }
}

export default AudiobookshelfAPI;
