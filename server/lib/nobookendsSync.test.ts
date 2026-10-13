import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import type { NoBookEndsSyncPairInput } from '@server/api/nobookendsSync';
import NoBookEndsSyncAPI from '@server/api/nobookendsSync';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { rememberAudiobookshelfItemIds } from '@server/lib/audiobookshelfItem';
import {
  RETRY_DELAYS_MS,
  backfillNoBookEndsSync,
  getNoBookEndsSyncPair,
  getNoBookEndsSyncTarget,
  queueNoBookEndsSyncPair,
  resetNoBookEndsSyncState,
} from '@server/lib/nobookendsSync';
import { getSettings } from '@server/lib/settings';
import { settleTestBackgroundTasks, setupTestDb } from '@server/test/db';
import { AxiosError, AxiosHeaders } from 'axios';

const AUDIO_ITEM = 'li_audio0001';
const EBOOK_ITEM = 'li_ebook0001';

// Calls the Sync server received, and how it answers them
let calls: {
  url: string;
  pair: [string, string];
  priority?: string;
  source?: string;
}[] = [];
let bulkCalls: { pairs: number; priority: string; source: string }[] = [];
let failing: unknown = undefined;
let bulkReject: Record<string, string> = {};
let bulkError: unknown = undefined;

const syncError = (status: number, reason?: string) =>
  new AxiosError('refused', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: reason ? { detail: 'refused', reason } : { detail: [] },
  });

type ClientThis = { axios: { defaults: { baseURL?: string } } };

mock.method(
  NoBookEndsSyncAPI.prototype,
  'queueAlignment',
  async function (
    this: ClientThis,
    { audioItemId, ebookItemId }: NoBookEndsSyncPairInput,
    { priority, source }: { priority: string; source: string }
  ) {
    calls.push({
      url: this.axios.defaults.baseURL ?? '',
      pair: [audioItemId, ebookItemId],
      priority,
      source,
    });

    if (failing) {
      throw failing;
    }

    return { audioItemId, ebookItemId, status: 'queued' };
  }
);
mock.method(
  NoBookEndsSyncAPI.prototype,
  'queueAlignments',
  async function (
    this: ClientThis,
    pairs: NoBookEndsSyncPairInput[],
    { priority, source }: { priority: string; source: string }
  ) {
    bulkCalls.push({ pairs: pairs.length, priority, source });

    if (bulkError) {
      throw bulkError;
    }

    const results = pairs.map(({ audioItemId, ebookItemId }) => {
      const reason = bulkReject[audioItemId];

      return reason
        ? { audioItemId, ebookItemId, ok: false, reason }
        : {
            audioItemId,
            ebookItemId,
            ok: true,
            status: 'queued',
            priority: 0,
            waitingForWindow: true,
          };
    });

    return {
      accepted: results.filter(({ ok }) => ok).length,
      rejected: results.filter(({ ok }) => !ok).length,
      results,
    };
  }
);

setupTestDb();

const enableSync = () => {
  getSettings().nobookendsSync = {
    enabled: true,
    url: 'https://sync.example.com',
    internalUrl: 'http://192.168.1.20:8000',
    adminToken: 'admin-token',
  };
};

beforeEach(() => {
  calls = [];
  bulkCalls = [];
  failing = undefined;
  bulkReject = {};
  bulkError = undefined;
  resetNoBookEndsSyncState();
  getSettings().nobookendsSync = {
    enabled: false,
    url: '',
    internalUrl: '',
    adminToken: '',
  };
});

const saveBook = (extra: Partial<Media> = {}) =>
  getRepository(Media).save(
    new Media({
      olId: 'OL1234567W',
      mediaType: MediaType.BOOK,
      status: MediaStatus.AVAILABLE,
      statusAudio: MediaStatus.AVAILABLE,
      ...extra,
    })
  );

describe('getNoBookEndsSyncTarget', () => {
  it('prefers the internal address and needs the admin token', () => {
    assert.deepStrictEqual(
      getNoBookEndsSyncTarget({
        enabled: true,
        url: 'https://sync.example.com/',
        internalUrl: 'http://192.168.1.20:8000/',
        adminToken: 'token',
      }),
      { url: 'http://192.168.1.20:8000', adminToken: 'token' }
    );
    assert.deepStrictEqual(
      getNoBookEndsSyncTarget({
        enabled: true,
        url: 'https://sync.example.com',
        internalUrl: '',
        adminToken: 'token',
      }),
      { url: 'https://sync.example.com', adminToken: 'token' }
    );
    assert.strictEqual(
      getNoBookEndsSyncTarget({
        enabled: true,
        url: 'https://sync.example.com',
        adminToken: '',
      }),
      null
    );
    assert.strictEqual(
      getNoBookEndsSyncTarget({
        enabled: false,
        url: 'https://sync.example.com',
        adminToken: 'token',
      }),
      null
    );
  });
});

describe('getNoBookEndsSyncPair', () => {
  it('needs both an audiobook and an ebook item', () => {
    assert.deepStrictEqual(
      getNoBookEndsSyncPair({
        absAudiobookItemId: AUDIO_ITEM,
        absEbookItemId: EBOOK_ITEM,
      }),
      { audioItemId: AUDIO_ITEM, ebookItemId: EBOOK_ITEM }
    );
    assert.strictEqual(
      getNoBookEndsSyncPair({
        absAudiobookItemId: AUDIO_ITEM,
        absEbookItemId: null,
      }),
      null
    );
    assert.strictEqual(
      getNoBookEndsSyncPair({
        absAudiobookItemId: undefined,
        absEbookItemId: EBOOK_ITEM,
      }),
      null
    );
  });
});

describe('queueing when a book gets both formats', () => {
  it('queues the pair once the second item is found', async () => {
    enableSync();
    const media = await saveBook();

    await rememberAudiobookshelfItemIds(media, { audiobook: AUDIO_ITEM });
    await settleTestBackgroundTasks();
    assert.strictEqual(calls.length, 0);

    await rememberAudiobookshelfItemIds(media, { ebook: EBOOK_ITEM });
    await settleTestBackgroundTasks();

    // Like a reader's request, so it is not held for the overnight window
    assert.deepStrictEqual(calls, [
      {
        url: 'http://192.168.1.20:8000',
        pair: [AUDIO_ITEM, EBOOK_ITEM],
        priority: 'user',
        source: 'allseerr',
      },
    ]);
  });

  it('does not queue a pair twice', async () => {
    enableSync();
    const media = await saveBook();

    await rememberAudiobookshelfItemIds(media, {
      audiobook: AUDIO_ITEM,
      ebook: EBOOK_ITEM,
    });
    await settleTestBackgroundTasks();
    // Nothing changed, so nothing is sent
    await rememberAudiobookshelfItemIds(media, {
      audiobook: AUDIO_ITEM,
      ebook: EBOOK_ITEM,
    });
    // A second book page with the same pair is not sent again either
    const other = await saveBook({ olId: 'OL7654321W' });
    await rememberAudiobookshelfItemIds(other, {
      audiobook: AUDIO_ITEM,
      ebook: EBOOK_ITEM,
    });
    await settleTestBackgroundTasks();

    assert.strictEqual(calls.length, 1);
  });

  it('shares one request between calls for a pair on its way', async () => {
    enableSync();
    const pair = { audioItemId: AUDIO_ITEM, ebookItemId: EBOOK_ITEM };

    const results = await Promise.all([
      queueNoBookEndsSyncPair(pair),
      queueNoBookEndsSyncPair(pair),
    ]);

    assert.deepStrictEqual(results, ['queued', 'queued']);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(await queueNoBookEndsSyncPair(pair), 'skipped');
    assert.strictEqual(calls.length, 1);
  });

  it('queues a new pair when an item changes', async () => {
    enableSync();
    const media = await saveBook();

    await rememberAudiobookshelfItemIds(media, {
      audiobook: AUDIO_ITEM,
      ebook: EBOOK_ITEM,
    });
    await rememberAudiobookshelfItemIds(media, { ebook: 'li_ebook0002' });
    await settleTestBackgroundTasks();

    assert.deepStrictEqual(
      calls.map(({ pair }) => pair),
      [
        [AUDIO_ITEM, EBOOK_ITEM],
        [AUDIO_ITEM, 'li_ebook0002'],
      ]
    );
  });

  it('does nothing while disabled or without an admin token', async () => {
    const media = await saveBook();
    await rememberAudiobookshelfItemIds(media, {
      audiobook: AUDIO_ITEM,
      ebook: EBOOK_ITEM,
    });

    getSettings().nobookendsSync = {
      enabled: true,
      url: 'https://sync.example.com',
      adminToken: '',
    };
    const other = await saveBook({ olId: 'OL7654321W' });
    await rememberAudiobookshelfItemIds(other, {
      audiobook: 'li_audio0002',
      ebook: 'li_ebook0002',
    });
    await settleTestBackgroundTasks();

    assert.strictEqual(calls.length, 0);
  });

  it('tries a pair again later when the Sync server does not take it', async () => {
    enableSync();
    failing = new Error('ECONNREFUSED');
    mock.timers.enable({ apis: ['setTimeout'] });

    try {
      const pair = { audioItemId: AUDIO_ITEM, ebookItemId: EBOOK_ITEM };
      assert.strictEqual(await queueNoBookEndsSyncPair(pair), 'failed');
      assert.strictEqual(calls.length, 1);

      // Audiobookshelf being down on the Sync server's side is retried too
      failing = syncError(502, 'abs_unavailable');
      mock.timers.tick(RETRY_DELAYS_MS[0]);
      await settleTestBackgroundTasks();
      assert.strictEqual(calls.length, 2);

      failing = undefined;
      mock.timers.tick(RETRY_DELAYS_MS[1]);
      await settleTestBackgroundTasks();
      assert.strictEqual(calls.length, 3);
      assert.strictEqual(calls[2].priority, 'user');

      // Taken now, so it is not sent again
      assert.strictEqual(await queueNoBookEndsSyncPair(pair), 'skipped');
      mock.timers.tick(RETRY_DELAYS_MS[2]);
      await settleTestBackgroundTasks();
      assert.strictEqual(calls.length, 3);
    } finally {
      mock.timers.reset();
    }
  });

  it('does not retry a pair the Sync server refuses for good', async () => {
    enableSync();
    mock.timers.enable({ apis: ['setTimeout'] });

    try {
      for (const [status, reason] of [
        [422, 'no_epub'],
        [422, 'no_audio'],
        [404, 'not_found'],
        [422, 'not_found'],
      ] as const) {
        resetNoBookEndsSyncState();
        calls = [];
        failing = syncError(status, reason);
        const pair = { audioItemId: AUDIO_ITEM, ebookItemId: EBOOK_ITEM };

        assert.strictEqual(await queueNoBookEndsSyncPair(pair), 'rejected');
        mock.timers.tick(RETRY_DELAYS_MS[0]);
        await settleTestBackgroundTasks();
        assert.strictEqual(calls.length, 1, reason);

        // Nor sent again on the next change, only by a backfill
        assert.strictEqual(await queueNoBookEndsSyncPair(pair), 'skipped');
        assert.strictEqual(calls.length, 1, reason);
      }
    } finally {
      mock.timers.reset();
    }
  });
});

describe('backfillNoBookEndsSync', () => {
  it('queues every book with both items in the background, even ones queued before', async () => {
    enableSync();
    await saveBook({
      absAudiobookItemId: AUDIO_ITEM,
      absEbookItemId: EBOOK_ITEM,
    });
    await saveBook({
      olId: 'OL2222222W',
      absAudiobookItemId: 'li_audio0002',
      absEbookItemId: 'li_ebook0002',
    });
    await saveBook({ olId: 'OL3333333W', absAudiobookItemId: 'li_audio0003' });
    await saveBook({ olId: 'OL4444444W', absEbookItemId: 'li_ebook0004' });
    await queueNoBookEndsSyncPair({
      audioItemId: AUDIO_ITEM,
      ebookItemId: EBOOK_ITEM,
    });
    calls = [];

    const result = await backfillNoBookEndsSync();

    assert.deepStrictEqual(result, {
      total: 2,
      accepted: 2,
      rejected: 0,
      failed: 0,
    });
    assert.deepStrictEqual(bulkCalls, [
      { pairs: 2, priority: 'auto', source: 'allseerr-backfill' },
    ]);
    assert.strictEqual(calls.length, 0);
  });

  it('sends at most 500 pairs per call', async () => {
    enableSync();
    await getRepository(Media).save(
      Array.from(
        { length: 501 },
        (_, i) =>
          new Media({
            olId: `OL${1000000 + i}W`,
            mediaType: MediaType.BOOK,
            status: MediaStatus.AVAILABLE,
            statusAudio: MediaStatus.AVAILABLE,
            absAudiobookItemId: `li_audio${i}`,
            absEbookItemId: `li_ebook${i}`,
          })
      )
    );

    const result = await backfillNoBookEndsSync();

    assert.strictEqual(result.accepted, 501);
    assert.deepStrictEqual(
      bulkCalls.map(({ pairs }) => pairs),
      [500, 1]
    );
  });

  it('counts refused pairs and retries the ones that may pass', async () => {
    enableSync();
    await saveBook({
      absAudiobookItemId: AUDIO_ITEM,
      absEbookItemId: EBOOK_ITEM,
    });
    await saveBook({
      olId: 'OL2222222W',
      absAudiobookItemId: 'li_audio0002',
      absEbookItemId: 'li_ebook0002',
    });
    await saveBook({
      olId: 'OL3333333W',
      absAudiobookItemId: 'li_audio0003',
      absEbookItemId: 'li_ebook0003',
    });
    bulkReject = {
      li_audio0002: 'no_epub',
      li_audio0003: 'abs_unavailable',
    };
    mock.timers.enable({ apis: ['setTimeout'] });

    try {
      assert.deepStrictEqual(await backfillNoBookEndsSync(), {
        total: 3,
        accepted: 1,
        rejected: 1,
        failed: 1,
      });

      mock.timers.tick(RETRY_DELAYS_MS[0]);
      await settleTestBackgroundTasks();
      // Only the pair Audiobookshelf could not check, still in the background
      assert.deepStrictEqual(calls, [
        {
          url: 'http://192.168.1.20:8000',
          pair: ['li_audio0003', 'li_ebook0003'],
          priority: 'auto',
          source: 'allseerr-backfill',
        },
      ]);
    } finally {
      mock.timers.reset();
    }
  });

  it('counts a chunk the Sync server did not take as failed', async () => {
    enableSync();
    bulkError = syncError(502, 'abs_auth');
    await saveBook({
      absAudiobookItemId: AUDIO_ITEM,
      absEbookItemId: EBOOK_ITEM,
    });

    assert.deepStrictEqual(await backfillNoBookEndsSync(), {
      total: 1,
      accepted: 0,
      rejected: 0,
      failed: 1,
    });
    resetNoBookEndsSyncState();
  });

  it('sends pairs one by one to a Sync server without bulk calls', async () => {
    enableSync();
    // FastAPI's own validation error, without a reason
    bulkError = syncError(422);
    await saveBook({
      absAudiobookItemId: AUDIO_ITEM,
      absEbookItemId: EBOOK_ITEM,
    });

    assert.deepStrictEqual(await backfillNoBookEndsSync(), {
      total: 1,
      accepted: 1,
      rejected: 0,
      failed: 0,
    });
    assert.deepStrictEqual(
      calls.map(({ priority }) => priority),
      ['auto']
    );
  });

  it('does nothing while disabled', async () => {
    await saveBook({
      absAudiobookItemId: AUDIO_ITEM,
      absEbookItemId: EBOOK_ITEM,
    });

    assert.deepStrictEqual(await backfillNoBookEndsSync(), {
      total: 0,
      accepted: 0,
      rejected: 0,
      failed: 0,
    });
    assert.strictEqual(calls.length + bulkCalls.length, 0);
  });
});
