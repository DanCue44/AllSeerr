import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import type {
  LazyLibrarianBook,
  LazyLibrarianBookType,
  LazyLibrarianSearchResult,
} from '@server/api/lazylibrarian';
import LazyLibrarianAPI from '@server/api/lazylibrarian';
import OpenLibrary from '@server/api/openlibrary';
import type { OlSearchDoc, OlWork } from '@server/api/openlibrary/interfaces';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { pickLazyLibrarianMatch } from '@server/lib/lazyLibrarianRequests';
import { Notification } from '@server/lib/notifications';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import authRoutes from '@server/routes/auth';
import requestRoutes from '@server/routes/request';
import { settleTestBackgroundTasks, setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';

const WORK_ID = 'OL45804W';
const MERGED_WORK_ID = 'OL45883W';
const GOOGLE_BOOK_ID = 'gb-fox-1970';

const sendNotificationMock = mock.method(
  MediaRequest,
  'sendNotification',
  async () => undefined
).mock;

mock.method(
  OpenLibrary.prototype,
  'getWork',
  async (): Promise<OlWork> => ({
    key: `/works/${WORK_ID}`,
    title: 'Fantastic Mr Fox',
    type: { key: '/type/work' },
    authors: [{ author: { key: '/authors/OL34184A' } }],
  })
);
mock.method(
  OpenLibrary.prototype,
  'getWorkSummary',
  async (): Promise<OlSearchDoc> => ({
    key: `/works/${WORK_ID}`,
    title: 'Fantastic Mr Fox',
    author_name: ['Roald Dahl'],
    author_key: ['OL34184A'],
    first_publish_year: 1970,
  })
);

// LazyLibrarian's library, as getAllBooks lists it
let library: LazyLibrarianBook[] = [];
let addBookCalls: { bookId: string; source?: string }[] = [];
let queueCalls: [string, LazyLibrarianBookType][] = [];
let searchCalls: [string, LazyLibrarianBookType][] = [];
let findBookCalls: string[] = [];
// Whether LazyLibrarian can add books by their OpenLibrary work id, which it
// cannot when it uses another book source
let acceptsOpenLibraryIds = true;
let searchResults: LazyLibrarianSearchResult[] = [];
let queueImpl: () => Promise<void>;

const libraryBook = (bookId: string): LazyLibrarianBook => ({
  bookId,
  title: 'Fantastic Mr Fox',
  status: 'Skipped',
  audioStatus: 'Skipped',
});

mock.method(LazyLibrarianAPI.prototype, 'getAllBooks', async () => [
  ...library,
]);
mock.method(LazyLibrarianAPI.prototype, 'getBook', async (bookId: string) =>
  library.find((book) => book.bookId === bookId)
);
mock.method(
  LazyLibrarianAPI.prototype,
  'addBook',
  async (bookId: string, { source }: { source?: string } = {}) => {
    addBookCalls.push({ bookId, source });

    if (source === 'OpenLibrary' && !acceptsOpenLibraryIds) {
      return;
    }

    library.push(libraryBook(bookId));
  }
);
mock.method(LazyLibrarianAPI.prototype, 'findBook', async (name: string) => {
  findBookCalls.push(name);
  return searchResults;
});
mock.method(
  LazyLibrarianAPI.prototype,
  'queueBook',
  async (bookId: string, type: LazyLibrarianBookType) => {
    queueCalls.push([bookId, type]);
    return queueImpl();
  }
);
mock.method(
  LazyLibrarianAPI.prototype,
  'searchBook',
  async (bookId: string, type: LazyLibrarianBookType) => {
    searchCalls.push([bookId, type]);
  }
);

function configureLazyLibrarian(configured = true): void {
  const lazyLibrarian = getSettings().lazylibrarian as Record<string, unknown>;

  for (const key of Object.keys(lazyLibrarian)) {
    delete lazyLibrarian[key];
  }

  if (configured) {
    Object.assign(lazyLibrarian, {
      hostname: 'LazyLibrarian',
      port: 5299,
      urlBase: '/request',
      apiKey: 'test-key',
    });
  }
}

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
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
    const agent = request.agent(app);
    const res = await agent
      .post('/auth/local')
      .send({ email, password: 'test1234' });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

// The LazyLibrarian request runs detached from the request, like Radarr's
async function waitFor(check: () => Promise<boolean> | boolean) {
  // The detached work usually settles the check, polling covers the rest
  await settleTestBackgroundTasks();
  for (let i = 0; i < 50; i++) {
    if (await check()) {
      await settleTestBackgroundTasks();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('Condition was not met in time');
}

const findBookMedia = () =>
  getRepository(Media).findOneOrFail({
    where: { olId: WORK_ID, mediaType: MediaType.BOOK },
  });

before(() => {
  app = createApp();
});

setupTestDb();

beforeEach(() => {
  library = [];
  addBookCalls = [];
  queueCalls = [];
  searchCalls = [];
  findBookCalls = [];
  searchResults = [];
  acceptsOpenLibraryIds = true;
  queueImpl = async () => undefined;
  sendNotificationMock.resetCalls();
  configureLazyLibrarian();
});

afterEach(() => {
  configureLazyLibrarian(false);
});

describe('POST /request (books)', () => {
  it('adds an auto-approved ebook to LazyLibrarian and searches for it', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const res = await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.status, MediaRequestStatus.APPROVED);
    assert.strictEqual(res.body.type, MediaType.BOOK);
    assert.strictEqual(res.body.isAudiobook, false);

    await waitFor(() => searchCalls.length > 0);

    assert.deepStrictEqual(addBookCalls, [
      { bookId: WORK_ID, source: 'OpenLibrary' },
    ]);
    assert.deepStrictEqual(queueCalls, [[WORK_ID, 'eBook']]);
    assert.deepStrictEqual(searchCalls, [[WORK_ID, 'eBook']]);

    await waitFor(
      async () => (await findBookMedia()).externalServiceSlug === WORK_ID
    );
    const media = await findBookMedia();
    assert.strictEqual(media.tmdbId, null);
    assert.strictEqual(media.status, MediaStatus.PROCESSING);
    assert.strictEqual(media.statusAudio, MediaStatus.UNKNOWN);
  });

  it('requests the audiobook on its own', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const ebook = await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID });
    await waitFor(() => searchCalls.length === 1);

    const audiobook = await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID, isAudiobook: true });

    assert.strictEqual(ebook.status, 201);
    assert.strictEqual(audiobook.status, 201);
    assert.strictEqual(audiobook.body.isAudiobook, true);
    assert.strictEqual(audiobook.body.media.id, ebook.body.media.id);

    await waitFor(() => searchCalls.length === 2);

    // The book is only added once, by the first request
    assert.strictEqual(addBookCalls.length, 1);
    assert.deepStrictEqual(queueCalls, [
      [WORK_ID, 'eBook'],
      [WORK_ID, 'AudioBook'],
    ]);

    const media = await findBookMedia();
    assert.strictEqual(media.status, MediaStatus.PROCESSING);
    assert.strictEqual(media.statusAudio, MediaStatus.PROCESSING);
  });

  it('blocks a second request for the same format', async () => {
    const agent = await loginAs('demo@seerr.dev');
    await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID, isAudiobook: true });
    const res = await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID, isAudiobook: true });

    assert.strictEqual(res.status, 409);
  });

  it('keeps a request pending for a user without auto-approve', async () => {
    const agent = await loginAs('demo@seerr.dev');
    const res = await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID, isAudiobook: true });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.status, MediaRequestStatus.PENDING);
    assert.strictEqual(addBookCalls.length, 0);

    const media = await findBookMedia();
    assert.strictEqual(media.status, MediaStatus.UNKNOWN);
    assert.strictEqual(media.statusAudio, MediaStatus.PENDING);
  });

  it('sends a pending book to LazyLibrarian once it is approved', async () => {
    const demo = await loginAs('demo@seerr.dev');
    const created = await demo
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID, isAudiobook: true });

    const admin = await loginAs('admin@seerr.dev');
    const res = await admin.post(`/request/${created.body.id}/approve`);

    assert.strictEqual(res.status, 200);
    await waitFor(() => searchCalls.length > 0);
    assert.deepStrictEqual(searchCalls, [[WORK_ID, 'AudioBook']]);
  });

  it('requests a merged work as the work it was merged into', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const res = await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: MERGED_WORK_ID });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.media.olId, WORK_ID);
  });

  it('uses a book LazyLibrarian already has without adding it', async () => {
    library = [libraryBook(WORK_ID)];

    const agent = await loginAs('admin@seerr.dev');
    await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID });

    await waitFor(() => searchCalls.length > 0);
    assert.strictEqual(addBookCalls.length, 0);
    assert.deepStrictEqual(queueCalls, [[WORK_ID, 'eBook']]);
  });

  it('finds the book by title and author when LazyLibrarian uses another source', async () => {
    acceptsOpenLibraryIds = false;
    searchResults = [
      {
        bookId: 'gb-fox-play',
        title: 'Fantastic Mr Fox: A Play',
        authorName: 'Sally Reid',
        score: 95,
      },
      {
        bookId: GOOGLE_BOOK_ID,
        title: 'Fantastic Mr. Fox',
        authorName: 'Dahl, Roald',
        score: 88,
      },
    ];

    const agent = await loginAs('admin@seerr.dev');
    await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID });

    await waitFor(() => searchCalls.length > 0);

    assert.deepStrictEqual(findBookCalls, ['Fantastic Mr Fox Roald Dahl']);
    assert.deepStrictEqual(addBookCalls, [
      { bookId: WORK_ID, source: 'OpenLibrary' },
      { bookId: GOOGLE_BOOK_ID, source: undefined },
    ]);
    assert.deepStrictEqual(queueCalls, [[GOOGLE_BOOK_ID, 'eBook']]);

    await waitFor(
      async () => (await findBookMedia()).externalServiceSlug === GOOGLE_BOOK_ID
    );
  });

  it('marks the request failed when LazyLibrarian cannot find the book', async () => {
    acceptsOpenLibraryIds = false;

    const agent = await loginAs('admin@seerr.dev');
    const res = await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID });

    assert.strictEqual(res.status, 201);

    await waitFor(() =>
      sendNotificationMock.calls.some(
        (call) => call.arguments[2] === Notification.MEDIA_FAILED
      )
    );

    const saved = await getRepository(MediaRequest).findOneOrFail({
      where: { id: res.body.id },
    });
    assert.strictEqual(saved.status, MediaRequestStatus.FAILED);
    assert.strictEqual(queueCalls.length, 0);
  });

  it('marks the request failed when LazyLibrarian refuses to queue it', async () => {
    queueImpl = async () => {
      throw new Error('Invalid id');
    };

    const agent = await loginAs('admin@seerr.dev');
    const res = await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID });

    await waitFor(async () => {
      const saved = await getRepository(MediaRequest).findOneOrFail({
        where: { id: res.body.id },
      });
      return saved.status === MediaRequestStatus.FAILED;
    });
  });

  it('leaves the request approved while LazyLibrarian is not configured', async () => {
    configureLazyLibrarian(false);

    const agent = await loginAs('admin@seerr.dev');
    const res = await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.status, MediaRequestStatus.APPROVED);
    assert.strictEqual(addBookCalls.length, 0);
  });

  it('requires the request permission and refuses 4K', async () => {
    const demo = await getRepository(User).findOneOrFail({
      where: { email: 'demo@seerr.dev' },
    });
    demo.permissions = Permission.REQUEST_MOVIE;
    await getRepository(User).save(demo);

    const agent = await loginAs('demo@seerr.dev');
    const denied = await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID });
    assert.strictEqual(denied.status, 403);

    demo.permissions = Permission.REQUEST;
    await getRepository(User).save(demo);

    const in4k = await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID, is4k: true });
    assert.strictEqual(in4k.status, 403);
  });
});

describe('book request statuses', () => {
  it('completes only the audiobook request once the audiobook is available', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const ebook = await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID });
    const audiobook = await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID, isAudiobook: true });
    await waitFor(() => searchCalls.length === 2);

    const media = await findBookMedia();
    media.statusAudio = MediaStatus.AVAILABLE;
    await getRepository(Media).save(media);

    const requestRepository = getRepository(MediaRequest);
    await waitFor(
      async () =>
        (
          await requestRepository.findOneOrFail({
            where: { id: audiobook.body.id },
          })
        ).status === MediaRequestStatus.COMPLETED
    );

    const ebookRequest = await requestRepository.findOneOrFail({
      where: { id: ebook.body.id },
    });
    assert.strictEqual(ebookRequest.status, MediaRequestStatus.APPROVED);
  });

  it('resets only the declined format', async () => {
    const demo = await loginAs('demo@seerr.dev');
    await demo
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID });
    const audiobook = await demo
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID, isAudiobook: true });

    const admin = await loginAs('admin@seerr.dev');
    const res = await admin.post(`/request/${audiobook.body.id}/decline`);

    assert.strictEqual(res.status, 200);

    const media = await findBookMedia();
    assert.strictEqual(media.status, MediaStatus.PENDING);
    assert.strictEqual(media.statusAudio, MediaStatus.UNKNOWN);
  });

  it('resets the format of a deleted request', async () => {
    const demo = await loginAs('demo@seerr.dev');
    await demo
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID });
    const audiobook = await demo
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID, isAudiobook: true });

    const res = await demo.delete(`/request/${audiobook.body.id}`);
    assert.strictEqual(res.status, 204);

    const media = await findBookMedia();
    assert.strictEqual(media.status, MediaStatus.PENDING);
    assert.strictEqual(media.statusAudio, MediaStatus.UNKNOWN);
  });

  it('lists and counts book requests', async () => {
    const agent = await loginAs('admin@seerr.dev');
    await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID, isAudiobook: true });

    const list = await agent
      .get('/request')
      .query({ mediaType: 'book', filter: 'all' });
    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.body.results.length, 1);
    assert.strictEqual(list.body.results[0].isAudiobook, true);
    assert.strictEqual(list.body.results[0].canRemove, false);

    const count = await agent.get('/request/count');
    assert.strictEqual(count.body.book, 1);
    assert.strictEqual(count.body.processing, 1);
  });
});

describe('pickLazyLibrarianMatch', () => {
  const results: LazyLibrarianSearchResult[] = [
    { bookId: '1', title: 'The Hobbit', authorName: 'Someone Else', score: 99 },
    {
      bookId: '2',
      title: 'Hobbit (Illustrated)',
      authorName: 'J. R. R. Tolkien',
      score: 80,
    },
    {
      bookId: '3',
      title: 'The Hobbit, or There and Back Again',
      authorName: 'J.R.R. Tolkien',
      score: 93,
    },
  ];

  it('prefers the same title by the same author', () => {
    assert.strictEqual(
      pickLazyLibrarianMatch(results, {
        title: 'The Hobbit',
        authorName: 'J.R.R. Tolkien',
      })?.bookId,
      '2'
    );
  });

  it('falls back to a confident match by the same author', () => {
    assert.strictEqual(
      pickLazyLibrarianMatch(results, {
        title: 'The Hobbit or There and Back',
        authorName: 'Tolkien',
      })?.bookId,
      '3'
    );
  });

  it('finds nothing by another author', () => {
    assert.strictEqual(
      pickLazyLibrarianMatch(results, {
        title: 'The Hobbit',
        authorName: 'Roald Dahl',
      }),
      undefined
    );
  });
});
