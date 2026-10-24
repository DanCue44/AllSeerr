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
// A preview asks AniList or Hardcover for one series while its page loads
const PREVIEW_TIMEOUT_MS = 15_000;

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

/**
 * The lists Talearr's comics discover route serves: AniList manga for the
 * first three, popular Western comics from Hardcover for comics
 */
export const TALEARR_COMIC_DISCOVER_LISTS = [
  'trending',
  'popular',
  'releasing',
  'comics',
] as const;

export type TalearrComicDiscoverList =
  (typeof TALEARR_COMIC_DISCOVER_LISTS)[number];

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
  // Only these volume numbers are monitored and searched for, when given.
  // Older Talearr ignores it and monitors every volume.
  volumes?: number[];
}

/**
 * Talearr's answer to adding a series. `wanted` and `unknown` are only
 * there when volumes were asked for and Talearr knows of volume requests.
 */
export type TalearrComicAddedSeries = TalearrComicSeries & {
  wanted?: number[];
  unknown?: number[];
};

/**
 * Talearr's answer to wanting some volumes of a series in its library
 */
export interface TalearrComicWantAnswer {
  seriesId: number;
  // Monitored now, and searched for when asked
  wanted: number[];
  // Volume numbers the series does not have
  unknown: number[];
  // Volumes Talearr has files of already
  alreadyHave: number[];
}

/**
 * One volume of a series as the metadata sources list it
 */
export interface TalearrComicPreviewVolume {
  number: number;
  title: string | null;
  // yyyy-MM-dd
  releaseDate: string | null;
  coverUrl: string | null;
  pages?: number | null;
  description?: string | null;
  // The volume's page on Hardcover
  hardcoverUrl?: string | null;
}

/**
 * What the metadata sources say of one series, with its volumes, looked up
 * by id without adding it to the library
 */
export interface TalearrComicPreview {
  aniListId: number | null;
  hardcoverSeriesId: number | null;
  kind: ComicKind;
  title: string;
  alternateTitles: string[];
  // Plain text
  overview: string | null;
  authors: string | null;
  year: number | null;
  status: string | null;
  genres: string[];
  format: string | null;
  ageRating: string | null;
  isAdult: boolean;
  coverUrl: string | null;
  bannerUrl: string | null;
  volumeCount: number | null;
  volumes: TalearrComicPreviewVolume[];
  // Talearr's library id of the series, when it is there
  seriesId: number | null;
  notices: string[];
}

/**
 * The answer to a preview: the series, an id Talearr does not know, or a
 * Talearr with no preview route, as older Talearr has not. Talearr answers
 * 404 for both of the last two; its own refusal carries a message, the
 * missing route does not.
 */
export type TalearrComicPreviewAnswer =
  | { found: true; preview: TalearrComicPreview }
  | { found: false; unsupported: boolean };

/**
 * One volume in Talearr's library, with what Talearr has of it
 */
export interface TalearrComicLibraryVolume {
  number: number;
  title: string | null;
  releaseDate: string | null;
  coverUrl: string | null;
  // downloaded, downloading, missing, unreleased or unmonitored
  state: string | null;
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

const asStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && !!item)
    : [];

// Dates come as yyyy-MM-dd, or as a full timestamp from the library
const asDate = (value: unknown): string | null => {
  const text = asString(value);
  return text && /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
};

const parseVolume = (
  value: unknown
): (TalearrComicPreviewVolume & { state: string | null }) | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const volume = value as Record<string, unknown>;
  const number = asNumber(volume.number);

  if (number === null) {
    return undefined;
  }

  return {
    number,
    title: asString(volume.title),
    releaseDate: asDate(volume.releaseDate),
    coverUrl: asString(volume.coverUrl),
    state: asString(volume.state),
  };
};

// A preview's volume also says what Hardcover knows of it
const parsePreviewVolume = (
  value: unknown
): TalearrComicPreviewVolume | undefined => {
  const volume = parseVolume(value);

  if (!volume) {
    return undefined;
  }

  const extra = value as Record<string, unknown>;

  return {
    number: volume.number,
    title: volume.title,
    releaseDate: volume.releaseDate,
    coverUrl: volume.coverUrl,
    pages: asNumber(extra.pages),
    description: asString(extra.description),
    hardcoverUrl: asString(extra.hardcoverUrl),
  };
};

/**
 * Reads a preview, or undefined when it names no series
 */
export const parseComicPreview = (
  value: unknown
): TalearrComicPreview | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const preview = value as Record<string, unknown>;
  const aniListId = asNumber(preview.aniListId);
  const hardcoverSeriesId = asNumber(preview.hardcoverSeriesId);
  const title = asString(preview.title);

  if ((!aniListId && !hardcoverSeriesId) || !title) {
    return undefined;
  }

  const volumeCount = asNumber(preview.volumeCount);

  return {
    aniListId,
    hardcoverSeriesId,
    kind: isComicKind(preview.kind) ? preview.kind : 'manga',
    title,
    alternateTitles: asStrings(preview.alternateTitles),
    overview: asString(preview.overview),
    authors: asString(preview.authors),
    year: asNumber(preview.year),
    status: asString(preview.status),
    genres: asStrings(preview.genres),
    format: asString(preview.format),
    ageRating: asString(preview.ageRating),
    isAdult: preview.isAdult === true,
    coverUrl: asString(preview.coverUrl),
    bannerUrl: asString(preview.bannerUrl),
    volumeCount:
      volumeCount !== null && volumeCount >= 0 ? Math.floor(volumeCount) : null,
    volumes: (Array.isArray(preview.volumes) ? preview.volumes : [])
      .map(parsePreviewVolume)
      .filter((volume): volume is TalearrComicPreviewVolume => !!volume),
    seriesId: asNumber(preview.seriesId),
    notices: asStrings(preview.notices),
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

  /**
   * A discover list: AniList's trending, popular or releasing manga, or
   * popular Western comics from Hardcover. Undefined when Talearr has no
   * discover lists, as older Talearr does not.
   */
  public async discover(
    list: TalearrComicDiscoverList,
    page = 1
  ): Promise<TalearrComicLookupResponse | undefined> {
    const response = await this.axios.get<unknown>('/talearr/comics/discover', {
      params: { list, page },
      timeout: LOOKUP_TIMEOUT_MS,
      validateStatus: (status) => status < 500 && status !== 401,
    });

    if (response.status === 404) {
      return undefined;
    }

    if (response.status !== 200) {
      throw new TalearrComicsError(
        refusalMessage(response.data, 'Talearr could not list comics.')
      );
    }

    return parseComicLookupResponse(response.data);
  }

  /**
   * What the metadata sources say of one series and its volumes, by its
   * AniList or Hardcover id
   */
  public async preview({
    aniListId,
    hardcoverSeriesId,
    kind,
  }: {
    aniListId?: number;
    hardcoverSeriesId?: number;
    kind?: ComicKind;
  }): Promise<TalearrComicPreviewAnswer> {
    const response = await this.axios.get<unknown>('/talearr/comics/preview', {
      params: aniListId ? { aniListId, kind } : { hardcoverSeriesId, kind },
      timeout: PREVIEW_TIMEOUT_MS,
      // 503 is Talearr's answer while its metadata sources are down
      validateStatus: (status) =>
        (status < 500 && status !== 401) || status === 503,
    });

    if (response.status === 404) {
      const message = (response.data as { message?: unknown } | undefined)
        ?.message;
      return { found: false, unsupported: typeof message !== 'string' };
    }

    // Includes 503, whose sources are down: thrown, so it is asked again
    if (response.status !== 200) {
      throw new TalearrComicsError(
        refusalMessage(response.data, 'Talearr could not look up the series.')
      );
    }

    const preview = parseComicPreview(response.data);

    return preview
      ? { found: true, preview }
      : { found: false, unsupported: false };
  }

  /**
   * The volumes of a series in the library, with what Talearr has of each
   */
  public async getSeriesVolumes(
    seriesId: number
  ): Promise<TalearrComicLibraryVolume[]> {
    const response = await this.axios.get<{ volumes?: unknown }>(
      `/talearr/comics/series/${seriesId}`
    );

    return (Array.isArray(response.data?.volumes) ? response.data.volumes : [])
      .map(parseVolume)
      .filter((volume): volume is TalearrComicLibraryVolume => !!volume);
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
  ): Promise<TalearrComicAddedSeries> {
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

    return response.data as TalearrComicAddedSeries;
  }

  /**
   * Monitors some volumes of a series in the library and, unless asked not
   * to, searches for them. Undefined when Talearr has no such route, as
   * older Talearr does not.
   */
  public async wantVolumes(
    seriesId: number,
    volumes: number[],
    { search = true }: { search?: boolean } = {}
  ): Promise<TalearrComicWantAnswer | undefined> {
    const response = await this.axios.post<unknown>(
      `/talearr/comics/series/${seriesId}/want`,
      { volumes, search },
      {
        timeout: ADD_TIMEOUT_MS,
        validateStatus: (status) => status < 500 && status !== 401,
      }
    );

    // Talearr's own 404 for a series it does not know carries a message.
    // A route Talearr does not have answers without one, or with 405.
    if (
      response.status === 405 ||
      (response.status === 404 &&
        typeof (response.data as { message?: unknown } | undefined)?.message !==
          'string')
    ) {
      return undefined;
    }

    if (response.status !== 200) {
      throw new TalearrComicsError(
        refusalMessage(
          response.data,
          'Talearr could not want the volumes of the series.'
        )
      );
    }

    const data = (response.data ?? {}) as Record<string, unknown>;
    const numbers = (value: unknown) =>
      Array.isArray(value)
        ? value.filter((item): item is number => typeof item === 'number')
        : [];

    return {
      seriesId: typeof data.seriesId === 'number' ? data.seriesId : seriesId,
      wanted: numbers(data.wanted),
      unknown: numbers(data.unknown),
      alreadyHave: numbers(data.alreadyHave),
    };
  }

  /**
   * Monitors a series in the library and every volume of it that is not,
   * so its missing volumes are wanted. Answers how many volumes it turned
   * on.
   */
  public async monitorMissingVolumes(seriesId: number): Promise<number> {
    await this.axios.put(`/talearr/comics/series/${seriesId}`, {
      monitored: true,
      monitorNewVolumes: true,
    });

    const series = await this.axios.get<{
      volumes?: { id: number; monitored?: boolean; state?: string }[] | null;
    }>(`/talearr/comics/series/${seriesId}`);
    const volumeIds = (series.data?.volumes ?? [])
      .filter((volume) => !volume.monitored && volume.state !== 'downloaded')
      .map((volume) => volume.id);

    if (volumeIds.length > 0) {
      await this.axios.put('/talearr/comics/volumes/monitor', {
        volumeIds,
        monitored: true,
      });
    }

    return volumeIds.length;
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
