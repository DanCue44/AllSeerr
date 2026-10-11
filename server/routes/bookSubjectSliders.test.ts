import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it, mock } from 'node:test';

import OpenLibrary from '@server/api/openlibrary';
import type { OlSubjectSearchResponse } from '@server/api/openlibrary/interfaces';
import { DiscoverSliderType } from '@server/constants/discover';
import { getRepository } from '@server/datasource';
import DiscoverSlider from '@server/entity/DiscoverSlider';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import discoverBooksRoutes, { toSubjectSuggestions } from './discoverBooks';
import settingsRoutes from './settings';

const SEARCH_RESPONSE: OlSubjectSearchResponse = {
  numFound: 5,
  start: 0,
  docs: [
    {
      key: '/subjects/thriller',
      name: 'Thriller',
      subject_type: 'subject',
      work_count: 2383,
    },
    {
      key: '/subjects/thriller',
      name: 'thriller',
      subject_type: 'subject',
      work_count: 301,
    },
    {
      key: '/subjects/person:jack_reacher',
      name: 'Jack Reacher',
      subject_type: 'person',
      work_count: 40,
    },
    {
      key: '/subjects/fiction_-_espionage__thriller',
      name: 'Fiction - Espionage / Thriller',
      subject_type: 'subject',
      work_count: 223,
    },
    {
      key: '/subjects/thriller_(ficción)',
      name: 'Thriller (ficción)',
      subject_type: 'subject',
      work_count: 3,
    },
  ],
};

const searchedQueries: string[] = [];

// The subject search is the only call that would leave the server
mock.method(
  OpenLibrary.prototype,
  'searchSubjects',
  async ({ query }: { query: string }) => {
    searchedQueries.push(query);
    return SEARCH_RESPONSE;
  }
);

const main = getSettings().main;
let app: Express;

async function login(email: string) {
  const priorLocalLogin = main.localLogin;
  main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent
      .post('/auth/local')
      .send({ email, password: 'test1234' });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    main.localLogin = priorLocalLogin;
  }
}

before(() => {
  app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/settings', settingsRoutes);
  app.use('/discover/books', discoverBooksRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  );
});

after(() => {
  mock.restoreAll();
});

setupTestDb();

beforeEach(() => {
  searchedQueries.length = 0;
});

describe('toSubjectSuggestions', () => {
  it('keeps one plain subject per key', () => {
    assert.deepStrictEqual(toSubjectSuggestions(SEARCH_RESPONSE.docs), [
      { subject: 'thriller', name: 'Thriller', workCount: 2383 },
      {
        subject: 'fiction_-_espionage__thriller',
        name: 'Fiction - Espionage / Thriller',
        workCount: 223,
      },
    ]);
  });
});

describe('GET /discover/books/subjects', () => {
  it('suggests matching subjects', async () => {
    const agent = await login('admin@seerr.dev');
    const res = await agent
      .get('/discover/books/subjects')
      .query({ query: 'thriller' });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(searchedQueries, ['thriller']);
    assert.deepStrictEqual(
      res.body.results.map((result: { subject: string }) => result.subject),
      ['thriller', 'fiction_-_espionage__thriller']
    );
  });

  it('reads queries encoded like the other searches', async () => {
    const agent = await login('admin@seerr.dev');
    const res = await agent
      .get('/discover/books/subjects')
      .query({ query: encodeURIComponent('science fiction') });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(searchedQueries, ['science fiction']);
  });

  it('skips the search for an empty query', async () => {
    const agent = await login('admin@seerr.dev');
    const res = await agent
      .get('/discover/books/subjects')
      .query({ query: '  ' });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { results: [] });
    assert.deepStrictEqual(searchedQueries, []);
  });
});

describe('book subject sliders', () => {
  it('are created with the subject key as their data', async () => {
    const agent = await login('admin@seerr.dev');
    const res = await agent.post('/settings/discover/add').send({
      type: DiscoverSliderType.BOOK_SUBJECT,
      title: 'Cooking',
      data: 'Science fiction',
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data, 'science_fiction');
    assert.strictEqual(res.body.isBuiltIn, false);

    const saved = await getRepository(DiscoverSlider).findOneByOrFail({
      id: res.body.id,
    });
    assert.strictEqual(saved.data, 'science_fiction');
  });

  it('are refused without a subject', async () => {
    const agent = await login('admin@seerr.dev');
    const before = await getRepository(DiscoverSlider).count();
    const res = await agent.post('/settings/discover/add').send({
      type: DiscoverSliderType.BOOK_SUBJECT,
      title: 'Nothing',
      data: '?!',
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(await getRepository(DiscoverSlider).count(), before);
  });

  it('are checked when edited', async () => {
    const agent = await login('admin@seerr.dev');
    const created = await agent.post('/settings/discover/add').send({
      type: DiscoverSliderType.BOOK_SUBJECT,
      title: 'Help',
      data: 'self-help',
    });

    const bad = await agent.put(`/settings/discover/${created.body.id}`).send({
      type: DiscoverSliderType.BOOK_SUBJECT,
      title: 'Help',
      data: '',
    });
    assert.strictEqual(bad.status, 400);

    const good = await agent.put(`/settings/discover/${created.body.id}`).send({
      type: DiscoverSliderType.BOOK_SUBJECT,
      title: 'Cooking',
      data: 'https://openlibrary.org/subjects/cooking',
    });
    assert.strictEqual(good.status, 200);
    assert.strictEqual(good.body.data, 'cooking');
  });

  it('leave every slider as it was when one in a batch is invalid', async () => {
    const agent = await login('admin@seerr.dev');
    const created = await agent.post('/settings/discover/add').send({
      type: DiscoverSliderType.BOOK_SUBJECT,
      title: 'Romance',
      data: 'romance',
    });
    const res = await agent.post('/settings/discover').send([
      {
        id: created.body.id,
        type: DiscoverSliderType.BOOK_SUBJECT,
        title: 'Romance',
        data: 'romance',
        enabled: true,
      },
      {
        type: DiscoverSliderType.BOOK_SUBJECT,
        title: 'Broken',
        data: '',
        enabled: true,
      },
    ]);

    assert.strictEqual(res.status, 400);

    const saved = await getRepository(DiscoverSlider).findOneByOrFail({
      id: created.body.id,
    });
    assert.strictEqual(saved.enabled, false);
  });
});
