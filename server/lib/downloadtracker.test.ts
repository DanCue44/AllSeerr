import type { ChaptarrQueueItem } from '@server/api/servarr/chaptarr';
import ChaptarrAPI from '@server/api/servarr/chaptarr';
import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import downloadTracker, { mapChaptarrQueue } from '@server/lib/downloadtracker';
import type { ChaptarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

const readQueue = (name: string): ChaptarrQueueItem[] =>
  JSON.parse(
    readFileSync(
      path.join(__dirname, '../api/servarr/fixtures/chaptarr', name),
      'utf8'
    )
  ).records;

let queue: ChaptarrQueueItem[] = [];
let queueError: Error | undefined;
mock.method(ChaptarrAPI.prototype, 'refreshMonitoredDownloads', async () => {
  if (queueError) {
    throw queueError;
  }
});
mock.method(ChaptarrAPI.prototype, 'getBookQueue', async () => queue);

const server: ChaptarrSettings = {
  id: 0,
  name: 'Chaptarr',
  hostname: 'chaptarr',
  port: 8789,
  apiKey: 'test-key',
  useSsl: false,
  activeProfileId: 1,
  activeProfileName: 'E-Book',
  activeDirectory: '/ebooks',
  activeMetadataProfileId: 2,
  activeMetadataProfileName: 'Ebook Default',
  tags: [],
  is4k: false,
  isDefault: true,
  syncEnabled: true,
  preventSearch: false,
  tagRequests: false,
  overrideRule: [],
};

const bookMedia = (init: Partial<Media>): Media => {
  const media = new Media({
    mediaType: MediaType.BOOK,
    olId: 'OL1W',
    serviceId: 0,
    ...init,
  });
  media.getDownloadingItem();
  return media;
};

describe('mapChaptarrQueue', () => {
  it('keys downloads on their book and keeps their format', () => {
    const items = mapChaptarrQueue(readQueue('queue.json'));

    // The download of no known book is left out
    assert.strictEqual(items.length, 2);
    assert.deepStrictEqual(items[0], {
      externalId: 3091,
      estimatedCompletionTime: new Date('2026-10-10T19:42:12Z'),
      mediaType: MediaType.BOOK,
      size: 2097152,
      sizeLeft: 524288,
      status: 'downloading',
      timeLeft: '00:00:12',
      title: 'John.Grisham.The.Pelican.Brief.RETAiL.ePub.eBOOK-DECiPHER',
      downloadId: 'DFEDCB04E7134B218F4BEAAA578446CF',
      bookFormat: 'ebook',
    });
    assert.strictEqual(items[1].externalId, 2);
    assert.strictEqual(items[1].bookFormat, 'audiobook');
  });

  it('maps an empty queue to no downloads', () => {
    assert.deepStrictEqual(mapChaptarrQueue(readQueue('queue-empty.json')), []);
  });

  it('leaves the format out for Readarr, which has none', () => {
    const [item] = mapChaptarrQueue([
      { ...readQueue('queue.json')[0], book: undefined },
    ]);

    assert.strictEqual(item.bookFormat, undefined);
  });
});

describe('Chaptarr download tracking', () => {
  beforeEach(async () => {
    queue = readQueue('queue.json');
    queueError = undefined;
    getSettings().chaptarr = [server];
    getSettings().main.bookService = 'chaptarr';
    await downloadTracker.resetDownloadTracker();
  });

  afterEach(async () => {
    getSettings().chaptarr = [];
    await downloadTracker.resetDownloadTracker();
  });

  it('gives each format of a book its own downloads', async () => {
    await downloadTracker.updateChaptarrDownloads();

    const ebook = bookMedia({ externalServiceId: 3091 });
    assert.strictEqual(ebook.downloadStatus?.length, 1);
    assert.strictEqual(ebook.downloadStatus?.[0].bookFormat, 'ebook');
    assert.deepStrictEqual(ebook.downloadStatusAudio, []);

    const audiobook = bookMedia({
      externalServiceId: 3091,
      externalServiceIdAudio: 2,
    });
    assert.strictEqual(audiobook.downloadStatus?.length, 1);
    assert.strictEqual(audiobook.downloadStatusAudio?.length, 1);
    assert.strictEqual(audiobook.downloadStatusAudio?.[0].sizeLeft, 393216000);
  });

  it('does not show a download of one format on the other', async () => {
    await downloadTracker.updateChaptarrDownloads();

    // A stale link to the ebook's book on the audiobook side
    assert.deepStrictEqual(
      downloadTracker.getBookProgress(0, 3091, 'audiobook'),
      []
    );
    assert.strictEqual(
      downloadTracker.getBookProgress(0, 3091, 'ebook').length,
      1
    );
  });

  it('shows nothing while Chaptarr cannot be reached', async () => {
    queueError = new Error('connect ECONNREFUSED');

    await downloadTracker.updateChaptarrDownloads();

    assert.deepStrictEqual(
      downloadTracker.getBookProgress(0, 3091, 'ebook'),
      []
    );
  });

  it('leaves Chaptarr alone when books go to LazyLibrarian', async () => {
    getSettings().main.bookService = 'lazylibrarian';
    getSettings().lazylibrarian = {
      ...getSettings().lazylibrarian,
      hostname: 'lazylibrarian',
      apiKey: 'key',
    };

    await downloadTracker.updateChaptarrDownloads();

    assert.deepStrictEqual(
      downloadTracker.getBookProgress(0, 3091, 'ebook'),
      []
    );
  });
});
