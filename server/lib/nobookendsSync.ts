import NoBookEndsSyncAPI from '@server/api/nobookendsSync';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type { NoBookEndsSyncSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { runInBackground } from '@server/utils/backgroundTasks';
import { IsNull, Not } from 'typeorm';

/**
 * NoBookEnds Sync is a separate server that aligns an Audiobookshelf
 * audiobook to the EPUB of the same book, so the NoBookEnds app can
 * highlight the words being read. AllSeerr knows when both formats of a
 * book are in the library, and queues the pair there right away instead
 * of waiting for the Sync server's own library poll.
 */

const trimUrl = (url?: string | null): string | undefined =>
  url?.trim().replace(/\/+$/, '') || undefined;

export interface NoBookEndsSyncTarget {
  url: string;
  adminToken: string;
}

/**
 * Where this server reaches the Sync server and the token it queues with,
 * or null while the integration is off or not set up
 */
export const getNoBookEndsSyncTarget = (
  settings: NoBookEndsSyncSettings = getSettings().nobookendsSync
): NoBookEndsSyncTarget | null => {
  const url = trimUrl(settings.internalUrl) ?? trimUrl(settings.url);
  const adminToken = settings.adminToken?.trim();

  if (!settings.enabled || !url || !adminToken) {
    return null;
  }

  return { url, adminToken };
};

/**
 * The public address the apps open, or undefined while the integration is
 * off or has no address
 */
export const getNoBookEndsSyncPublicUrl = (
  settings: NoBookEndsSyncSettings = getSettings().nobookendsSync
): string | undefined => (settings.enabled ? trimUrl(settings.url) : undefined);

export interface NoBookEndsSyncPair {
  audioItemId: string;
  ebookItemId: string;
}

/**
 * The pair to align, once a book has both an audiobook and an ebook item
 */
export const getNoBookEndsSyncPair = (
  media: Pick<Media, 'absAudiobookItemId' | 'absEbookItemId'>
): NoBookEndsSyncPair | null =>
  media.absAudiobookItemId && media.absEbookItemId
    ? {
        audioItemId: media.absAudiobookItemId,
        ebookItemId: media.absEbookItemId,
      }
    : null;

// Waits before trying a pair again after the Sync server did not take it.
// After the last one the pair waits for the next change or a backfill.
export const RETRY_DELAYS_MS = [
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];

const pairKey = ({ audioItemId, ebookItemId }: NoBookEndsSyncPair) =>
  `${audioItemId}:${ebookItemId}`;

// Pairs the Sync server took since this server started
const queuedPairs = new Set<string>();
const inFlight = new Map<string, Promise<NoBookEndsSyncQueueResult>>();
const retries = new Map<
  string,
  { attempts: number; timer: ReturnType<typeof setTimeout> }
>();

/**
 * Forgets what was queued and stops the retries, for tests
 */
export const resetNoBookEndsSyncState = (): void => {
  queuedPairs.clear();
  inFlight.clear();

  for (const { timer } of retries.values()) {
    clearTimeout(timer);
  }

  retries.clear();
};

export type NoBookEndsSyncQueueResult = 'queued' | 'skipped' | 'failed';

const scheduleRetry = (pair: NoBookEndsSyncPair) => {
  const key = pairKey(pair);
  const attempts = (retries.get(key)?.attempts ?? 0) + 1;
  const delay = RETRY_DELAYS_MS[attempts - 1];

  if (retries.has(key)) {
    clearTimeout(retries.get(key)!.timer);
  }

  if (delay === undefined) {
    retries.delete(key);
    logger.info('Gave up queueing a book on NoBookEnds Sync for now', {
      label: 'NoBookEnds Sync',
      ...pair,
    });
    return;
  }

  const timer = setTimeout(() => {
    runInBackground(queuePair(pair, { retry: true }));
  }, delay);
  // A pending retry never keeps the process alive
  timer.unref?.();
  retries.set(key, { attempts, timer });
};

const queuePair = async (
  pair: NoBookEndsSyncPair,
  { force = false, retry = false }: { force?: boolean; retry?: boolean } = {}
): Promise<NoBookEndsSyncQueueResult> => {
  const target = getNoBookEndsSyncTarget();
  const key = pairKey(pair);

  if (!target) {
    // Turned off meanwhile, a later change or a backfill queues the pair
    if (retries.has(key)) {
      clearTimeout(retries.get(key)!.timer);
      retries.delete(key);
    }

    return 'skipped';
  }

  if (!force && queuedPairs.has(key)) {
    return 'skipped';
  }

  try {
    const client = new NoBookEndsSyncAPI(target);
    const job = await client.queueAlignment(pair.audioItemId, pair.ebookItemId);

    queuedPairs.add(key);

    if (retries.has(key)) {
      clearTimeout(retries.get(key)!.timer);
      retries.delete(key);
    }

    logger.info('Queued a book on NoBookEnds Sync', {
      label: 'NoBookEnds Sync',
      ...pair,
      status: job?.status,
    });

    return 'queued';
  } catch (e) {
    logger.debug('Failed to queue a book on NoBookEnds Sync', {
      label: 'NoBookEnds Sync',
      ...pair,
      retry,
      errorMessage: e.message,
    });

    if (!retry || retries.has(key)) {
      scheduleRetry(pair);
    }

    return 'failed';
  }
};

/**
 * Queues a pair on the Sync server unless it was queued before. Calls for
 * a pair already on its way share the one request. A pair the server does
 * not take is tried again later. With force the pair is sent even when it
 * was queued before, the Sync server ignoring pairs it already has.
 */
export const queueNoBookEndsSyncPair = (
  pair: NoBookEndsSyncPair,
  options: { force?: boolean } = {}
): Promise<NoBookEndsSyncQueueResult> => {
  const key = pairKey(pair);
  const running = inFlight.get(key);

  if (running) {
    return running;
  }

  const task = queuePair(pair, options).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, task);

  return task;
};

/**
 * Called when the Audiobookshelf items of a book changed. Once it has both
 * an audiobook and an ebook, the pair is queued without waiting for it.
 */
export const onAudiobookshelfItemIdsChanged = (
  media: Pick<Media, 'id' | 'absAudiobookItemId' | 'absEbookItemId'>
): void => {
  const pair = getNoBookEndsSyncPair(media);

  if (!pair || !getNoBookEndsSyncTarget()) {
    return;
  }

  logger.debug('A book has an audiobook and an ebook, queueing it for sync', {
    label: 'NoBookEnds Sync',
    mediaId: media.id,
    ...pair,
  });
  runInBackground(queueNoBookEndsSyncPair(pair));
};

export interface NoBookEndsSyncBackfillResult {
  total: number;
  queued: number;
  failed: number;
}

// Requests to the Sync server at a time during a backfill
const BACKFILL_CONCURRENCY = 4;

/**
 * Queues every book that has both an audiobook and an ebook item. Pairs
 * queued before are sent again, the Sync server leaving alone what it has.
 */
export const backfillNoBookEndsSync =
  async (): Promise<NoBookEndsSyncBackfillResult> => {
    const result: NoBookEndsSyncBackfillResult = {
      total: 0,
      queued: 0,
      failed: 0,
    };

    if (!getNoBookEndsSyncTarget()) {
      return result;
    }

    const media = await getRepository(Media).find({
      select: ['id', 'absAudiobookItemId', 'absEbookItemId'],
      where: {
        mediaType: MediaType.BOOK,
        absAudiobookItemId: Not(IsNull()),
        absEbookItemId: Not(IsNull()),
      },
      order: { id: 'ASC' },
    });
    const pairs = new Map<string, NoBookEndsSyncPair>();

    for (const item of media) {
      const pair = getNoBookEndsSyncPair(item);

      if (pair) {
        pairs.set(pairKey(pair), pair);
      }
    }

    const queue = [...pairs.values()];
    result.total = queue.length;

    const worker = async () => {
      for (let pair = queue.shift(); pair; pair = queue.shift()) {
        const outcome = await queueNoBookEndsSyncPair(pair, { force: true });

        if (outcome === 'queued') {
          result.queued++;
        } else if (outcome === 'failed') {
          result.failed++;
        }
      }
    };

    await Promise.all(
      Array.from({ length: BACKFILL_CONCURRENCY }, () => worker())
    );

    logger.info('Queued the books with both formats on NoBookEnds Sync', {
      label: 'NoBookEnds Sync',
      ...result,
    });

    return result;
  };
