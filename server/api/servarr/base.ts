import ExternalAPI from '@server/api/externalapi';
import type { AvailableCacheIds } from '@server/lib/cache';
import cacheManager from '@server/lib/cache';
import { getSettings, type DVRSettings } from '@server/lib/settings';
import logger from '@server/logger';

export interface SystemStatus {
  version: string;
  buildTime: Date;
  isDebug: boolean;
  isProduction: boolean;
  isAdmin: boolean;
  isUserInteractive: boolean;
  startupPath: string;
  appData: string;
  osName: string;
  osVersion: string;
  isNetCore: boolean;
  isMono: boolean;
  isLinux: boolean;
  isOsx: boolean;
  isWindows: boolean;
  isDocker: boolean;
  mode: string;
  branch: string;
  authentication: string;
  sqliteVersion: string;
  migrationVersion: number;
  urlBase: string;
  runtimeVersion: string;
  runtimeName: string;
  startTime: Date;
  packageUpdateMechanism: string;
}

export interface RootFolder {
  id: number;
  path: string;
  freeSpace: number;
  totalSpace: number;
  unmappedFolders: {
    name: string;
    path: string;
  }[];
}

export interface QualityProfile {
  id: number;
  name: string;
}

interface QueueItem {
  size: number;
  title: string;
  sizeleft: number;
  timeleft: string;
  estimatedCompletionTime: string;
  status: string;
  trackedDownloadStatus: string;
  trackedDownloadState: string;
  downloadId: string;
  protocol: string;
  downloadClient: string;
  indexer: string;
  id: number;
}

export interface Tag {
  id: number;
  label: string;
}

/**
 * A release an indexer search returned, as the arr lists it. Only the fields
 * read here are typed; each arr adds its own.
 */
export interface ServarrRelease {
  [key: string]: unknown;
  guid: string;
  indexerId: number;
  title?: string;
  size?: number;
  ageHours?: number;
  indexer?: string;
  protocol?: string;
  seeders?: number | null;
  leechers?: number | null;
  quality?: {
    [key: string]: unknown;
    quality?: { [key: string]: unknown; name?: string };
  };
  qualityWeight?: number;
  languages?: { id?: number; name?: string }[];
  approved?: boolean;
  temporarilyRejected?: boolean;
  rejected?: boolean;
  // Strings on most arrs, objects with a reason on some versions
  rejections?: (
    | string
    | { [key: string]: unknown; reason?: string; message?: string }
  )[];
  // Chaptarr explains each rejection, and TaleArr adds a short label such
  // as "Language" or "Pack" and the check that rejected it
  rejectionDetails?: {
    [key: string]: unknown;
    reason?: string;
    label?: string;
    source?: string;
  }[];
  customFormatScore?: number;
  releaseGroup?: string | null;
  infoUrl?: string | null;
  publishDate?: string;
}

/**
 * A reason an arr gives for a download in its queue needing attention. The
 * title is usually the release or file and the messages say what is wrong.
 */
export interface ServarrStatusMessage {
  title?: string;
  messages?: string[];
}

/**
 * An event in an arr's history, such as a grab or an import
 */
export interface ServarrHistoryRecord {
  id: number;
  eventType: string;
  date: string;
  downloadId?: string | null;
  sourceTitle?: string;
  movieId?: number;
  seriesId?: number;
  episodeId?: number;
  albumId?: number;
  bookId?: number;
  data?: Record<string, string | null | undefined>;
}

// An indexer search for releases runs while the request waits, and with
// many indexers it takes minutes
export const RELEASE_SEARCH_TIMEOUT_MS = 180_000;
// Sending a release to the download client
const GRAB_TIMEOUT_MS = 60_000;

/**
 * The message an arr gave for a failed call, such as "Couldn't find
 * requested release in cache", or the error's own message
 */
export const getArrErrorMessage = (e: unknown): string => {
  const error = e as {
    message?: string;
    response?: { data?: unknown };
  };
  const data = error?.response?.data;

  if (typeof data === 'string' && data.trim()) {
    return data.trim().slice(0, 300);
  }
  if (Array.isArray(data)) {
    const messages = data
      .map((item) =>
        typeof item === 'object' && item
          ? ((item as { errorMessage?: string }).errorMessage ?? '')
          : String(item)
      )
      .filter(Boolean);
    if (messages.length) {
      return messages.join(', ');
    }
  }
  if (typeof data === 'object' && data) {
    const message =
      (data as { message?: string }).message ??
      (data as { error?: string }).error;
    if (message) {
      return message;
    }
  }

  return error?.message ?? String(e);
};

// Downloads read from a queue at once, more than a queue holds
const QUEUE_RECORDS_PAGE_SIZE = 1000;

interface QueueResponse<QueueItemAppendT> {
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: string;
  totalRecords: number;
  records: (QueueItem & QueueItemAppendT)[];
}

class ServarrBase<QueueItemAppendT> extends ExternalAPI {
  static buildUrl(settings: DVRSettings, path?: string): string {
    return `${settings.useSsl ? 'https' : 'http'}://${settings.hostname}:${
      settings.port
    }${settings.baseUrl ?? ''}${path}`;
  }

  protected apiName: string;

  constructor({
    url,
    apiKey,
    cacheName,
    apiName,
  }: {
    url: string;
    apiKey: string;
    cacheName: AvailableCacheIds;
    apiName: string;
  }) {
    const timeout = getSettings().network.apiRequestTimeout;

    super(
      url,
      {
        apikey: apiKey,
      },
      {
        nodeCache: cacheManager.getCache(cacheName).data,
        timeout,
      }
    );

    this.apiName = apiName;
  }

  public getSystemStatus = async (): Promise<SystemStatus> => {
    try {
      const response = await this.axios.get<SystemStatus>('/system/status');

      return response.data;
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to retrieve system status: ${e.message}`,
        { cause: e }
      );
    }
  };

  public getProfiles = async (): Promise<QualityProfile[]> => {
    try {
      const data = await this.getRolling<QualityProfile[]>(
        `/qualityProfile`,
        undefined,
        3600
      );

      return data;
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to retrieve profiles: ${e.message}`,
        { cause: e }
      );
    }
  };

  public getRootFolders = async (): Promise<RootFolder[]> => {
    try {
      const data = await this.getRolling<RootFolder[]>(
        `/rootfolder`,
        undefined,
        3600
      );

      return data;
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to retrieve root folders: ${e.message}`,
        { cause: e }
      );
    }
  };

  public getQueue = async (): Promise<(QueueItem & QueueItemAppendT)[]> => {
    try {
      const response = await this.axios.get<QueueResponse<QueueItemAppendT>>(
        `/queue`,
        {
          params: {
            includeEpisode: true,
          },
        }
      );

      return response.data.records;
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to retrieve queue: ${e.message}`,
        { cause: e }
      );
    }
  };

  /**
   * Every download in the queue as the arr sends it, with what params asks
   * it to include, such as includeMovie. getQueue reads only the first page.
   */
  public async getQueueRecords<T>(
    params: Record<string, unknown> = {}
  ): Promise<T[]> {
    try {
      const response = await this.axios.get<{ records?: T[] }>('/queue', {
        params: { page: 1, pageSize: QUEUE_RECORDS_PAGE_SIZE, ...params },
      });

      return Array.isArray(response.data?.records) ? response.data.records : [];
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to retrieve queue: ${e.message}`,
        { cause: e }
      );
    }
  }

  /**
   * Removes a download from the queue and, unless told not to, from the
   * download client. With blocklist, its release is never grabbed again.
   * skipRedownload keeps the arr from searching by itself, for callers that
   * search after.
   */
  public async removeQueueItem(
    queueId: number,
    {
      blocklist,
      removeFromClient = true,
      skipRedownload = true,
    }: {
      blocklist: boolean;
      removeFromClient?: boolean;
      skipRedownload?: boolean;
    }
  ): Promise<void> {
    try {
      await this.axios.delete(`/queue/${queueId}`, {
        params: { removeFromClient, blocklist, skipRedownload },
      });
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to remove the download from the queue: ${getArrErrorMessage(e)}`,
        { cause: e }
      );
    }
  }

  public getTags = async (): Promise<Tag[]> => {
    try {
      const response = await this.axios.get<Tag[]>(`/tag`);

      return response.data;
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to retrieve tags: ${e.message}`,
        { cause: e }
      );
    }
  };

  public createTag = async ({ label }: { label: string }): Promise<Tag> => {
    try {
      const response = await this.axios.post<Tag>(`/tag`, {
        label,
      });

      return response.data;
    } catch (e) {
      throw new Error(`[${this.apiName}] Failed to create tag: ${e.message}`, {
        cause: e,
      });
    }
  };

  public renameTag = async ({
    id,
    label,
  }: {
    id: number;
    label: string;
  }): Promise<Tag> => {
    try {
      const response = await this.axios.put<Tag>(`/tag/${id}`, {
        id,
        label,
      });

      return response.data;
    } catch (e) {
      throw new Error(`[${this.apiName}] Failed to rename tag: ${e.message}`, {
        cause: e,
      });
    }
  };

  /**
   * Searches the indexers for releases, as the arr's interactive search
   * does. The arr waits for every indexer before it answers.
   */
  protected async fetchReleases<T>(
    params: Record<string, unknown>
  ): Promise<T> {
    try {
      const response = await this.axios.get<T>('/release', {
        params,
        timeout: RELEASE_SEARCH_TIMEOUT_MS,
      });

      return response.data;
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to search for releases: ${getArrErrorMessage(e)}`,
        { cause: e }
      );
    }
  }

  /**
   * Sends a release from the last search to the download client. The arr
   * keeps search results for about half an hour, an older release has to be
   * searched for again.
   */
  public async grabRelease(
    release: { guid: string; indexerId: number } & Record<string, unknown>
  ): Promise<void> {
    try {
      await this.axios.post('/release', release, { timeout: GRAB_TIMEOUT_MS });
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to grab the release: ${getArrErrorMessage(e)}`,
        { cause: e }
      );
    }
  }

  protected async fetchHistory(
    path: string,
    params: Record<string, unknown>
  ): Promise<ServarrHistoryRecord[]> {
    try {
      const response = await this.axios.get<
        ServarrHistoryRecord[] | { records?: ServarrHistoryRecord[] }
      >(path, { params });

      return Array.isArray(response.data)
        ? response.data
        : (response.data.records ?? []);
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to retrieve history: ${getArrErrorMessage(e)}`,
        { cause: e }
      );
    }
  }

  /**
   * Marks the download of a grab as failed. The arr adds the release to its
   * blocklist, and when its Redownload Failed setting is on, it searches
   * again by itself.
   */
  public async markHistoryFailed(historyId: number): Promise<void> {
    try {
      await this.axios.post(`/history/failed/${historyId}`);
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to mark the download as failed: ${getArrErrorMessage(e)}`,
        { cause: e }
      );
    }
  }

  /**
   * Runs a search command, such as MoviesSearch, failing when the arr does
   * not accept it
   */
  public async startSearch(
    commandName: string,
    options: Record<string, unknown>
  ): Promise<void> {
    logger.info('Executing search command', {
      label: `${this.apiName} API`,
      commandName,
      ...options,
    });

    await this.runCommand(commandName, options);
  }

  async refreshMonitoredDownloads(): Promise<void> {
    await this.runCommand('RefreshMonitoredDownloads', {});
  }

  protected async runCommand(
    commandName: string,
    options: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.axios.post(`/command`, {
        name: commandName,
        ...options,
      });
    } catch (e) {
      throw new Error(`[${this.apiName}] Failed to run command: ${e.message}`, {
        cause: e,
      });
    }
  }
}

export default ServarrBase;
