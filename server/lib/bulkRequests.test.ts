import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import MusicBrainz from '@server/api/musicbrainz';
import type {
  MbArtist,
  MbBrowseReleaseGroupsResponse,
  MbReleaseGroup,
} from '@server/api/musicbrainz/interfaces';
import OpenLibrary from '@server/api/openlibrary';
import type {
  OlAuthor,
  OlSearchResponse,
} from '@server/api/openlibrary/interfaces';
import type { LidarrAlbum } from '@server/api/servarr/lidarr';
import LidarrAPI from '@server/api/servarr/lidarr';
import TheAudioDb from '@server/api/theaudiodb';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import {
  MediaRequest,
  QuotaRestrictedError,
  RequestPermissionError,
} from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { initI18n } from '@server/i18n';
import type { BulkRequestResponse } from '@server/interfaces/api/requestInterfaces';
import {
  BulkRequestError,
  monitorRetryDelay,
  requestAuthorCatalog,
  requestDiscography,
} from '@server/lib/bulkRequests';
import {
  MAX_BULK_REQUEST_ITEMS,
  getBulkSkipReason,
  getDiscographyType,
  getWorkKind,
} from '@server/lib/catalogFilters';
import notificationManager, { Notification } from '@server/lib/notifications';
import type { NotificationPayload } from '@server/lib/notifications/agents/agent';
import EmailAgent from '@server/lib/notifications/agents/email';
import WebhookAgent from '@server/lib/notifications/agents/webhook';
import WebPushAgent from '@server/lib/notifications/agents/webpush';
import { Permission } from '@server/lib/permissions';
import type { LidarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import authRoutes from '@server/routes/auth';
import requestRoutes from '@server/routes/request';
import { settleTestBackgroundTasks, setupTestDb } from '@server/test/db';
import express from 'express';
import session from 'express-session';
import request from 'supertest';

const ARTIST_ID = 'a74b1b7f-71a5-4011-9441-d0b5e4122711';
const AUTHOR_ID = 'OL34184A';

const albumId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const workId = (n: number) => `OL${n}W`;

// Per-request notifications, which a bulk request leaves out
const perRequestNotifications = mock.method(
  MediaRequest,
  'sendNotification',
  async () => undefined
).mock;

const summaryNotifications = mock.method(
  notificationManager,
  'sendNotification',
  () => undefined
).mock;

const getAlbumMock = mock.method(MusicBrainz.prototype, 'getAlbum', () => {
  throw new Error('A bulk request does not look albums up one at a time');
}).mock;
const getWorkMock = mock.method(OpenLibrary.prototype, 'getWork', () => {
  throw new Error('A bulk request does not look works up one at a time');
}).mock;

mock.method(
  MusicBrainz.prototype,
  'getArtist',
  async ({ artistId }: { artistId: string }) =>
    ({ id: artistId, name: 'Radiohead' }) as MbArtist
);

let releaseGroupCount = 6;

mock.method(
  MusicBrainz.prototype,
  'getArtistReleaseGroups',
  async ({ limit = 100, offset = 0 }: { limit?: number; offset?: number }) => {
    const releaseGroups: MbReleaseGroup[] = [];

    for (
      let n = offset + 1;
      n <= Math.min(offset + limit, releaseGroupCount);
      n++
    ) {
      releaseGroups.push({
        id: albumId(n),
        title: `Album ${n}`,
        'primary-type': 'Album',
      } as MbReleaseGroup);
    }

    return {
      'release-group-count': releaseGroupCount,
      'release-group-offset': offset,
      'release-groups': releaseGroups,
    } as MbBrowseReleaseGroupsResponse;
  }
);

mock.method(TheAudioDb.prototype, 'getArtistImages', async () => ({
  artistThumb: 'https://thumb',
  artistBackground: null,
}));

mock.method(
  OpenLibrary.prototype,
  'getAuthor',
  async (authorId: string): Promise<OlAuthor> => ({
    key: `/authors/${authorId}`,
    name: 'Roald Dahl',
    type: { key: '/type/author' },
  })
);

let workCount = 5;

mock.method(
  OpenLibrary.prototype,
  'getAuthorWorks',
  async ({
    page = 1,
    limit = 100,
  }: {
    page?: number;
    limit?: number;
  }): Promise<OlSearchResponse> => {
    const docs = [];

    for (
      let n = (page - 1) * limit + 1;
      n <= Math.min(page * limit, workCount);
      n++
    ) {
      docs.push({ key: `/works/${workId(n)}`, title: `Book ${n}` });
    }

    return { numFound: workCount, start: 0, docs } as OlSearchResponse;
  }
);

setupTestDb();

beforeEach(() => {
  releaseGroupCount = 6;
  workCount = 5;
  perRequestNotifications.resetCalls();
  summaryNotifications.resetCalls();
  getAlbumMock.resetCalls();
  getWorkMock.resetCalls();
});

afterEach(() => {
  getSettings().lidarr = [];
  getSettings().main.defaultQuotas.music = {};
  getSettings().main.defaultQuotas.book = {};
});

async function getUser(email: string): Promise<User> {
  return getRepository(User).findOneOrFail({ where: { email } });
}

async function createUser(
  email: string,
  permissions: number,
  quotas: Partial<Pick<User, 'musicQuotaLimit' | 'bookQuotaLimit'>> = {}
): Promise<User> {
  return getRepository(User).save(
    new User({ email, permissions, avatar: '', ...quotas })
  );
}

const ids = (items: BulkRequestResponse['created']) =>
  items.map((item) => item.mediaId);

/**
 * Notifications about new requests: pending and auto-approved
 */
const newRequestNotifications = (calls: { arguments: unknown[] }[]) =>
  calls.filter(
    (call) =>
      call.arguments[0] === Notification.MEDIA_PENDING ||
      call.arguments[0] === Notification.MEDIA_AUTO_APPROVED
  );

describe('requestDiscography', () => {
  it('requests the selected albums and skips existing and blocklisted ones', async () => {
    const admin = await getUser('admin@seerr.dev');
    const demo = await getUser('demo@seerr.dev');
    const mediaRepository = getRepository(Media);

    await mediaRepository.save(
      new Media({
        mbId: albumId(2),
        mediaType: MediaType.MUSIC,
        status: MediaStatus.AVAILABLE,
      })
    );
    await mediaRepository.save(
      new Media({
        mbId: albumId(3),
        mediaType: MediaType.MUSIC,
        status: MediaStatus.BLOCKLISTED,
      })
    );
    await MediaRequest.request(
      { mediaType: MediaType.MUSIC, mediaId: albumId(4) },
      demo,
      { skipMetadataLookup: true }
    );
    perRequestNotifications.resetCalls();

    const result = await requestDiscography(admin, {
      artistId: ARTIST_ID,
      mbIds: [
        albumId(1),
        albumId(2),
        albumId(3),
        albumId(4),
        albumId(5),
        albumId(99),
      ],
    });

    assert.deepStrictEqual(ids(result.created), [albumId(1), albumId(5)]);
    assert.deepStrictEqual(
      result.skipped.map((item) => [item.mediaId, item.reason]),
      [
        [albumId(2), 'available'],
        [albumId(3), 'blocklisted'],
        [albumId(4), 'requested'],
      ]
    );
    assert.deepStrictEqual(ids(result.failed), [albumId(99)]);
    assert.strictEqual(result.created[0].title, 'Album 1');
    assert.strictEqual(result.created[0].status, MediaRequestStatus.APPROVED);

    const requests = await getRepository(MediaRequest).find({
      where: { requestedBy: { id: admin.id } },
    });
    assert.strictEqual(requests.length, 2);
    assert.ok(requests.every((r) => r.type === MediaType.MUSIC));
    assert.strictEqual(getAlbumMock.callCount(), 0);
  });

  it('sends one summary notification instead of one per album', async () => {
    const demo = await getUser('demo@seerr.dev');

    const result = await requestDiscography(demo, {
      artistId: ARTIST_ID,
      mbIds: [albumId(1), albumId(2), albumId(3)],
    });

    assert.strictEqual(result.created.length, 3);
    assert.ok(
      result.created.every((item) => item.status === MediaRequestStatus.PENDING)
    );

    // Insert hooks run detached, wait for them
    await settleTestBackgroundTasks();

    assert.strictEqual(
      newRequestNotifications(perRequestNotifications.calls).length,
      0
    );
    const summaries = newRequestNotifications(summaryNotifications.calls);
    assert.strictEqual(summaries.length, 1);
    assert.strictEqual(summaries[0].arguments[0], Notification.MEDIA_PENDING);

    const payload = summaries[0].arguments[1] as NotificationPayload;
    assert.strictEqual(payload.subject, '3 albums by Radiohead');
    assert.strictEqual(payload.event, 'New Album Requests');
    assert.strictEqual(payload.actionPath, `/artist/${ARTIST_ID}`);
    assert.strictEqual(payload.image, 'https://thumb');
    assert.strictEqual(payload.notifyAdmin, true);
    assert.strictEqual(payload.request?.requestedBy.id, demo.id);
    assert.match(payload.message ?? '', /Album 1, Album 2, Album 3/);
  });

  it('sends no summary when nothing was requested', async () => {
    const admin = await getUser('admin@seerr.dev');
    await getRepository(Media).save(
      new Media({
        mbId: albumId(1),
        mediaType: MediaType.MUSIC,
        status: MediaStatus.AVAILABLE,
      })
    );

    const result = await requestDiscography(admin, {
      artistId: ARTIST_ID,
      mbIds: [albumId(1)],
    });

    assert.strictEqual(result.created.length, 0);
    assert.strictEqual(summaryNotifications.callCount(), 0);
  });

  it('requires a music request permission', async () => {
    const bookUser = await createUser(
      'books@seerr.dev',
      Permission.REQUEST_BOOK
    );
    const musicUser = await createUser(
      'music@seerr.dev',
      Permission.REQUEST_MUSIC
    );

    await assert.rejects(
      requestDiscography(bookUser, {
        artistId: ARTIST_ID,
        mbIds: [albumId(1)],
      }),
      RequestPermissionError
    );
    assert.strictEqual(await getRepository(MediaRequest).count(), 0);

    const result = await requestDiscography(musicUser, {
      artistId: ARTIST_ID,
      mbIds: [albumId(1)],
    });
    assert.strictEqual(result.created.length, 1);
  });

  it('refuses a request that needs more than the quota has left', async () => {
    const user = await createUser('quota@seerr.dev', Permission.REQUEST, {
      musicQuotaLimit: 2,
    });

    await assert.rejects(
      requestDiscography(user, {
        artistId: ARTIST_ID,
        mbIds: [albumId(1), albumId(2), albumId(3)],
      }),
      QuotaRestrictedError
    );
    assert.strictEqual(await getRepository(MediaRequest).count(), 0);

    // Albums that are skipped do not count
    await getRepository(Media).save(
      new Media({
        mbId: albumId(3),
        mediaType: MediaType.MUSIC,
        status: MediaStatus.AVAILABLE,
      })
    );
    const result = await requestDiscography(user, {
      artistId: ARTIST_ID,
      mbIds: [albumId(1), albumId(2), albumId(3)],
    });
    assert.strictEqual(result.created.length, 2);
    assert.strictEqual(result.skipped.length, 1);
  });

  it('lets a manager bypass the quota and nobody else', async () => {
    const manager = await createUser(
      'manager@seerr.dev',
      Permission.MANAGE_REQUESTS | Permission.REQUEST,
      { musicQuotaLimit: 1 }
    );
    const user = await createUser('user@seerr.dev', Permission.REQUEST, {
      musicQuotaLimit: 1,
    });

    await assert.rejects(
      requestDiscography(user, {
        artistId: ARTIST_ID,
        mbIds: [albumId(1)],
        ignoreQuota: true,
      }),
      RequestPermissionError
    );

    await assert.rejects(
      requestDiscography(manager, {
        artistId: ARTIST_ID,
        mbIds: [albumId(1), albumId(2), albumId(3)],
      }),
      QuotaRestrictedError
    );

    const result = await requestDiscography(manager, {
      artistId: ARTIST_ID,
      mbIds: [albumId(1), albumId(2), albumId(3)],
      ignoreQuota: true,
    });
    assert.strictEqual(result.created.length, 3);

    const requests = await getRepository(MediaRequest).find();
    assert.ok(requests.every((r) => r.ignoreQuota));
  });

  it('reports a failed album and requests the rest', async () => {
    const admin = await getUser('admin@seerr.dev');
    const original = MediaRequest.request;
    const requestMock = mock.method(
      MediaRequest,
      'request',
      (...args: Parameters<typeof MediaRequest.request>) => {
        if (args[0].mediaId === albumId(2)) {
          return Promise.reject(new Error('Database is on fire'));
        }
        return original.apply(MediaRequest, args);
      }
    );

    try {
      const result = await requestDiscography(admin, {
        artistId: ARTIST_ID,
        mbIds: [albumId(1), albumId(2), albumId(3)],
      });

      assert.deepStrictEqual(ids(result.created), [albumId(1), albumId(3)]);
      assert.deepStrictEqual(result.failed, [
        {
          mediaId: albumId(2),
          title: 'Album 2',
          reason: 'Database is on fire',
        },
      ]);
    } finally {
      requestMock.mock.restore();
    }
  });

  it('caps a single request', async () => {
    const admin = await getUser('admin@seerr.dev');
    releaseGroupCount = MAX_BULK_REQUEST_ITEMS + 1;

    await assert.rejects(
      requestDiscography(admin, {
        artistId: ARTIST_ID,
        mbIds: Array.from({ length: MAX_BULK_REQUEST_ITEMS + 1 }, (_, i) =>
          albumId(i + 1)
        ),
      }),
      (e: unknown) => e instanceof BulkRequestError && e.status === 400
    );
    assert.strictEqual(await getRepository(MediaRequest).count(), 0);
  });

  it('reads every page of the discography', async () => {
    const admin = await getUser('admin@seerr.dev');
    releaseGroupCount = 450;

    const result = await requestDiscography(admin, {
      artistId: ARTIST_ID,
      mbIds: [albumId(450)],
    });

    assert.deepStrictEqual(ids(result.created), [albumId(450)]);
  });

  it('only lets a manager monitor new releases', async () => {
    const demo = await getUser('demo@seerr.dev');

    await assert.rejects(
      requestDiscography(demo, {
        artistId: ARTIST_ID,
        mbIds: [albumId(1)],
        monitorNewReleases: true,
      }),
      RequestPermissionError
    );
  });
});

describe('discography requests in Lidarr', () => {
  function configureLidarr(): void {
    getSettings().lidarr = [
      {
        id: 0,
        name: 'Lidarr',
        hostname: 'localhost',
        port: 8686,
        apiKey: 'test-key',
        useSsl: false,
        baseUrl: '',
        activeProfileId: 1,
        activeProfileName: 'Lossless',
        activeDirectory: '/music',
        activeMetadataProfileId: 2,
        activeMetadataProfileName: 'Standard',
        tags: [],
        is4k: false,
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
        tagRequests: false,
        overrideRule: [],
      } as unknown as LidarrSettings,
    ];
  }

  async function waitFor(check: () => boolean) {
    await settleTestBackgroundTasks();
    for (let i = 0; i < 100; i++) {
      if (check()) {
        await settleTestBackgroundTasks();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail('Condition was not met in time');
  }

  it('sends albums one at a time, then monitors new releases', async () => {
    configureLidarr();
    const admin = await getUser('admin@seerr.dev');
    const events: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    const addAlbum = mock.method(
      LidarrAPI.prototype,
      'addAlbum',
      async (options: { foreignAlbumId: string }) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push(`add:${options.foreignAlbumId}`);
        inFlight--;
        return {
          id: 1,
          foreignAlbumId: options.foreignAlbumId,
        } as LidarrAlbum;
      }
    );
    const monitor = mock.method(
      LidarrAPI.prototype,
      'monitorNewArtistReleases',
      async (artistId: string) => {
        // Like Lidarr, the artist only exists once an album has added it
        if (!events.some((event) => event.startsWith('add:'))) {
          return false;
        }
        events.push(`monitor:${artistId}`);
        return true;
      }
    );
    const retryDelay = monitorRetryDelay.ms;
    monitorRetryDelay.ms = 5;

    try {
      const result = await requestDiscography(admin, {
        artistId: ARTIST_ID,
        mbIds: [albumId(1), albumId(2), albumId(3)],
        monitorNewReleases: true,
      });

      assert.strictEqual(result.created.length, 3);
      assert.strictEqual(result.monitorNewReleases, true);

      await waitFor(() => events.length === 4);

      assert.strictEqual(maxInFlight, 1);
      // The albums go one at a time in order; monitoring waits until the
      // first add has put the artist in Lidarr
      assert.deepStrictEqual(
        events.filter((event) => event.startsWith('add:')),
        [`add:${albumId(1)}`, `add:${albumId(2)}`, `add:${albumId(3)}`]
      );
      assert.ok(
        events.indexOf(`monitor:${ARTIST_ID}`) >
          events.indexOf(`add:${albumId(1)}`)
      );
    } finally {
      monitorRetryDelay.ms = retryDelay;
      addAlbum.mock.restore();
      monitor.mock.restore();
    }
  });
});

describe('requestAuthorCatalog', () => {
  it('requests each work in each format and skips existing ones', async () => {
    const admin = await getUser('admin@seerr.dev');
    await getRepository(Media).save(
      new Media({
        olId: workId(1),
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
        statusAudio: MediaStatus.UNKNOWN,
      })
    );
    await getRepository(Media).save(
      new Media({
        olId: workId(3),
        mediaType: MediaType.BOOK,
        status: MediaStatus.BLOCKLISTED,
        statusAudio: MediaStatus.UNKNOWN,
      })
    );

    const result = await requestAuthorCatalog(admin, {
      authorId: AUTHOR_ID,
      olIds: [workId(1), workId(2), workId(3)],
      format: 'both',
    });

    assert.deepStrictEqual(
      result.created.map((item) => [item.mediaId, item.isAudiobook]),
      [
        [workId(1), true],
        [workId(2), false],
        [workId(2), true],
      ]
    );
    assert.deepStrictEqual(
      result.skipped.map((item) => [
        item.mediaId,
        item.isAudiobook,
        item.reason,
      ]),
      [
        [workId(1), false, 'available'],
        [workId(3), false, 'blocklisted'],
        [workId(3), true, 'blocklisted'],
      ]
    );
    assert.strictEqual(getWorkMock.callCount(), 0);

    const summaries = newRequestNotifications(summaryNotifications.calls);
    assert.strictEqual(summaries.length, 1);
    const payload = summaries[0].arguments[1] as NotificationPayload;
    assert.strictEqual(
      summaries[0].arguments[0],
      Notification.MEDIA_AUTO_APPROVED
    );
    // Counts books, not requests
    assert.strictEqual(payload.subject, '2 books by Roald Dahl');
    assert.strictEqual(payload.actionPath, `/author/${AUTHOR_ID}`);
    assert.deepStrictEqual(payload.extra, [
      { name: 'Format', value: 'Ebook and Audiobook' },
      { name: 'Language', value: 'English' },
    ]);
  });

  describe('summary wording in each agent', () => {
    before(() => {
      initI18n();
    });

    const getSummary = async (format: 'ebook' | 'audiobook' | 'both') => {
      const admin = await getUser('admin@seerr.dev');
      await requestAuthorCatalog(admin, {
        authorId: AUTHOR_ID,
        olIds: [workId(1), workId(2)],
        format,
      });

      const summaries = newRequestNotifications(summaryNotifications.calls);
      assert.strictEqual(summaries.length, 1);

      return {
        type: summaries[0].arguments[0] as Notification,
        payload: summaries[0].arguments[1] as NotificationPayload,
      };
    };

    const agentText = (type: Notification, payload: NotificationPayload) => {
      const push = (
        new WebPushAgent() as unknown as {
          getNotificationPayload: (
            type: Notification,
            payload: NotificationPayload
          ) => { message?: string };
        }
      ).getNotificationPayload(type, payload);
      const email = (
        new EmailAgent() as unknown as {
          buildMessage: (
            type: Notification,
            payload: NotificationPayload,
            recipientEmail: string
          ) => { locals: { body: string } };
        }
      ).buildMessage(type, payload, 'admin@seerr.dev');
      const webhook = (
        new WebhookAgent() as unknown as {
          parseKeys: (
            finalPayload: Record<string, unknown>,
            payload: NotificationPayload,
            type: Notification
          ) => Record<string, unknown>;
        }
      ).parseKeys({ format: '{{request_format}}' }, payload, type);

      return {
        push: push.message,
        email: email.locals.body,
        webhook: webhook.format,
      };
    };

    it('names both formats when the request covers both', async () => {
      const { type, payload } = await getSummary('both');

      assert.strictEqual(payload.event, 'Book Requests Automatically Approved');
      assert.strictEqual(payload.bookFormat, 'both');
      assert.strictEqual(payload.bulk, true);

      const text = agentText(type, payload);
      assert.match(
        text.push ?? '',
        /^Automatically approved a new ebook and audiobook request from /
      );
      assert.strictEqual(
        text.email,
        'A new request for the following books has been automatically approved:'
      );
      assert.strictEqual(text.webhook, 'both');
    });

    it('names the one format when the request covers one', async () => {
      const { type, payload } = await getSummary('audiobook');

      assert.strictEqual(
        payload.event,
        'Audiobook Requests Automatically Approved'
      );

      const text = agentText(type, payload);
      assert.match(
        text.push ?? '',
        /^Automatically approved a new audiobook request from /
      );
      assert.strictEqual(
        text.email,
        'A new request for the following audiobooks has been automatically approved:'
      );
      assert.strictEqual(text.webhook, 'audiobook');
    });
  });

  it('requires a book request permission', async () => {
    const musicUser = await createUser(
      'music@seerr.dev',
      Permission.REQUEST_MUSIC
    );
    const bookUser = await createUser(
      'books@seerr.dev',
      Permission.REQUEST_BOOK
    );
    const requestUser = await createUser('any@seerr.dev', Permission.REQUEST);

    await assert.rejects(
      requestAuthorCatalog(musicUser, {
        authorId: AUTHOR_ID,
        olIds: [workId(1)],
        format: 'ebook',
      }),
      RequestPermissionError
    );

    for (const user of [bookUser, requestUser]) {
      const result = await requestAuthorCatalog(user, {
        authorId: AUTHOR_ID,
        olIds: [workId(1)],
        format: 'audiobook',
      });
      assert.strictEqual(result.created.length + result.skipped.length, 1);
    }
  });

  it('counts both formats against the book quota', async () => {
    const user = await createUser('quota@seerr.dev', Permission.REQUEST, {
      bookQuotaLimit: 3,
    });

    await assert.rejects(
      requestAuthorCatalog(user, {
        authorId: AUTHOR_ID,
        olIds: [workId(1), workId(2)],
        format: 'both',
      }),
      QuotaRestrictedError
    );

    const result = await requestAuthorCatalog(user, {
      authorId: AUTHOR_ID,
      olIds: [workId(1), workId(2), workId(3)],
      format: 'ebook',
    });
    assert.strictEqual(result.created.length, 3);
  });

  it('caps a single request, counting both formats twice', async () => {
    const admin = await getUser('admin@seerr.dev');
    workCount = 60;

    await assert.rejects(
      requestAuthorCatalog(admin, {
        authorId: AUTHOR_ID,
        olIds: Array.from({ length: 51 }, (_, i) => workId(i + 1)),
        format: 'both',
      }),
      (e: unknown) => e instanceof BulkRequestError && e.status === 400
    );

    const result = await requestAuthorCatalog(admin, {
      authorId: AUTHOR_ID,
      olIds: Array.from({ length: 51 }, (_, i) => workId(i + 1)),
      format: 'ebook',
    });
    assert.strictEqual(result.created.length, 51);
  });

  it('reads every page of the works', async () => {
    const admin = await getUser('admin@seerr.dev');
    workCount = 250;

    const result = await requestAuthorCatalog(admin, {
      authorId: AUTHOR_ID,
      olIds: [workId(250), workId(251)],
      format: 'ebook',
    });

    assert.deepStrictEqual(ids(result.created), [workId(250)]);
    assert.deepStrictEqual(ids(result.failed), [workId(251)]);
  });
});

describe('POST /request/discography and /request/author-catalog', () => {
  function createApp() {
    const app = express();
    app.use(express.json());
    app.use(
      session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
      })
    );
    app.use(checkUser);
    app.use('/auth', authRoutes);
    app.use('/request', requestRoutes);
    app.use(
      (
        err: { status?: number; message?: string },
        _req: express.Request,
        res: express.Response,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: express.NextFunction
      ) => {
        res
          .status(err.status ?? 500)
          .json({ status: err.status ?? 500, message: err.message });
      }
    );
    return app;
  }

  async function loginAs(email: string) {
    const settings = getSettings();
    const priorLocalLogin = settings.main.localLogin;
    settings.main.localLogin = true;

    try {
      const agent = request.agent(createApp());
      const res = await agent
        .post('/auth/local')
        .send({ email, password: 'test1234' });
      assert.strictEqual(res.status, 200);
      return agent;
    } finally {
      settings.main.localLogin = priorLocalLogin;
    }
  }

  it('answers with the created, skipped and failed lists', async () => {
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.post('/request/discography').send({
      artistId: ARTIST_ID,
      mbIds: [albumId(1), albumId(99)],
    });

    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(ids(res.body.created), [albumId(1)]);
    assert.deepStrictEqual(res.body.skipped, []);
    assert.deepStrictEqual(ids(res.body.failed), [albumId(99)]);

    const again = await agent.post('/request/discography').send({
      artistId: ARTIST_ID,
      mbIds: [albumId(1)],
    });
    assert.strictEqual(again.status, 200);
    assert.strictEqual(again.body.skipped[0].reason, 'requested');
  });

  it('refuses users without the permission or over the cap', async () => {
    const demo = await getUser('demo@seerr.dev');
    demo.permissions = Permission.REQUEST_MUSIC;
    await getRepository(User).save(demo);
    const agent = await loginAs('demo@seerr.dev');

    const books = await agent.post('/request/author-catalog').send({
      authorId: AUTHOR_ID,
      olIds: [workId(1)],
      format: 'ebook',
    });
    assert.strictEqual(books.status, 403);

    const tooMany = await agent.post('/request/discography').send({
      artistId: ARTIST_ID,
      mbIds: Array.from({ length: MAX_BULK_REQUEST_ITEMS + 1 }, (_, i) =>
        albumId(i + 1)
      ),
    });
    assert.strictEqual(tooMany.status, 400);
    assert.match(tooMany.body.message, /at most 100 albums/);
  });
});

describe('catalog filters', () => {
  it('groups release groups by their first secondary type', () => {
    assert.strictEqual(getDiscographyType('Album'), 'Album');
    assert.strictEqual(getDiscographyType('EP', []), 'EP');
    assert.strictEqual(getDiscographyType('Album', ['Live']), 'Live');
    assert.strictEqual(
      getDiscographyType('Album', ['Compilation', 'Live']),
      'Compilation'
    );
    assert.strictEqual(getDiscographyType('Album', ['DJ-mix']), 'Other');
    assert.strictEqual(getDiscographyType(undefined), 'Other');
  });

  it('tells why an album or format is left out', () => {
    assert.strictEqual(getBulkSkipReason(undefined), undefined);
    assert.strictEqual(getBulkSkipReason(MediaStatus.UNKNOWN), undefined);
    assert.strictEqual(getBulkSkipReason(MediaStatus.DELETED), undefined);
    assert.strictEqual(getBulkSkipReason(MediaStatus.PENDING), 'requested');
    assert.strictEqual(getBulkSkipReason(MediaStatus.PROCESSING), 'requested');
    assert.strictEqual(getBulkSkipReason(MediaStatus.AVAILABLE), 'available');
    assert.strictEqual(
      getBulkSkipReason(MediaStatus.BLOCKLISTED),
      'blocklisted'
    );
    assert.strictEqual(
      getBulkSkipReason(MediaStatus.UNKNOWN, MediaStatus.BLOCKLISTED),
      'blocklisted'
    );
  });

  it('spots study guides and box sets by their title', () => {
    assert.strictEqual(getWorkKind('Matilda'), 'book');
    assert.strictEqual(getWorkKind('The BFG'), 'book');
    assert.strictEqual(getWorkKind('Summer Collection Stories'), 'collection');
    assert.strictEqual(
      getWorkKind('Charlie and the Chocolate Factory', 'Study Guide'),
      'studyGuide'
    );
    assert.strictEqual(getWorkKind('SparkNotes: Matilda'), 'studyGuide');
    assert.strictEqual(
      getWorkKind('Summary of Boy by Roald Dahl'),
      'studyGuide'
    );
    assert.strictEqual(getWorkKind('Roald Dahl Box Set'), 'collection');
    assert.strictEqual(
      getWorkKind('The Complete Stories of Roald Dahl'),
      'collection'
    );
    assert.strictEqual(getWorkKind('Harry Potter Books 1-7'), 'collection');
    assert.strictEqual(getWorkKind('The Witches'), 'book');
  });
});
