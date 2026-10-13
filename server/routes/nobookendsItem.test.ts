import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';

import type { AudiobookshelfBookItem } from '@server/api/audiobookshelf';
import AudiobookshelfAPI from '@server/api/audiobookshelf';
import OpenLibrary from '@server/api/openlibrary';
import type { OlSearchDoc } from '@server/api/openlibrary/interfaces';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import {
  backfillAudiobookshelfItemIds,
  getAudiobookshelfLinks,
} from '@server/lib/audiobookshelfItem';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import authRoutes from '@server/routes/auth';
import nobookendsRoutes from '@server/routes/nobookends';
import { settleTestBackgroundTasks, setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';

const AUDIOBOOK_LIBRARY = '3f2b8c1e-6a4d-4e9b-8c7a-1d2e3f4a5b6c';
const EBOOK_LIBRARY = '9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c6b';
const AUDIOBOOK_ITEM = 'li_audio0001';
const EBOOK_ITEM = 'li_ebook0001';

// A made-up book kept in both libraries
const TITLE = 'The Lighthouse Keeper';
const AUTHOR = 'Mara Ellison';
const libraryItems: Record<string, AudiobookshelfBookItem[]> = {
  [AUDIOBOOK_LIBRARY]: [
    { id: AUDIOBOOK_ITEM, title: TITLE, authors: [AUTHOR], series: [] },
  ],
  [EBOOK_LIBRARY]: [
    { id: EBOOK_ITEM, title: TITLE, authors: [AUTHOR], series: [] },
  ],
};

let searchCalls = 0;
let workTitle: string | undefined = TITLE;
let olDocs: OlSearchDoc[] = [];

mock.method(
  AudiobookshelfAPI.prototype,
  'searchBooks',
  async (libraryId: string, query: string) => {
    searchCalls++;
    return (libraryItems[libraryId] ?? []).filter((item) =>
      item.title.toLowerCase().includes(query.toLowerCase())
    );
  }
);
mock.method(OpenLibrary.prototype, 'getWorkIsbns', async () => []);
mock.method(OpenLibrary.prototype, 'getWork', async (olId: string) => {
  if (!workTitle) {
    throw new Error('OpenLibrary is down');
  }
  return { key: `/works/${olId}`, title: workTitle };
});
mock.method(OpenLibrary.prototype, 'searchBooks', async () => ({
  numFound: olDocs.length,
  start: 0,
  docs: olDocs,
}));

let app: Express;

before(() => {
  app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/nobookends', isAuthenticated(), nobookendsRoutes);
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

setupTestDb();

beforeEach(() => {
  searchCalls = 0;
  workTitle = TITLE;
  olDocs = [];
  cacheManager.getCache('audiobookshelf').flush();
  const settings = getSettings();
  settings.main.localLogin = true;
  settings.audiobookshelf = {
    url: 'https://books.example.com',
    libraryId: AUDIOBOOK_LIBRARY,
    ebookLibraryId: EBOOK_LIBRARY,
    apiKey: 'abs-key',
    showNoBookEnds: true,
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

const login = async () => {
  const agent = request.agent(app);
  const res = await agent
    .post('/auth/local')
    .send({ email: 'demo@seerr.dev', password: 'test1234' });
  assert.strictEqual(res.status, 200);
  return agent;
};

describe('remembering Audiobookshelf items', () => {
  it('keeps the items a book page finds', async () => {
    const media = await saveBook();

    await getAudiobookshelfLinks(
      getSettings().audiobookshelf,
      { olId: 'OL1234567W', title: TITLE, authors: [AUTHOR] },
      media
    );
    await settleTestBackgroundTasks();

    const stored = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.strictEqual(stored.absEbookItemId, EBOOK_ITEM);
    assert.strictEqual(stored.absAudiobookItemId, AUDIOBOOK_ITEM);
    // Nothing a user sees changed
    assert.strictEqual(stored.updatedAt.getTime(), media.updatedAt.getTime());
  });

  it('forgets an item the library no longer has', async () => {
    const media = await saveBook({
      absEbookItemId: 'li_gone',
      statusAudio: MediaStatus.PROCESSING,
    });
    libraryItems[EBOOK_LIBRARY][0].title = 'Something Else Entirely';

    try {
      await getAudiobookshelfLinks(
        getSettings().audiobookshelf,
        { olId: 'OL1234567W', title: TITLE, authors: [AUTHOR] },
        media
      );
      await settleTestBackgroundTasks();
    } finally {
      libraryItems[EBOOK_LIBRARY][0].title = TITLE;
    }

    const stored = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.strictEqual(stored.absEbookItemId, null);
    assert.strictEqual(stored.absAudiobookItemId, null);
  });

  it('backfills a few books from the scan and waits before retrying', async () => {
    const media = await saveBook({ olId: 'OL7654321W' });
    const missing = await saveBook({ olId: 'OL1111111W' });
    const books = [
      { media, format: 'audiobook' as const, title: TITLE, authors: [AUTHOR] },
      { media, format: 'ebook' as const, title: TITLE, authors: [AUTHOR] },
      {
        media: missing,
        format: 'ebook' as const,
        title: 'A Book Nobody Has',
        authors: [AUTHOR],
      },
    ];

    assert.strictEqual(await backfillAudiobookshelfItemIds(books), 2);

    const stored = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.strictEqual(stored.absAudiobookItemId, AUDIOBOOK_ITEM);
    assert.strictEqual(stored.absEbookItemId, EBOOK_ITEM);

    // The book that was not found waits for a later scan
    const calls = searchCalls;
    cacheManager.getCache('audiobookshelf').flush();
    assert.strictEqual(await backfillAudiobookshelfItemIds(books), 0);
    assert.strictEqual(searchCalls, calls);
  });
});

describe('GET /nobookends/item/:absItemId', () => {
  it('finds the book of a known item', async () => {
    const media = await saveBook({
      absEbookItemId: EBOOK_ITEM,
      absAudiobookItemId: AUDIOBOOK_ITEM,
      statusAudio: MediaStatus.PROCESSING,
    });
    const agent = await login();

    const audiobook = await agent.get(`/nobookends/item/${AUDIOBOOK_ITEM}`);
    assert.strictEqual(audiobook.status, 200);
    assert.deepStrictEqual(audiobook.body, {
      olId: 'OL1234567W',
      format: 'audiobook',
      mediaId: media.id,
      title: TITLE,
      status: MediaStatus.AVAILABLE,
      statusAudio: MediaStatus.PROCESSING,
    });

    const ebook = await agent.get(`/nobookends/item/${EBOOK_ITEM}`);
    assert.strictEqual(ebook.body.format, 'ebook');

    // Known items never reach Audiobookshelf
    assert.strictEqual(searchCalls, 0);
  });

  it('answers without a title when OpenLibrary is down', async () => {
    await saveBook({ absEbookItemId: EBOOK_ITEM });
    workTitle = undefined;
    const agent = await login();

    const res = await agent.get(`/nobookends/item/${EBOOK_ITEM}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.title, null);
  });

  it('answers 404 for items of books AllSeerr does not know', async () => {
    await saveBook();
    const agent = await login();

    const res = await agent.get(`/nobookends/item/${EBOOK_ITEM}`);
    assert.strictEqual(res.status, 404);

    // A title of a book AllSeerr does not know finds nothing either
    olDocs = [{ key: '/works/OL9999999W', title: TITLE }];
    const hinted = await agent
      .get(`/nobookends/item/${EBOOK_ITEM}`)
      .query({ title: TITLE });
    assert.strictEqual(hinted.status, 404);
  });

  it('looks an unknown item up by its title and remembers it', async () => {
    const media = await saveBook();
    olDocs = [
      { key: '/works/OL9999999W', title: 'The Lighthouse', author_name: [] },
      {
        key: '/works/OL1234567W',
        title: TITLE,
        author_name: [AUTHOR],
      },
    ];
    const agent = await login();

    const res = await agent
      .get(`/nobookends/item/${AUDIOBOOK_ITEM}`)
      .query({ title: TITLE, author: AUTHOR });
    assert.strictEqual(res.status, 200, res.body.message);
    assert.strictEqual(res.body.olId, 'OL1234567W');
    assert.strictEqual(res.body.format, 'audiobook');
    assert.strictEqual(res.body.title, TITLE);

    const stored = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.strictEqual(stored.absAudiobookItemId, AUDIOBOOK_ITEM);
    assert.strictEqual(stored.absEbookItemId, EBOOK_ITEM);
  });

  it('turns away invalid ids and signed out callers', async () => {
    const signedOut = await request(app).get(`/nobookends/item/${EBOOK_ITEM}`);
    assert.strictEqual(signedOut.status, 403);

    const agent = await login();
    const invalid = await agent.get('/nobookends/item/li%20one');
    assert.strictEqual(invalid.status, 400);
  });
});
