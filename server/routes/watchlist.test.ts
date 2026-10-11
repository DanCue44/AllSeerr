import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';

import MusicBrainz from '@server/api/musicbrainz';
import type { MbReleaseGroup } from '@server/api/musicbrainz/interfaces';
import OpenLibrary from '@server/api/openlibrary';
import type { OlWork } from '@server/api/openlibrary/interfaces';
import PlexTvAPI from '@server/api/plextv';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { Watchlist } from '@server/entity/Watchlist';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import userRoutes from './user';
import watchlistRoutes from './watchlist';

const ALBUM_MBID = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';
const WORK_ID = 'OL45804W';
// A merged OpenLibrary work, watchlisted as the work it was merged into
const MERGED_WORK_ID = 'OL99999W';

mock.method(
  MusicBrainz.prototype,
  'getAlbum',
  async ({ releaseGroupId }: { releaseGroupId: string }) =>
    ({
      id: releaseGroupId,
      title: 'OK Computer',
      'primary-type': 'Album',
    }) as MbReleaseGroup
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

// Both test users are Plex users, whose movies and series come from Plex
const plexWatchlistMock = mock.method(
  PlexTvAPI.prototype,
  'getWatchlist',
  async ({
    offset = 0,
    size = 20,
  }: { offset?: number; size?: number } = {}) => ({
    offset,
    size,
    totalSize: 1,
    items:
      offset === 0
        ? [
            {
              ratingKey: 'plex-1',
              tmdbId: 550,
              tvdbId: undefined,
              title: 'Fight Club',
              type: 'movie' as const,
            },
          ]
        : [],
  })
).mock;

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
  app.use('/watchlist', watchlistRoutes);
  app.use('/user', userRoutes);
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

describe('POST /watchlist (music)', () => {
  it('adds an album and creates its media', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');

    const res = await agent
      .post('/watchlist')
      .send({ mbId: ALBUM_MBID, mediaType: MediaType.MUSIC });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.mbId, ALBUM_MBID);
    assert.strictEqual(res.body.title, 'OK Computer');

    const watchlist = await getRepository(Watchlist).findOneOrFail({
      where: { mbId: ALBUM_MBID, mediaType: MediaType.MUSIC },
    });
    assert.strictEqual(watchlist.tmdbId, null);
    assert.strictEqual(watchlist.media.mbId, ALBUM_MBID);
    assert.strictEqual(watchlist.media.status, MediaStatus.UNKNOWN);
  });

  it('reuses the existing media of the album', async () => {
    const media = await getRepository(Media).save(
      new Media({
        mbId: ALBUM_MBID,
        mediaType: MediaType.MUSIC,
        status: MediaStatus.AVAILABLE,
      })
    );
    const agent = await loginAs('admin@seerr.dev', 'test1234');

    const res = await agent
      .post('/watchlist')
      .send({ mbId: ALBUM_MBID, mediaType: MediaType.MUSIC });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.media.id, media.id);
    assert.strictEqual(await getRepository(Media).count(), 1);
  });

  it('blocks a duplicate album', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const body = { mbId: ALBUM_MBID, mediaType: MediaType.MUSIC };

    assert.strictEqual((await agent.post('/watchlist').send(body)).status, 201);
    const res = await agent.post('/watchlist').send(body);

    assert.strictEqual(res.status, 409);
    assert.strictEqual(await getRepository(Watchlist).count(), 1);
  });

  it('lets two users watchlist the same album', async () => {
    const admin = await loginAs('admin@seerr.dev', 'test1234');
    const demo = await loginAs('demo@seerr.dev', 'test1234');
    const body = { mbId: ALBUM_MBID, mediaType: MediaType.MUSIC };

    assert.strictEqual((await admin.post('/watchlist').send(body)).status, 201);
    assert.strictEqual((await demo.post('/watchlist').send(body)).status, 201);
    assert.strictEqual(await getRepository(Watchlist).count(), 2);
  });

  it('rejects an album without a valid mbId', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');

    const missing = await agent
      .post('/watchlist')
      .send({ tmdbId: 550, mediaType: MediaType.MUSIC });
    const invalid = await agent
      .post('/watchlist')
      .send({ mbId: 'not-an-mbid', mediaType: MediaType.MUSIC });

    assert.strictEqual(missing.status, 400);
    assert.strictEqual(invalid.status, 400);
    assert.strictEqual(await getRepository(Watchlist).count(), 0);
  });
});

describe('POST /watchlist (book)', () => {
  it('adds a book under the work it was merged into', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');

    const res = await agent
      .post('/watchlist')
      .send({ olId: MERGED_WORK_ID, mediaType: MediaType.BOOK });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.olId, WORK_ID);
    assert.strictEqual(res.body.title, 'Fantastic Mr Fox');

    const media = await getRepository(Media).findOneOrFail({
      where: { olId: WORK_ID, mediaType: MediaType.BOOK },
    });
    assert.strictEqual(media.status, MediaStatus.UNKNOWN);
    assert.strictEqual(media.statusAudio, MediaStatus.UNKNOWN);
  });

  it('blocks a duplicate book', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const body = { olId: WORK_ID, mediaType: MediaType.BOOK };

    assert.strictEqual((await agent.post('/watchlist').send(body)).status, 201);
    const res = await agent.post('/watchlist').send(body);

    assert.strictEqual(res.status, 409);
    assert.strictEqual(await getRepository(Watchlist).count(), 1);
  });
});

describe('DELETE /watchlist/:id', () => {
  it('removes an album by its mbId', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    await agent
      .post('/watchlist')
      .send({ mbId: ALBUM_MBID, mediaType: MediaType.MUSIC });

    const res = await agent.delete(
      `/watchlist/${ALBUM_MBID}?mediaType=${MediaType.MUSIC}`
    );
    const again = await agent.delete(
      `/watchlist/${ALBUM_MBID}?mediaType=${MediaType.MUSIC}`
    );

    assert.strictEqual(res.status, 204);
    assert.strictEqual(again.status, 404);
    assert.strictEqual(await getRepository(Watchlist).count(), 0);
  });

  it('removes a book by its olId', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    await agent
      .post('/watchlist')
      .send({ olId: WORK_ID, mediaType: MediaType.BOOK });

    const res = await agent.delete(
      `/watchlist/${WORK_ID}?mediaType=${MediaType.BOOK}`
    );

    assert.strictEqual(res.status, 204);
    assert.strictEqual(await getRepository(Watchlist).count(), 0);
  });

  it("leaves another user's entry alone", async () => {
    const admin = await loginAs('admin@seerr.dev', 'test1234');
    const demo = await loginAs('demo@seerr.dev', 'test1234');
    await admin
      .post('/watchlist')
      .send({ mbId: ALBUM_MBID, mediaType: MediaType.MUSIC });

    const res = await demo.delete(
      `/watchlist/${ALBUM_MBID}?mediaType=${MediaType.MUSIC}`
    );

    assert.strictEqual(res.status, 404);
    assert.strictEqual(await getRepository(Watchlist).count(), 1);
  });

  it('rejects an id that does not fit the media type', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');

    const res = await agent.delete(
      `/watchlist/550?mediaType=${MediaType.MUSIC}`
    );

    assert.strictEqual(res.status, 400);
  });
});

describe('GET /user/:id/watchlist', () => {
  it('lists albums and books ahead of the Plex watchlist', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    await agent
      .post('/watchlist')
      .send({ mbId: ALBUM_MBID, mediaType: MediaType.MUSIC });
    await agent
      .post('/watchlist')
      .send({ olId: WORK_ID, mediaType: MediaType.BOOK });

    const res = await agent.get('/user/1/watchlist');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalResults, 3);
    assert.deepEqual(
      res.body.results.map(
        (item: Watchlist) => item.mbId ?? item.olId ?? item.tmdbId
      ),
      [WORK_ID, ALBUM_MBID, 550]
    );
    assert.deepEqual(plexWatchlistMock.calls.at(-1)?.arguments, [
      { offset: 0, size: 18 },
    ]);
  });

  it('is the Plex watchlist alone without albums or books', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');

    const res = await agent.get('/user/1/watchlist');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalResults, 1);
    assert.strictEqual(res.body.results[0].tmdbId, 550);
    assert.deepEqual(plexWatchlistMock.calls.at(-1)?.arguments, [
      { offset: 0, size: 20 },
    ]);
  });
});
