import type { ChaptarrQueueItem } from '@server/api/servarr/chaptarr';
import ChaptarrAPI from '@server/api/servarr/chaptarr';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaRequest from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import downloadTracker from '@server/lib/downloadtracker';
import notificationManager, { Notification } from '@server/lib/notifications';
import type { NotificationPayload } from '@server/lib/notifications/agents/agent';
import type { ChaptarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import {
  buildStuckBookNotification,
  checkStuckBookDownloads,
  getActiveRequesters,
  getChaptarrQueueUrl,
  stuckDownloadMonitor,
} from '@server/lib/stuckBookDownloads';
import { STUCK_GRACE_MS } from '@server/lib/stuckDownloads';
import { setupTestDb } from '@server/test/db';
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

const authors: Record<number, string> = {
  7: 'Jane Example',
  8: 'Sam Sample',
};
const getAuthorCalls: number[] = [];
mock.method(ChaptarrAPI.prototype, 'getAuthor', async (authorId: number) => {
  getAuthorCalls.push(authorId);
  if (!authors[authorId]) {
    throw new Error('Request failed with status code 404');
  }
  return { id: authorId, authorName: authors[authorId], foreignAuthorId: '' };
});

let queue: ChaptarrQueueItem[] = [];
mock.method(ChaptarrAPI.prototype, 'refreshMonitoredDownloads', async () => {
  // Nothing to refresh in tests
});
mock.method(ChaptarrAPI.prototype, 'getBookQueue', async () => queue);
mock.method(MediaRequest, 'sendNotification', async () => undefined);

const sendNotificationMock = mock.method(
  notificationManager,
  'sendNotification',
  () => undefined
).mock;

const stuckNotifications = () =>
  sendNotificationMock.calls
    .filter(
      (call) => call.arguments[0] === Notification.DOWNLOAD_NEEDS_ATTENTION
    )
    .map((call) => call.arguments[1] as NotificationPayload);

setupTestDb();

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

const START = Date.parse('2026-10-11T09:00:00Z');

const chaptarr = () =>
  new ChaptarrAPI({ apiKey: 'test-key', url: 'http://chaptarr:8789/api/v1' });

// The audiobook of The Lantern Keeper, requested by the demo user
const seedLanternKeeper = async () => {
  const media = await getRepository(Media).save(
    new Media({
      mediaType: MediaType.BOOK,
      olId: 'OL900001W',
      status: MediaStatus.UNKNOWN,
      statusAudio: MediaStatus.PROCESSING,
      serviceId: 0,
      externalServiceIdAudio: 501,
    })
  );
  const userRepository = getRepository(User);
  const demo = await userRepository.findOneOrFail({
    where: { email: 'demo@seerr.dev' },
  });
  const admin = await userRepository.findOneOrFail({
    where: { email: 'admin@seerr.dev' },
  });

  // Saved without Chaptarr set up, so they are not sent there
  getSettings().chaptarr = [];
  await getRepository(MediaRequest).save([
    new MediaRequest({
      type: MediaType.BOOK,
      status: MediaRequestStatus.APPROVED,
      media,
      requestedBy: demo,
      isAudiobook: true,
    }),
    // The ebook is not the one stuck
    new MediaRequest({
      type: MediaType.BOOK,
      status: MediaRequestStatus.APPROVED,
      media,
      requestedBy: admin,
      isAudiobook: false,
    }),
  ]);
  getSettings().chaptarr = [server];

  return { media, demo };
};

describe('buildStuckBookNotification', () => {
  it('names the book, format, author and reason, and links to the book', () => {
    const media = new Media({ mediaType: MediaType.BOOK, olId: 'OL1W' });
    const payload = buildStuckBookNotification({
      title: 'The Lantern Keeper',
      format: 'audiobook',
      authorName: 'Jane Example',
      statusMessage: 'No supported audio or ebook files were found in /books',
      media,
      requesters: ['friend', 'neighbor'],
      queueUrl: 'http://chaptarr:8789/activity/queue',
    });

    assert.equal(payload.event, 'Book Download Needs Attention');
    assert.equal(payload.subject, 'The Lantern Keeper (Audiobook)');
    assert.equal(
      payload.message,
      'The Lantern Keeper (Audiobook) by Jane Example: No supported audio or ebook files were found in /books'
    );
    assert.equal(payload.media, media);
    assert.equal(payload.externalLink, undefined);
    assert.deepEqual(payload.extra, [
      { name: 'Requested By', value: 'friend, neighbor' },
    ]);
    assert.equal(payload.notifyAdmin, true);
    assert.equal(payload.notifySystem, true);
    assert.equal(payload.notifyUser, undefined);
  });

  it('links to the Chaptarr queue when the book is not known', () => {
    const payload = buildStuckBookNotification({
      title: 'A Field of Paper Birds',
      format: 'ebook',
      statusMessage: 'Rejected: import matched another book',
      requesters: [],
      queueUrl: 'https://chaptarr.example.com/activity/queue',
    });

    assert.equal(
      payload.message,
      'A Field of Paper Birds (Ebook): Rejected: import matched another book'
    );
    assert.equal(payload.media, undefined);
    assert.deepEqual(payload.externalLink, {
      url: 'https://chaptarr.example.com/activity/queue',
      title: 'Open Chaptarr',
    });
    assert.equal(payload.extra, undefined);
  });

  it('trims long reasons to about 300 characters', () => {
    const payload = buildStuckBookNotification({
      title: 'Quiet Harbor',
      statusMessage: `Rejected:\n${'word '.repeat(200)}`,
      requesters: [],
    });
    const reason = (payload.message ?? '').replace('Quiet Harbor: ', '');

    assert.ok(reason.length <= 300);
    assert.ok(reason.endsWith('...'));
    assert.ok(!reason.includes('\n'));
  });

  it('does not link to a book page without a work id', () => {
    const payload = buildStuckBookNotification({
      title: 'Quiet Harbor',
      media: new Media({ mediaType: MediaType.BOOK }),
      requesters: [],
      queueUrl: 'http://chaptarr:8789/activity/queue',
    });

    assert.equal(payload.media, undefined);
    assert.equal(
      payload.externalLink?.url,
      'http://chaptarr:8789/activity/queue'
    );
    assert.equal(
      payload.message,
      'Quiet Harbor: Chaptarr cannot finish this download.'
    );
  });
});

describe('getChaptarrQueueUrl', () => {
  it('prefers the external address', () => {
    assert.equal(
      getChaptarrQueueUrl(server),
      'http://chaptarr:8789/activity/queue'
    );
    assert.equal(
      getChaptarrQueueUrl({
        ...server,
        externalUrl: 'https://chaptarr.example.com/',
      }),
      'https://chaptarr.example.com/activity/queue'
    );
  });
});

describe('getActiveRequesters', () => {
  it('lists who is still waiting for that format', () => {
    const request = (init: Partial<MediaRequest>) =>
      ({
        status: MediaRequestStatus.APPROVED,
        isAudiobook: false,
        requestedBy: { displayName: 'friend' },
        ...init,
      }) as MediaRequest;
    const media = new Media({ mediaType: MediaType.BOOK });
    media.requests = [
      request({}),
      request({ status: MediaRequestStatus.PENDING }),
      request({ requestedBy: { displayName: 'neighbor' } as User }),
      request({
        status: MediaRequestStatus.COMPLETED,
        requestedBy: { displayName: 'done' } as User,
      }),
      request({
        isAudiobook: true,
        requestedBy: { displayName: 'listener' } as User,
      }),
    ];

    assert.deepEqual(getActiveRequesters(media, 'ebook'), [
      'friend',
      'neighbor',
    ]);
    assert.deepEqual(getActiveRequesters(media, 'audiobook'), ['listener']);
    assert.deepEqual(getActiveRequesters(undefined, 'ebook'), []);
  });
});

describe('checkStuckBookDownloads', () => {
  beforeEach(() => {
    stuckDownloadMonitor.reset();
    sendNotificationMock.resetCalls();
    getAuthorCalls.length = 0;
    getSettings().chaptarr = [server];
    getSettings().main.bookService = 'chaptarr';
    getSettings().main.applicationUrl = 'https://allseerr.example.com';
  });

  afterEach(async () => {
    getSettings().chaptarr = [];
    await downloadTracker.resetDownloadTracker();
  });

  it('tells admins once about each download stuck past the grace period', async () => {
    const { demo } = await seedLanternKeeper();
    const items = readQueue('queue-stuck.json');

    await checkStuckBookDownloads(server, [0], chaptarr(), items, START);
    assert.deepEqual(stuckNotifications(), []);

    await checkStuckBookDownloads(
      server,
      [0],
      chaptarr(),
      items,
      START + STUCK_GRACE_MS
    );

    const sent = stuckNotifications();
    assert.equal(sent.length, 2);

    const [lantern, birds] = sent;
    assert.equal(lantern.subject, 'The Lantern Keeper (Audiobook)');
    assert.equal(
      lantern.message,
      'The Lantern Keeper (Audiobook) by Jane Example: No supported audio or ebook files were found in /downloads/complete/books/Jane.Example.The.Lantern.Keeper.Unabridged.M4B'
    );
    assert.equal(lantern.media?.olId, 'OL900001W');
    assert.equal(lantern.externalLink, undefined);
    assert.deepEqual(lantern.extra, [
      { name: 'Requested By', value: demo.displayName },
    ]);

    // Not in the app, so it links to Chaptarr
    assert.equal(birds.subject, 'A Field of Paper Birds (Ebook)');
    assert.equal(
      birds.message,
      "A Field of Paper Birds (Ebook) by Sam Sample: Rejected: Completed download was grabbed for 'A Field of Paper Birds' but import matched 'A Field of Paper Kites'"
    );
    assert.equal(birds.media, undefined);
    assert.equal(
      birds.externalLink?.url,
      'http://chaptarr:8789/activity/queue'
    );

    // The healthy download is never looked at
    assert.deepEqual(getAuthorCalls.sort(), [7, 8]);

    await checkStuckBookDownloads(
      server,
      [0],
      chaptarr(),
      items,
      START + 3 * STUCK_GRACE_MS
    );
    assert.equal(stuckNotifications().length, 2);
  });

  it('still sends when the author cannot be looked up', async () => {
    const [item] = readQueue('queue-stuck.json');
    const orphan = { ...item, authorId: 999, bookId: 999 };

    await checkStuckBookDownloads(server, [0], chaptarr(), [orphan], START);
    await checkStuckBookDownloads(
      server,
      [0],
      chaptarr(),
      [orphan],
      START + STUCK_GRACE_MS
    );

    const [sent] = stuckNotifications();
    assert.equal(
      sent.message,
      'The Lantern Keeper (Audiobook): No supported audio or ebook files were found in /downloads/complete/books/Jane.Example.The.Lantern.Keeper.Unabridged.M4B'
    );
  });

  it('runs as part of the download tracker', async () => {
    queue = readQueue('queue-stuck.json');

    // First seen now, so nothing is sent yet
    await downloadTracker.updateChaptarrDownloads();
    assert.deepEqual(stuckNotifications(), []);
    assert.equal(
      downloadTracker.getBookProgress(0, 501, 'audiobook').length,
      1
    );
  });
});
