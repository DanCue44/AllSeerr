import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import TheMovieDb from '@server/api/themoviedb';
import type {
  TmdbMovieDetails,
  TmdbTvDetails,
} from '@server/api/themoviedb/interfaces';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import libraryRoutes from './library';

interface MockTitle {
  title: string;
  releaseDate?: string;
  voteAverage?: number;
  genres?: number[];
  collection?: { id: number; name: string };
}

const movies: Record<number, MockTitle> = {
  1: {
    title: 'Banana',
    releaseDate: '2001-01-01',
    voteAverage: 6,
    genres: [28],
    collection: { id: 900, name: 'Zebra Collection' },
  },
  2: {
    title: 'apple',
    releaseDate: '1999-01-01',
    voteAverage: 8,
    genres: [28, 35],
    collection: { id: 800, name: 'Alpha Collection' },
  },
  3: { title: 'Cherry', voteAverage: 0, genres: [35] },
  4: {
    title: 'Pending Movie',
    releaseDate: '2026-01-01',
    collection: { id: 700, name: 'Middle Collection' },
  },
  5: {
    title: 'Unknown Movie',
    collection: { id: 600, name: 'Hidden Collection' },
  },
  6: {
    title: 'Sequel',
    releaseDate: '2005-01-01',
    collection: { id: 900, name: 'Zebra Collection' },
  },
};

let movieLookups: number[] = [];

// getMovie and getTvShow are instance properties, so they are replaced through the prototype
Object.defineProperty(TheMovieDb.prototype, 'getMovie', {
  get() {
    return async ({ movieId }: { movieId: number }) => {
      movieLookups.push(movieId);
      const movie = movies[movieId] ?? { title: `Movie ${movieId}` };
      return {
        id: movieId,
        title: movie.title,
        original_title: movie.title,
        release_date: movie.releaseDate ?? '',
        vote_average: movie.voteAverage ?? 0,
        genres: (movie.genres ?? []).map((id) => ({ id, name: `${id}` })),
        poster_path: `/poster-${movieId}.jpg`,
        belongs_to_collection: movie.collection
          ? {
              ...movie.collection,
              poster_path: `/collection-${movie.collection.id}.jpg`,
            }
          : undefined,
      } as unknown as TmdbMovieDetails;
    };
  },
  set() {},
  configurable: true,
});

Object.defineProperty(TheMovieDb.prototype, 'getTvShow', {
  get() {
    return async ({ tvId }: { tvId: number }) =>
      ({
        id: tvId,
        name: `Show ${tvId}`,
        first_air_date: '2010-01-01',
        vote_average: 7,
        genres: [{ id: 18, name: 'Drama' }],
        origin_country: [],
      }) as unknown as TmdbTvDetails;
  },
  set() {},
  configurable: true,
});

let app: Express;

before(() => {
  app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/library', isAuthenticated(), libraryRoutes);
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

beforeEach(() => {
  cacheManager.getCache('library').flush();
  movieLookups = [];
});

async function loginAs(email: string) {
  getSettings().main.localLogin = true;
  const agent = request.agent(app);
  const res = await agent
    .post('/auth/local')
    .send({ email, password: 'test1234' });
  assert.strictEqual(res.status, 200);
  return agent;
}

async function seedMedia(
  tmdbId: number,
  status: MediaStatus,
  {
    mediaType = MediaType.MOVIE,
    status4k = MediaStatus.UNKNOWN,
    mediaAddedAt,
  }: {
    mediaType?: MediaType;
    status4k?: MediaStatus;
    mediaAddedAt?: Date;
  } = {}
) {
  return getRepository(Media).save(
    new Media({ tmdbId, mediaType, status, status4k, mediaAddedAt })
  );
}

async function seedLibrary() {
  await seedMedia(1, MediaStatus.AVAILABLE, {
    mediaAddedAt: new Date('2026-01-03'),
  });
  await seedMedia(2, MediaStatus.UNKNOWN, {
    status4k: MediaStatus.AVAILABLE,
    mediaAddedAt: new Date('2026-01-01'),
  });
  await seedMedia(3, MediaStatus.PARTIALLY_AVAILABLE, {
    mediaAddedAt: new Date('2026-01-02'),
  });
  await seedMedia(4, MediaStatus.PENDING);
  await seedMedia(5, MediaStatus.UNKNOWN);
  await seedMedia(10, MediaStatus.AVAILABLE, { mediaType: MediaType.TV });
}

const titles = (body: { results: { title?: string; name?: string }[] }) =>
  body.results.map((result) => result.title ?? result.name);

describe('GET /library', () => {
  it('lists available movies, newest first, with their media info', async () => {
    await seedLibrary();
    const agent = await loginAs('demo@seerr.dev');

    const res = await agent.get('/library?type=movie');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalResults, 3);
    assert.deepStrictEqual(titles(res.body), ['Banana', 'Cherry', 'apple']);
    assert.strictEqual(res.body.results[0].mediaType, 'movie');
    assert.strictEqual(res.body.results[0].posterPath, '/poster-1.jpg');
    assert.strictEqual(res.body.results[0].mediaInfo.tmdbId, 1);
  });

  it('lists series separately', async () => {
    await seedLibrary();
    const agent = await loginAs('demo@seerr.dev');

    const res = await agent.get('/library?type=tv');

    assert.deepStrictEqual(titles(res.body), ['Show 10']);
  });

  it('sorts by title, release date and rating', async () => {
    await seedLibrary();
    const agent = await loginAs('demo@seerr.dev');

    const byTitle = await agent.get('/library?type=movie&sortBy=title.asc');
    assert.deepStrictEqual(titles(byTitle.body), ['apple', 'Banana', 'Cherry']);

    // Titles without a release date or rating stay last in both directions
    const byRelease = await agent.get(
      '/library?type=movie&sortBy=releaseDate.asc'
    );
    assert.deepStrictEqual(titles(byRelease.body), [
      'apple',
      'Banana',
      'Cherry',
    ]);

    const byRating = await agent.get('/library?type=movie&sortBy=rating.desc');
    assert.deepStrictEqual(titles(byRating.body), [
      'apple',
      'Banana',
      'Cherry',
    ]);
  });

  it('filters by genre', async () => {
    await seedLibrary();
    const agent = await loginAs('demo@seerr.dev');

    const comedy = await agent.get('/library?type=movie&genre=35');
    assert.deepStrictEqual(titles(comedy.body), ['Cherry', 'apple']);

    const both = await agent.get('/library?type=movie&genre=28,35');
    assert.deepStrictEqual(titles(both.body), ['apple']);
  });

  it('only looks up the requested page when sorting by date added', async () => {
    for (let tmdbId = 101; tmdbId <= 125; tmdbId++) {
      await seedMedia(tmdbId, MediaStatus.AVAILABLE, {
        mediaAddedAt: new Date(Date.UTC(2026, 0, tmdbId - 100)),
      });
    }
    const agent = await loginAs('demo@seerr.dev');

    const res = await agent.get('/library?type=movie&page=2');

    assert.strictEqual(res.body.totalPages, 2);
    assert.strictEqual(res.body.totalResults, 25);
    assert.deepStrictEqual(
      res.body.results.map((result: { id: number }) => result.id),
      [105, 104, 103, 102, 101]
    );
    assert.strictEqual(movieLookups.length, 5);
  });

  it('serves repeated requests from the library cache', async () => {
    await seedLibrary();
    const agent = await loginAs('demo@seerr.dev');

    await agent.get('/library?type=movie&sortBy=title.asc');
    const firstLookups = movieLookups.length;
    await agent.get('/library?type=movie&sortBy=rating.asc');

    assert.strictEqual(firstLookups, 3);
    assert.strictEqual(movieLookups.length, 3);
  });

  it('rejects an unknown type', async () => {
    const agent = await loginAs('demo@seerr.dev');

    const res = await agent.get('/library?type=person');

    assert.strictEqual(res.status, 400);
  });
});

describe('GET /library/collections', () => {
  it('lists collections with an available or requested part', async () => {
    await seedLibrary();
    await seedMedia(6, MediaStatus.PROCESSING);
    const agent = await loginAs('demo@seerr.dev');

    const res = await agent.get('/library/collections');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(titles(res.body), [
      'Alpha Collection',
      'Middle Collection',
      'Zebra Collection',
    ]);
    assert.strictEqual(res.body.results[0].mediaType, 'collection');
    assert.strictEqual(res.body.results[0].posterPath, '/collection-800.jpg');
  });
});
