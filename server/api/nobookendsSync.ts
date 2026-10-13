import { proxyRequestInterceptor } from '@server/utils/customProxyAgent';
import { userAgentRequestInterceptor } from '@server/utils/userAgent';
import type { AxiosInstance } from 'axios';
import axios, { isAxiosError } from 'axios';

export interface NoBookEndsSyncHealth {
  ok: boolean;
  version?: string;
  gpu: boolean;
}

/**
 * The summary from GET /api/v1/admin/status
 */
export interface NoBookEndsSyncStatus {
  version?: string;
  gpu: boolean;
  // Background (auto priority) jobs only run inside this window. Start and
  // end are null and active is true when there is no window.
  window: { start: string | null; end: string | null; active: boolean };
  // Queued jobs: user includes admin priority, auto is background work
  queue: { user: number; auto: number; total: number };
  current: {
    audioItemId: string;
    ebookItemId: string;
    title: string | null;
    progress: number | null;
  } | null;
}

/**
 * user: like a reader's request, ahead of background work and never held
 * for the window. auto: background work, only run inside the window.
 */
export type NoBookEndsSyncPriority = 'user' | 'auto';

export interface NoBookEndsSyncPairInput {
  audioItemId: string;
  ebookItemId: string;
}

/**
 * An alignment job as the Sync server's admin API describes it
 */
export interface NoBookEndsSyncJob {
  audioItemId: string;
  ebookItemId: string;
  status: string;
  progress?: number;
  priority?: number;
  waitingForWindow?: boolean;
}

export interface NoBookEndsSyncBulkResult {
  audioItemId: string;
  ebookItemId: string;
  ok: boolean;
  status?: string;
  priority?: number;
  waitingForWindow?: boolean;
  reason?: string;
  error?: string;
}

export interface NoBookEndsSyncBulkResponse {
  accepted: number;
  rejected: number;
  results: NoBookEndsSyncBulkResult[];
}

// Pairs the Sync server takes in one bulk call
export const MAX_BULK_PAIRS = 500;

/**
 * Why the Sync server refused a request, from the reason in its error body
 * ({ detail, reason }), or undefined when it gave none
 */
export const getNoBookEndsSyncReason = (e: unknown): string | undefined => {
  if (!isAxiosError(e)) {
    return undefined;
  }

  const reason = (e.response?.data as { reason?: unknown } | undefined)?.reason;

  return typeof reason === 'string' ? reason : undefined;
};

/**
 * Talks to a NoBookEnds Sync server, which aligns an Audiobookshelf
 * audiobook to its EPUB for Listen and Read. Health is public, the rest
 * needs the server's ADMIN_TOKEN.
 */
class NoBookEndsSyncAPI {
  private axios: AxiosInstance;

  constructor({
    url,
    adminToken,
    timeout = 10000,
  }: {
    url: string;
    adminToken?: string;
    timeout?: number;
  }) {
    this.axios = axios.create({
      baseURL: url.replace(/\/+$/, ''),
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
      timeout,
    });
    this.axios.interceptors.request.use(proxyRequestInterceptor);
    this.axios.interceptors.request.use(userAgentRequestInterceptor);
  }

  public async getHealth(): Promise<NoBookEndsSyncHealth> {
    const response =
      await this.axios.get<Partial<NoBookEndsSyncHealth>>('/api/v1/health');

    if (!response.data || typeof response.data.ok !== 'boolean') {
      throw new Error('Unexpected answer to /api/v1/health');
    }

    return {
      ok: response.data.ok,
      version: response.data.version,
      gpu: !!response.data.gpu,
    };
  }

  /**
   * Version, GPU, background window, queue counts and the running job.
   * Read only. Older Sync servers answer 404.
   */
  public async getStatus(): Promise<NoBookEndsSyncStatus> {
    const response = await this.axios.get<Partial<NoBookEndsSyncStatus>>(
      '/api/v1/admin/status'
    );
    const data = response.data ?? {};

    if (!data.queue || typeof data.queue.total !== 'number') {
      throw new Error('Unexpected answer to /api/v1/admin/status');
    }

    return {
      version: data.version,
      gpu: !!data.gpu,
      window: {
        start: data.window?.start ?? null,
        end: data.window?.end ?? null,
        active: data.window?.active ?? true,
      },
      queue: {
        user: data.queue.user ?? 0,
        auto: data.queue.auto ?? 0,
        total: data.queue.total,
      },
      current: data.current
        ? {
            audioItemId: data.current.audioItemId,
            ebookItemId: data.current.ebookItemId,
            title: data.current.title ?? null,
            progress:
              typeof data.current.progress === 'number'
                ? data.current.progress
                : null,
          }
        : null,
    };
  }

  /**
   * Queues one pair. Idempotent on the Sync server: a pair already queued,
   * running or aligned is left alone. A refused pair answers 404 or 422
   * with a reason, and 502 when Audiobookshelf could not be asked.
   */
  public async queueAlignment(
    pair: NoBookEndsSyncPairInput,
    { priority, source }: { priority: NoBookEndsSyncPriority; source: string }
  ): Promise<NoBookEndsSyncJob> {
    const response = await this.axios.post<NoBookEndsSyncJob>(
      '/api/v1/admin/alignments',
      {
        audioItemId: pair.audioItemId,
        ebookItemId: pair.ebookItemId,
        priority,
        source,
      }
    );

    return response.data;
  }

  /**
   * Queues up to MAX_BULK_PAIRS pairs in one call. Answers 200 with a
   * result per pair, in request order, even when some are refused.
   */
  public async queueAlignments(
    pairs: NoBookEndsSyncPairInput[],
    { priority, source }: { priority: NoBookEndsSyncPriority; source: string }
  ): Promise<NoBookEndsSyncBulkResponse> {
    const response = await this.axios.post<NoBookEndsSyncBulkResponse>(
      '/api/v1/admin/alignments',
      {
        pairs: pairs.map(({ audioItemId, ebookItemId }) => ({
          audioItemId,
          ebookItemId,
        })),
        priority,
        source,
      },
      // A call checks up to 1000 items with Audiobookshelf
      { timeout: 120000 }
    );

    if (!Array.isArray(response.data?.results)) {
      throw new Error('Unexpected answer to a bulk alignment request');
    }

    return response.data;
  }
}

export default NoBookEndsSyncAPI;
