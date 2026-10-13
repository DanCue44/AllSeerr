import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

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

const AUDIO_ITEM = 'li_audio0001';
const EBOOK_ITEM = 'li_ebook0001';

// Calls the Sync server received, and whether it takes them
let calls: { url: string; pair: [string, string] }[] = [];
let failing = false;

mock.method(
  NoBookEndsSyncAPI.prototype,
  'queueAlignment',
  async function (
    this: { axios: { defaults: { baseURL?: string } } },
    audioItemId: string,
    ebookItemId: string
  ) {
    calls.push({
      url: this.axios.defaults.baseURL ?? '',
      pair: [audioItemId, ebookItemId],
    });

    if (failing) {
      throw new Error('ECONNREFUSED');
    }

    return { audioItemId, ebookItemId, status: 'queued' };
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
  failing = false;
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

    assert.deepStrictEqual(calls, [
      { url: 'http://192.168.1.20:8000', pair: [AUDIO_ITEM, EBOOK_ITEM] },
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
    failing = true;
    mock.timers.enable({ apis: ['setTimeout'] });

    try {
      const pair = { audioItemId: AUDIO_ITEM, ebookItemId: EBOOK_ITEM };
      assert.strictEqual(await queueNoBookEndsSyncPair(pair), 'failed');
      assert.strictEqual(calls.length, 1);

      failing = false;
      mock.timers.tick(RETRY_DELAYS_MS[0]);
      await settleTestBackgroundTasks();

      assert.strictEqual(calls.length, 2);
      // Taken now, so it is not sent again
      assert.strictEqual(await queueNoBookEndsSyncPair(pair), 'skipped');
      mock.timers.tick(RETRY_DELAYS_MS[1]);
      await settleTestBackgroundTasks();
      assert.strictEqual(calls.length, 2);
    } finally {
      mock.timers.reset();
    }
  });
});

describe('backfillNoBookEndsSync', () => {
  it('queues every book with both items, even ones queued before', async () => {
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

    assert.deepStrictEqual(result, { total: 2, queued: 2, failed: 0 });
    assert.deepStrictEqual(calls.map(({ pair }) => pair).sort(), [
      [AUDIO_ITEM, EBOOK_ITEM],
      ['li_audio0002', 'li_ebook0002'],
    ]);
  });

  it('counts pairs the Sync server did not take', async () => {
    enableSync();
    failing = true;
    await saveBook({
      absAudiobookItemId: AUDIO_ITEM,
      absEbookItemId: EBOOK_ITEM,
    });

    assert.deepStrictEqual(await backfillNoBookEndsSync(), {
      total: 1,
      queued: 0,
      failed: 1,
    });
    resetNoBookEndsSyncState();
  });

  it('does nothing while disabled', async () => {
    await saveBook({
      absAudiobookItemId: AUDIO_ITEM,
      absEbookItemId: EBOOK_ITEM,
    });

    assert.deepStrictEqual(await backfillNoBookEndsSync(), {
      total: 0,
      queued: 0,
      failed: 0,
    });
    assert.strictEqual(calls.length, 0);
  });
});
