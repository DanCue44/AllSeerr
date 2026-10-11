import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';

import MusicBrainz from '@server/api/musicbrainz';
import type { MbArtist } from '@server/api/musicbrainz/interfaces';
import OpenLibrary from '@server/api/openlibrary';
import type { OlAuthor } from '@server/api/openlibrary/interfaces';
import PlexTvAPI from '@server/api/plextv';
import TheAudioDb from '@server/api/theaudiodb';
import { FollowType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { Watchlist } from '@server/entity/Watchlist';
import type { WatchlistItem } from '@server/interfaces/api/discoverInterfaces';
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

const ARTIST_MBID = 'a74b1b7f-71a5-4011-9441-d0b5e4122711';
const AUTHOR_ID = 'OL34184A';
// A merged OpenLibrary author, followed as the author it was merged into
const MERGED_AUTHOR_ID = 'OL99999A';

mock.method(
  MusicBrainz.prototype,
  'getArtist',
  async ({ artistId }: { artistId: string }) =>
    ({ id: artistId, name: 'Radiohead' }) as unknown as MbArtist
);

mock.method(
  OpenLibrary.prototype,
  'getAuthor',
  async (): Promise<OlAuthor> => ({
    key: `/authors/${AUTHOR_ID}`,
    name: 'Roald Dahl',
    type: { key: '/type/author' },
    photos: [-1, 6257725],
  })
);

mock.method(TheAudioDb.prototype, 'getArtistImages', async () => ({
  artistThumb: 'https://r2.theaudiodb.com/radiohead.jpg',
  artistBackground: null,
}));

mock.method(PlexTvAPI.prototype, 'getWatchlist', async () => ({
  offset: 0,
  size: 20,
  totalSize: 0,
  items: [],
}));

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

describe('POST /watchlist (artist)', () => {
  it('follows an artist without creating media', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');

    const res = await agent
      .post('/watchlist')
      .send({ mbId: ARTIST_MBID, mediaType: FollowType.ARTIST });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.mbId, ARTIST_MBID);
    assert.strictEqual(res.body.title, 'Radiohead');

    const follow = await getRepository(Watchlist).findOneOrFail({
      where: { mbId: ARTIST_MBID, mediaType: FollowType.ARTIST },
    });
    assert.strictEqual(follow.tmdbId, null);
    assert.strictEqual(follow.media, null);
    assert.strictEqual(follow.releasesCheckedAt, null);
    assert.strictEqual(await getRepository(Media).count(), 0);
  });

  it('blocks a duplicate artist', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const body = { mbId: ARTIST_MBID, mediaType: FollowType.ARTIST };

    assert.strictEqual((await agent.post('/watchlist').send(body)).status, 201);
    const res = await agent.post('/watchlist').send(body);

    assert.strictEqual(res.status, 409);
    assert.strictEqual(await getRepository(Watchlist).count(), 1);
  });

  it('lets two users follow the same artist', async () => {
    const admin = await loginAs('admin@seerr.dev', 'test1234');
    const demo = await loginAs('demo@seerr.dev', 'test1234');
    const body = { mbId: ARTIST_MBID, mediaType: FollowType.ARTIST };

    assert.strictEqual((await admin.post('/watchlist').send(body)).status, 201);
    assert.strictEqual((await demo.post('/watchlist').send(body)).status, 201);
    assert.strictEqual(await getRepository(Watchlist).count(), 2);
  });

  it('keeps an artist apart from an album with the same id', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    await agent
      .post('/watchlist')
      .send({ mbId: ARTIST_MBID, mediaType: FollowType.ARTIST });

    const res = await agent.delete(`/watchlist/${ARTIST_MBID}?mediaType=music`);

    assert.strictEqual(res.status, 404);
    assert.strictEqual(await getRepository(Watchlist).count(), 1);
  });

  it('rejects an artist without a valid mbId', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');

    const missing = await agent
      .post('/watchlist')
      .send({ olId: AUTHOR_ID, mediaType: FollowType.ARTIST });
    const invalid = await agent
      .post('/watchlist')
      .send({ mbId: 'not-an-mbid', mediaType: FollowType.ARTIST });

    assert.strictEqual(missing.status, 400);
    assert.strictEqual(invalid.status, 400);
    assert.strictEqual(await getRepository(Watchlist).count(), 0);
  });
});

describe('POST /watchlist (author)', () => {
  it('follows an author under the author they were merged into', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');

    const res = await agent
      .post('/watchlist')
      .send({ olId: MERGED_AUTHOR_ID, mediaType: FollowType.AUTHOR });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.olId, AUTHOR_ID);
    assert.strictEqual(res.body.title, 'Roald Dahl');
    assert.strictEqual(await getRepository(Media).count(), 0);
  });

  it('blocks a duplicate author', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const body = { olId: AUTHOR_ID, mediaType: FollowType.AUTHOR };

    assert.strictEqual((await agent.post('/watchlist').send(body)).status, 201);
    const res = await agent.post('/watchlist').send(body);

    assert.strictEqual(res.status, 409);
    assert.strictEqual(await getRepository(Watchlist).count(), 1);
  });

  it('rejects a work id for an author, and an author id for a book', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');

    const work = await agent
      .post('/watchlist')
      .send({ olId: 'OL45804W', mediaType: FollowType.AUTHOR });
    const author = await agent
      .post('/watchlist')
      .send({ olId: AUTHOR_ID, mediaType: 'book' });

    assert.strictEqual(work.status, 400);
    assert.strictEqual(author.status, 400);
    assert.strictEqual(await getRepository(Watchlist).count(), 0);
  });
});

describe('DELETE /watchlist/:id (followed)', () => {
  it('unfollows an artist by their mbId', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    await agent
      .post('/watchlist')
      .send({ mbId: ARTIST_MBID, mediaType: FollowType.ARTIST });

    const res = await agent.delete(
      `/watchlist/${ARTIST_MBID}?mediaType=${FollowType.ARTIST}`
    );
    const again = await agent.delete(
      `/watchlist/${ARTIST_MBID}?mediaType=${FollowType.ARTIST}`
    );

    assert.strictEqual(res.status, 204);
    assert.strictEqual(again.status, 404);
    assert.strictEqual(await getRepository(Watchlist).count(), 0);
  });

  it('unfollows an author by their olId', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    await agent
      .post('/watchlist')
      .send({ olId: AUTHOR_ID, mediaType: FollowType.AUTHOR });

    const res = await agent.delete(
      `/watchlist/${AUTHOR_ID}?mediaType=${FollowType.AUTHOR}`
    );

    assert.strictEqual(res.status, 204);
    assert.strictEqual(await getRepository(Watchlist).count(), 0);
  });

  it("leaves another user's follow alone", async () => {
    const admin = await loginAs('admin@seerr.dev', 'test1234');
    const demo = await loginAs('demo@seerr.dev', 'test1234');
    await admin
      .post('/watchlist')
      .send({ olId: AUTHOR_ID, mediaType: FollowType.AUTHOR });

    const res = await demo.delete(
      `/watchlist/${AUTHOR_ID}?mediaType=${FollowType.AUTHOR}`
    );

    assert.strictEqual(res.status, 404);
    assert.strictEqual(await getRepository(Watchlist).count(), 1);
  });

  it('rejects an id that does not fit the follow type', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');

    const artist = await agent.delete(
      `/watchlist/${AUTHOR_ID}?mediaType=${FollowType.ARTIST}`
    );
    const author = await agent.delete(
      `/watchlist/OL45804W?mediaType=${FollowType.AUTHOR}`
    );

    assert.strictEqual(artist.status, 400);
    assert.strictEqual(author.status, 400);
  });
});

describe('GET /user/:id/watchlist (followed)', () => {
  it('lists followed artists and authors with their photos', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    await agent
      .post('/watchlist')
      .send({ mbId: ARTIST_MBID, mediaType: FollowType.ARTIST });
    await agent
      .post('/watchlist')
      .send({ olId: AUTHOR_ID, mediaType: FollowType.AUTHOR });

    const res = await agent.get('/user/1/watchlist');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalResults, 2);

    const results = res.body.results as WatchlistItem[];
    const artist = results.find((item) => item.mediaType === 'artist');
    const author = results.find((item) => item.mediaType === 'author');

    assert.strictEqual(
      artist?.image,
      'https://r2.theaudiodb.com/radiohead.jpg'
    );
    assert.strictEqual(
      author?.image,
      'https://covers.openlibrary.org/a/id/6257725-L.jpg'
    );
  });
});
