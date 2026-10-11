import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';

import MusicBrainz from '@server/api/musicbrainz';
import type { MbReleaseGroup } from '@server/api/musicbrainz/interfaces';
import OpenLibrary from '@server/api/openlibrary';
import type { OlWork } from '@server/api/openlibrary/interfaces';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { Blocklist } from '@server/entity/Blocklist';
import Media from '@server/entity/Media';
import {
  BlocklistedMediaError,
  MediaRequest,
} from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import {
  assertNoCredentials,
  seedUserSettings,
} from '@server/test/userSettings';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import blocklistRoutes from './blocklist';

const ALBUM_MBID = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';
const WORK_ID = 'OL45804W';

mock.method(
  MusicBrainz.prototype,
  'getAlbum',
  async ({ releaseGroupId }: { releaseGroupId: string }) =>
    ({ id: releaseGroupId, title: 'OK Computer' }) as MbReleaseGroup
);

mock.method(
  OpenLibrary.prototype,
  'getWork',
  async (): Promise<OlWork> => ({
    key: `/works/${WORK_ID}`,
    title: 'Fantastic Mr Fox',
    type: { key: '/type/work' },
  })
);

let app: Express;

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
  app.use('/blocklist', blocklistRoutes);
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

before(async () => {
  app = createApp();
});

setupTestDb();

async function loginAs(email: string, password: string) {
  const settings = getSettings();
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent.post('/auth/local').send({ email, password });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

describe('GET /blocklist/:id', () => {
  // this route replies with res.send() rather than res.json()
  it('omits notification settings from the blocklisting user', async () => {
    const blocklistUser = await seedUserSettings('demo@seerr.dev');

    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 12345,
        status: MediaStatus.BLOCKLISTED,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    await getRepository(Blocklist).save(
      new Blocklist({
        mediaType: MediaType.MOVIE,
        tmdbId: 12345,
        title: 'Blocked Movie',
        user: blocklistUser,
        media,
      })
    );

    const admin = await loginAs('admin@seerr.dev', 'test1234');
    const res = await admin.get('/blocklist/12345?mediaType=movie');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.email, 'demo@seerr.dev');
    assert.ok(!('settings' in res.body.user));
    assertNoCredentials(res.body);
  });
});

describe('blocklisting albums and books', () => {
  it('blocklists an album and blocks requests for it', async () => {
    const admin = await loginAs('admin@seerr.dev', 'test1234');

    const res = await admin.post('/blocklist').send({
      mbId: ALBUM_MBID,
      mediaType: MediaType.MUSIC,
      title: 'OK Computer',
      user: 1,
    });
    assert.strictEqual(res.status, 201);

    const media = await getRepository(Media).findOneOrFail({
      where: { mbId: ALBUM_MBID, mediaType: MediaType.MUSIC },
    });
    assert.strictEqual(media.status, MediaStatus.BLOCKLISTED);

    const requester = await getRepository(User).findOneOrFail({
      where: { email: 'admin@seerr.dev' },
    });
    await assert.rejects(
      () =>
        MediaRequest.request(
          { mediaType: MediaType.MUSIC, mediaId: ALBUM_MBID },
          requester
        ),
      BlocklistedMediaError
    );
    assert.strictEqual(await getRepository(MediaRequest).count(), 0);

    const item = await admin.get(
      `/blocklist/${ALBUM_MBID}?mediaType=${MediaType.MUSIC}`
    );
    assert.strictEqual(item.status, 200);
    assert.strictEqual(item.body.mbId, ALBUM_MBID);
    assert.strictEqual(item.body.tmdbId, null);
  });

  it('blocklists a book in both formats', async () => {
    const admin = await loginAs('admin@seerr.dev', 'test1234');

    const res = await admin.post('/blocklist').send({
      olId: WORK_ID,
      mediaType: MediaType.BOOK,
      title: 'Fantastic Mr Fox',
      user: 1,
    });
    assert.strictEqual(res.status, 201);

    const media = await getRepository(Media).findOneOrFail({
      where: { olId: WORK_ID, mediaType: MediaType.BOOK },
    });
    assert.strictEqual(media.status, MediaStatus.BLOCKLISTED);
    assert.strictEqual(media.statusAudio, MediaStatus.BLOCKLISTED);

    const requester = await getRepository(User).findOneOrFail({
      where: { email: 'admin@seerr.dev' },
    });
    for (const isAudiobook of [false, true]) {
      await assert.rejects(
        () =>
          MediaRequest.request(
            { mediaType: MediaType.BOOK, mediaId: WORK_ID, isAudiobook },
            requester
          ),
        BlocklistedMediaError
      );
    }
    assert.strictEqual(await getRepository(MediaRequest).count(), 0);
  });

  it('marks an existing book blocklisted in both formats', async () => {
    await getRepository(Media).save(
      new Media({
        olId: WORK_ID,
        mediaType: MediaType.BOOK,
        status: MediaStatus.UNKNOWN,
        statusAudio: MediaStatus.DELETED,
      })
    );
    const admin = await loginAs('admin@seerr.dev', 'test1234');

    const res = await admin
      .post('/blocklist')
      .send({ olId: WORK_ID, mediaType: MediaType.BOOK, user: 1 });
    assert.strictEqual(res.status, 201);

    const media = await getRepository(Media).findOneOrFail({
      where: { olId: WORK_ID, mediaType: MediaType.BOOK },
    });
    assert.strictEqual(media.status, MediaStatus.BLOCKLISTED);
    assert.strictEqual(media.statusAudio, MediaStatus.BLOCKLISTED);
    assert.strictEqual(await getRepository(Media).count(), 1);
  });

  it('refuses an album blocklisted twice', async () => {
    const admin = await loginAs('admin@seerr.dev', 'test1234');
    const body = { mbId: ALBUM_MBID, mediaType: MediaType.MUSIC, user: 1 };

    assert.strictEqual((await admin.post('/blocklist').send(body)).status, 201);
    const res = await admin.post('/blocklist').send(body);

    assert.strictEqual(res.status, 412);
    assert.strictEqual(await getRepository(Blocklist).count(), 1);
  });

  it('rejects an album without an mbId', async () => {
    const admin = await loginAs('admin@seerr.dev', 'test1234');

    const res = await admin
      .post('/blocklist')
      .send({ tmdbId: 550, mediaType: MediaType.MUSIC, user: 1 });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(await getRepository(Blocklist).count(), 0);
  });

  it('unblocklists an album so it can be requested again', async () => {
    const admin = await loginAs('admin@seerr.dev', 'test1234');
    await admin
      .post('/blocklist')
      .send({ mbId: ALBUM_MBID, mediaType: MediaType.MUSIC, user: 1 });

    const res = await admin.delete(
      `/blocklist/${ALBUM_MBID}?mediaType=${MediaType.MUSIC}`
    );

    assert.strictEqual(res.status, 204);
    assert.strictEqual(await getRepository(Blocklist).count(), 0);
    assert.strictEqual(
      await getRepository(Media).count({
        where: { mbId: ALBUM_MBID, mediaType: MediaType.MUSIC },
      }),
      0
    );
  });

  it('rejects an id that does not fit the media type', async () => {
    const admin = await loginAs('admin@seerr.dev', 'test1234');

    const res = await admin.get(`/blocklist/550?mediaType=${MediaType.BOOK}`);

    assert.strictEqual(res.status, 400);
  });
});
