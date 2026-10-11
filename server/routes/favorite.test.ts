import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import favoriteRoutes from './favorite';

let app: Express;

before(() => {
  app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/favorite', isAuthenticated(), favoriteRoutes);
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
});

setupTestDb();

async function loginAs(email: string) {
  getSettings().main.localLogin = true;
  const agent = request.agent(app);
  const res = await agent
    .post('/auth/local')
    .send({ email, password: 'test1234' });
  assert.strictEqual(res.status, 200);
  return agent;
}

async function userId(email: string) {
  const user = await getRepository(User).findOneOrFail({ where: { email } });
  return user.id;
}

describe('POST /favorite', () => {
  it('adds a favorite and refuses a duplicate', async () => {
    const agent = await loginAs('demo@seerr.dev');

    const res = await agent
      .post('/favorite')
      .send({ tmdbId: 550, mediaType: 'movie' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.tmdbId, 550);
    assert.strictEqual(res.body.mediaType, 'movie');

    const duplicate = await agent
      .post('/favorite')
      .send({ tmdbId: 550, mediaType: 'movie' });
    assert.strictEqual(duplicate.status, 409);
  });

  it('keeps movies and series with the same id apart', async () => {
    const agent = await loginAs('demo@seerr.dev');

    await agent.post('/favorite').send({ tmdbId: 1399, mediaType: 'movie' });
    const res = await agent
      .post('/favorite')
      .send({ tmdbId: 1399, mediaType: 'tv' });

    assert.strictEqual(res.status, 201);
  });

  it('rejects an unknown media type', async () => {
    const agent = await loginAs('demo@seerr.dev');

    const res = await agent
      .post('/favorite')
      .send({ tmdbId: 550, mediaType: 'person' });

    assert.strictEqual(res.status, 400);
  });
});

describe('GET /favorite', () => {
  it('lists the newest favorites first and filters by title', async () => {
    const agent = await loginAs('demo@seerr.dev');
    await agent.post('/favorite').send({ tmdbId: 550, mediaType: 'movie' });
    await agent.post('/favorite').send({ tmdbId: 1399, mediaType: 'tv' });

    const all = await agent.get('/favorite');
    assert.strictEqual(all.status, 200);
    assert.strictEqual(all.body.totalResults, 2);
    assert.deepStrictEqual(
      all.body.results.map((item: { tmdbId: number }) => item.tmdbId),
      [1399, 550]
    );

    const single = await agent.get('/favorite?tmdbId=550&mediaType=movie');
    assert.strictEqual(single.body.totalResults, 1);

    const otherType = await agent.get('/favorite?tmdbId=550&mediaType=tv');
    assert.strictEqual(otherType.body.totalResults, 0);
  });

  it("only lets permitted users see someone else's favorites", async () => {
    const demo = await loginAs('demo@seerr.dev');
    await demo.post('/favorite').send({ tmdbId: 550, mediaType: 'movie' });

    const adminId = await userId('admin@seerr.dev');
    const forbidden = await demo.get(`/favorite?userId=${adminId}`);
    assert.strictEqual(forbidden.status, 403);

    const demoId = await userId('demo@seerr.dev');
    const admin = await loginAs('admin@seerr.dev');
    const allowed = await admin.get(`/favorite?userId=${demoId}`);
    assert.strictEqual(allowed.status, 200);
    assert.strictEqual(allowed.body.totalResults, 1);

    const own = await admin.get('/favorite');
    assert.strictEqual(own.body.totalResults, 0);
  });
});

describe('DELETE /favorite/:tmdbId', () => {
  it("removes only the user's own favorite", async () => {
    const admin = await loginAs('admin@seerr.dev');
    await admin.post('/favorite').send({ tmdbId: 550, mediaType: 'movie' });

    const demo = await loginAs('demo@seerr.dev');
    await demo.post('/favorite').send({ tmdbId: 550, mediaType: 'movie' });

    const res = await demo.delete('/favorite/550?mediaType=movie');
    assert.strictEqual(res.status, 204);

    const again = await demo.delete('/favorite/550?mediaType=movie');
    assert.strictEqual(again.status, 404);

    const adminFavorites = await admin.get('/favorite');
    assert.strictEqual(adminFavorites.body.totalResults, 1);
  });

  it('requires a media type', async () => {
    const demo = await loginAs('demo@seerr.dev');

    const res = await demo.delete('/favorite/550');

    assert.strictEqual(res.status, 400);
  });
});

describe('album and book favorites', () => {
  const ALBUM_MBID = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';
  const WORK_ID = 'OL45804W';

  it('adds an album and a book and refuses duplicates', async () => {
    const agent = await loginAs('demo@seerr.dev');

    const album = await agent
      .post('/favorite')
      .send({ mbId: ALBUM_MBID, mediaType: 'music' });
    assert.strictEqual(album.status, 201);
    assert.strictEqual(album.body.mbId, ALBUM_MBID);
    assert.strictEqual(album.body.mediaType, 'music');
    assert.strictEqual(album.body.tmdbId, undefined);

    const book = await agent
      .post('/favorite')
      .send({ olId: WORK_ID, mediaType: 'book' });
    assert.strictEqual(book.status, 201);
    assert.strictEqual(book.body.olId, WORK_ID);

    const duplicateAlbum = await agent
      .post('/favorite')
      .send({ mbId: ALBUM_MBID, mediaType: 'music' });
    assert.strictEqual(duplicateAlbum.status, 409);

    const duplicateBook = await agent
      .post('/favorite')
      .send({ olId: WORK_ID, mediaType: 'book' });
    assert.strictEqual(duplicateBook.status, 409);

    // A movie favorite is not taken for a duplicate of either
    const movie = await agent
      .post('/favorite')
      .send({ tmdbId: 550, mediaType: 'movie' });
    assert.strictEqual(movie.status, 201);

    const all = await agent.get('/favorite');
    assert.strictEqual(all.body.totalResults, 3);
    assert.deepStrictEqual(
      all.body.results.map(
        (item: { mediaType: string; tmdbId?: number; mbId?: string }) =>
          item.mediaType
      ),
      ['movie', 'book', 'music']
    );

    const single = await agent.get(
      `/favorite?mbId=${ALBUM_MBID}&mediaType=music`
    );
    assert.strictEqual(single.body.totalResults, 1);
    assert.strictEqual(single.body.results[0].mbId, ALBUM_MBID);
  });

  it('refuses an album or book without a valid id', async () => {
    const agent = await loginAs('demo@seerr.dev');

    const noId = await agent.post('/favorite').send({ mediaType: 'music' });
    assert.strictEqual(noId.status, 400);

    const badAlbum = await agent
      .post('/favorite')
      .send({ mbId: 'not-a-uuid', mediaType: 'music' });
    assert.strictEqual(badAlbum.status, 400);

    // An album id does not name a book
    const badBook = await agent
      .post('/favorite')
      .send({ mbId: ALBUM_MBID, mediaType: 'book' });
    assert.strictEqual(badBook.status, 400);
  });

  it('removes an album and a book by their ids', async () => {
    const agent = await loginAs('demo@seerr.dev');
    await agent
      .post('/favorite')
      .send({ mbId: ALBUM_MBID, mediaType: 'music' });
    await agent.post('/favorite').send({ olId: WORK_ID, mediaType: 'book' });

    const album = await agent.delete(`/favorite/${ALBUM_MBID}?mediaType=music`);
    assert.strictEqual(album.status, 204);

    const again = await agent.delete(`/favorite/${ALBUM_MBID}?mediaType=music`);
    assert.strictEqual(again.status, 404);

    const wrongType = await agent.delete(
      `/favorite/${WORK_ID}?mediaType=music`
    );
    assert.strictEqual(wrongType.status, 400);

    const book = await agent.delete(`/favorite/${WORK_ID}?mediaType=book`);
    assert.strictEqual(book.status, 204);

    const all = await agent.get('/favorite');
    assert.strictEqual(all.body.totalResults, 0);
  });
});
