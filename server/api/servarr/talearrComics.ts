import ExternalAPI from '@server/api/externalapi';
import type { ComicKind } from '@server/constants/media';
import { isComicKind } from '@server/constants/media';
import { getSettings } from '@server/lib/settings';

// The status route opens Talearr's comics database, which is quick
const STATUS_TIMEOUT_MS = 5_000;
// A lookup asks AniList and Hardcover, which can be slow
const LOOKUP_TIMEOUT_MS = 30_000;
// Adding a series loads its volumes from the metadata sources first
const ADD_TIMEOUT_MS = 60_000;

/**
 * Whether Talearr's comics library can be used. Unavailable when the server
 * has no comics routes, as stock Chaptarr and older Talearr do not, or when
 * Talearr could not open its comics database.
 */
export interface TalearrComicsStatus {
  available: boolean;
  reason?: string;
  ageRatings: string[];
}

/**
 * One series Talearr's comics lookup found, from AniList, Hardcover or both
 */
export interface TalearrComicLookupResult {
  aniListId?: number | null;
  hardcoverSeriesId?: number | null;
  kind: ComicKind;
  title: string;
  alternateTitles: string[];
  year?: number | null;
  status?: string | null;
  volumes?: number | null;
  authors?: string | null;
  overview?: string | null;
  coverUrl?: string | null;
  ageRating?: string | null;
  isAdult: boolean;
  format?: string | null;
  // Set when the series is in Talearr's library already
  seriesId?: number | null;
}

export interface TalearrComicLookupResponse {
  results: TalearrComicLookupResult[];
  // Plain notes for the user, such as a metadata source being down
  notices: string[];
}

export interface TalearrComicSeries {
  id: number;
  kind: ComicKind;
  title: string;
  aniListId?: number | null;
  hardcoverSeriesId?: number | null;
  monitored: boolean;
  path?: string;
}

/**
 * A series in Talearr's library with how many of its volumes it has
 */
export interface TalearrComicSeriesSummary {
  series: TalearrComicSeries;
  effectiveAgeRating?: string;
  volumeCount: number;
  downloadedCount: number;
  missingCount: number;
  downloadingCount: number;
}

export interface TalearrComicRootFolder {
  id: number;
  path: string;
  // manga, comic or any
  kind: string;
  isKids: boolean;
  maxAgeRating?: string | null;
}

export interface TalearrComicAddBody {
  aniListId?: number;
  hardcoverSeriesId?: number;
  kind: ComicKind;
  rootFolderId: number;
  // all, future (only volumes released after adding) or none
  monitor: 'all' | 'future' | 'none';
}

/**
 * A refusal from Talearr's comics routes, with Talearr's own message, such
 * as a series already being in the library
 */
export class TalearrComicsError extends Error {
  public needsAgeRating: boolean;

  constructor(message: string, needsAgeRating = false) {
    super(message);
    this.name = 'TalearrComicsError';
    this.needsAgeRating = needsAgeRating;
  }
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Reads one lookup result, or undefined when it names no series Talearr
 * could add
 */
export const parseComicLookupResult = (
  value: unknown
): TalearrComicLookupResult | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const result = value as Record<string, unknown>;
  const aniListId = asNumber(result.aniListId);
  const hardcoverSeriesId = asNumber(result.hardcoverSeriesId);
  const title = asString(result.title);

  if ((!aniListId && !hardcoverSeriesId) || !title) {
    return undefined;
  }

  return {
    aniListId,
    hardcoverSeriesId,
    kind: isComicKind(result.kind) ? result.kind : 'manga',
    title,
    alternateTitles: Array.isArray(result.alternateTitles)
      ? result.alternateTitles.filter(
          (alt): alt is string => typeof alt === 'string' && !!alt
        )
      : [],
    year: asNumber(result.year),
    status: asString(result.status),
    volumes: asNumber(result.volumes),
    authors: asString(result.authors),
    overview: asString(result.overview),
    coverUrl: asString(result.coverUrl),
    ageRating: asString(result.ageRating),
    isAdult: result.isAdult === true,
    format: asString(result.format),
    seriesId: asNumber(result.seriesId),
  };
};

export const parseComicLookupResponse = (
  value: unknown
): TalearrComicLookupResponse => {
  const response = (value ?? {}) as Record<string, unknown>;

  return {
    results: (Array.isArray(response.results) ? response.results : [])
      .map(parseComicLookupResult)
      .filter((result): result is TalearrComicLookupResult => !!result),
    notices: (Array.isArray(response.notices) ? response.notices : []).filter(
      (notice): notice is string => typeof notice === 'string' && !!notice
    ),
  };
};

const refusalMessage = (data: unknown, fallback: string): string => {
  const message = (data as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' && message ? message : fallback;
};

/**
 * Talearr's comics and manga library, under /api/v1/talearr/comics on the
 * Talearr server book requests go to
 */
class TalearrComicsAPI extends ExternalAPI {
  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super(
      url,
      { apikey: apiKey },
      { timeout: getSettings().network.apiRequestTimeout }
    );
  }

  public async getStatus(): Promise<TalearrComicsStatus> {
    const response = await this.axios.get<unknown>('/talearr/comics/status', {
      timeout: STATUS_TIMEOUT_MS,
      validateStatus: (status) => status < 500 && status !== 401,
    });

    if (response.status !== 200) {
      return {
        available: false,
        reason: 'This Talearr has no comics library.',
        ageRatings: [],
      };
    }

    const data = (response.data ?? {}) as Record<string, unknown>;

    return {
      available: data.available === true,
      reason: asString(data.reason) ?? undefined,
      ageRatings: Array.isArray(data.ageRatings)
        ? data.ageRatings.filter(
            (rating): rating is string => typeof rating === 'string'
          )
        : [],
    };
  }

  public async lookup(
    term: string,
    kind: ComicKind
  ): Promise<TalearrComicLookupResponse> {
    const response = await this.axios.get<unknown>('/talearr/comics/lookup', {
      params: { term, kind },
      timeout: LOOKUP_TIMEOUT_MS,
      validateStatus: (status) => status < 500 && status !== 401,
    });

    if (response.status !== 200) {
      throw new TalearrComicsError(
        refusalMessage(response.data, 'Talearr could not search for comics.')
      );
    }

    return parseComicLookupResponse(response.data);
  }

  public async getSeries(): Promise<TalearrComicSeriesSummary[]> {
    const response = await this.axios.get<unknown>('/talearr/comics/series');

    return Array.isArray(response.data)
      ? (response.data as TalearrComicSeriesSummary[]).filter(
          (summary) => typeof summary?.series?.id === 'number'
        )
      : [];
  }

  public async getRootFolders(): Promise<TalearrComicRootFolder[]> {
    const response = await this.axios.get<unknown>(
      '/talearr/comics/rootfolders'
    );

    return Array.isArray(response.data)
      ? (response.data as TalearrComicRootFolder[])
      : [];
  }

  /**
   * Whether Talearr searches for a series' volumes itself once it is added
   */
  public async searchesOnAdd(): Promise<boolean> {
    const response = await this.axios.get<{ automaticSearch?: unknown }>(
      '/talearr/comics/settings'
    );

    return response.data?.automaticSearch !== false;
  }

  public async addSeries(
    body: TalearrComicAddBody
  ): Promise<TalearrComicSeries> {
    const response = await this.axios.post<unknown>(
      '/talearr/comics/series',
      body,
      {
        timeout: ADD_TIMEOUT_MS,
        validateStatus: (status) => status < 500 && status !== 401,
      }
    );

    if (response.status !== 200 && response.status !== 201) {
      throw new TalearrComicsError(
        refusalMessage(response.data, 'Talearr could not add the series.'),
        (response.data as { needsAgeRating?: unknown } | undefined)
          ?.needsAgeRating === true
      );
    }

    return response.data as TalearrComicSeries;
  }

  /**
   * Searches the indexers for the series' wanted volumes and grabs the best
   * releases
   */
  public async searchSeries(seriesId: number): Promise<void> {
    await this.axios.post(
      `/talearr/comics/series/${seriesId}/search`,
      undefined,
      { timeout: ADD_TIMEOUT_MS }
    );
  }
}

export default TalearrComicsAPI;
