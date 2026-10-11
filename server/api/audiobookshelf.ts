import { proxyRequestInterceptor } from '@server/utils/customProxyAgent';
import { userAgentRequestInterceptor } from '@server/utils/userAgent';
import type { AxiosInstance } from 'axios';
import axios from 'axios';

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

interface AudiobookshelfStatus {
  isInit?: boolean;
  serverVersion?: string;
}

/**
 * Talks to an Audiobookshelf server: checks that it answers, lists its
 * libraries for the settings and searches a library for a book
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
}

export default AudiobookshelfAPI;
