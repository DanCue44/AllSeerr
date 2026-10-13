import { proxyRequestInterceptor } from '@server/utils/customProxyAgent';
import { userAgentRequestInterceptor } from '@server/utils/userAgent';
import type { AxiosInstance } from 'axios';
import axios from 'axios';

export interface NoBookEndsSyncHealth {
  ok: boolean;
  version?: string;
  gpu: boolean;
}

/**
 * An alignment job as the Sync server's admin API describes it
 */
export interface NoBookEndsSyncJob {
  audioItemId: string;
  ebookItemId: string;
  status: 'queued' | 'processing' | 'ready' | 'failed' | string;
  progress?: number;
  titles?: {
    audio_id?: { title?: string; author?: string };
    ebook_id?: { title?: string; author?: string };
  };
}

interface NoBookEndsSyncJobsResponse {
  worker?: { alive?: boolean; current?: [string, string] | null };
  counts?: Record<string, number>;
  jobs?: NoBookEndsSyncJob[];
}

export interface NoBookEndsSyncQueue {
  // Jobs waiting, capped at QUEUE_LIMIT
  queued: number;
  queueCapped: boolean;
  workerAlive: boolean;
  processing: {
    audioItemId: string;
    ebookItemId: string;
    title: string | null;
    progress: number | null;
  } | null;
}

// Queued jobs counted for the settings page, the admin API lists each one
const QUEUE_LIMIT = 2000;

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
   * How many jobs wait and which one runs. Read only.
   */
  public async getQueue(): Promise<NoBookEndsSyncQueue> {
    const response = await this.axios.get<NoBookEndsSyncJobsResponse>(
      '/api/v1/admin/jobs',
      { params: { status: 'queued', limit: QUEUE_LIMIT } }
    );
    const queued = response.data.jobs?.length ?? 0;
    const current = response.data.worker?.current;
    let processing: NoBookEndsSyncQueue['processing'] = null;

    if (current?.[0] && current[1]) {
      processing = {
        audioItemId: current[0],
        ebookItemId: current[1],
        title: null,
        progress: null,
      };

      try {
        const job = await this.axios.get<NoBookEndsSyncJob>(
          `/api/v1/admin/jobs/${encodeURIComponent(
            current[0]
          )}/${encodeURIComponent(current[1])}`
        );
        processing.title = job.data.titles?.audio_id?.title ?? null;
        processing.progress =
          typeof job.data.progress === 'number' ? job.data.progress : null;
      } catch {
        // The job may have finished between the two calls
      }
    }

    return {
      queued,
      queueCapped: queued >= QUEUE_LIMIT,
      workerAlive: !!response.data.worker?.alive,
      processing,
    };
  }

  /**
   * Queues an audiobook and ebook pair. The Sync server makes this
   * idempotent: a pair already queued, running or aligned is left alone.
   */
  public async queueAlignment(
    audioItemId: string,
    ebookItemId: string
  ): Promise<NoBookEndsSyncJob> {
    const response = await this.axios.post<NoBookEndsSyncJob>(
      '/api/v1/admin/alignments',
      { audioItemId, ebookItemId }
    );

    return response.data;
  }
}

export default NoBookEndsSyncAPI;
