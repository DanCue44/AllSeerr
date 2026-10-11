import type { LazyLibrarianBook } from '@server/api/lazylibrarian';
import LazyLibrarianAPI from '@server/api/lazylibrarian';
import OpenLibrary from '@server/api/openlibrary';
import type { OlWork } from '@server/api/openlibrary/interfaces';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaRequest from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { lazyLibrarianScanner } from '@server/lib/scanners/lazylibrarian';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import { runWithMockTimers } from '@server/test/runWithMockTimers';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

const FOX_ID = 'OL45804W';
const CHARLIE_ID = 'OL45890W';
const MATILDA_ID = 'OL45900W';
const GOOGLE_BOOK_ID = 'gb-witches-1983';

let books: LazyLibrarianBook[] = [];
let getAllBooksCalls = 0;
mock.method(LazyLibrarianAPI.prototype, 'getAllBooks', async () => {
  getAllBooksCalls++;
  return books;
});

mock.method(MediaRequest, 'sendNotification', async () => undefined);

// Approved requests are sent to LazyLibrarian and completed ones announced
mock.method(LazyLibrarianAPI.prototype, 'getBook', async (bookId: string) =>
  books.find((book) => book.bookId === bookId)
);
mock.method(LazyLibrarianAPI.prototype, 'addBook', async () => undefined);
mock.method(LazyLibrarianAPI.prototype, 'queueBook', async () => undefined);
mock.method(LazyLibrarianAPI.prototype, 'searchBook', async () => undefined);
mock.method(
  OpenLibrary.prototype,
  'getWork',
  async (): Promise<OlWork> => ({
    key: `/works/${FOX_ID}`,
    title: 'Fantastic Mr Fox',
    type: { key: '/type/work' },
  })
);
mock.method(OpenLibrary.prototype, 'getWorkSummary', async () => undefined);

setupTestDb();

function configureLazyLibrarian(configured = true): void {
  const lazyLibrarian = getSettings().lazylibrarian as Record<string, unknown>;

  for (const key of Object.keys(lazyLibrarian)) {
    delete lazyLibrarian[key];
  }

  if (configured) {
    Object.assign(lazyLibrarian, {
      hostname: 'LazyLibrarian',
      apiKey: 'test-key',
    });
  }
}

function fakeBook(overrides: Partial<LazyLibrarianBook>): LazyLibrarianBook {
  return {
    bookId: FOX_ID,
    title: 'Fantastic Mr Fox',
    status: 'Skipped',
    audioStatus: 'Skipped',
    ...overrides,
  };
}

describe('LazyLibrarian Scanner', () => {
  beforeEach(() => {
    books = [];
    getAllBooksCalls = 0;
    configureLazyLibrarian();
  });

  afterEach(() => {
    configureLazyLibrarian(false);
  });

  it('saves LazyLibrarian books with a status per format', async () => {
    books = [
      fakeBook({ bookId: FOX_ID, status: 'Open', audioStatus: 'Wanted' }),
      fakeBook({
        bookId: CHARLIE_ID,
        title: 'Charlie and the Chocolate Factory',
        status: 'Snatched',
        audioStatus: 'Have',
      }),
      // Skipped in both formats, never asked for
      fakeBook({ bookId: MATILDA_ID, title: 'Matilda' }),
      // Not an OpenLibrary work, so there is nothing to key it on
      fakeBook({
        bookId: GOOGLE_BOOK_ID,
        title: 'The Witches',
        status: 'Have',
      }),
    ];

    await runWithMockTimers(() => lazyLibrarianScanner.run());

    const mediaRepository = getRepository(Media);
    const fox = await mediaRepository.findOneOrFail({
      where: { olId: FOX_ID, mediaType: MediaType.BOOK },
    });
    assert.strictEqual(fox.status, MediaStatus.AVAILABLE);
    assert.strictEqual(fox.statusAudio, MediaStatus.PROCESSING);
    assert.strictEqual(fox.externalServiceSlug, FOX_ID);

    const charlie = await mediaRepository.findOneOrFail({
      where: { olId: CHARLIE_ID },
    });
    assert.strictEqual(charlie.status, MediaStatus.PROCESSING);
    assert.strictEqual(charlie.statusAudio, MediaStatus.AVAILABLE);

    assert.strictEqual(
      await mediaRepository.count({ where: { olId: MATILDA_ID } }),
      0
    );
    assert.strictEqual(
      await mediaRepository.count({
        where: { externalServiceSlug: GOOGLE_BOOK_ID },
      }),
      0
    );
  });

  it('matches a requested book on its remembered LazyLibrarian id', async () => {
    const mediaRepository = getRepository(Media);
    await mediaRepository.save(
      new Media({
        olId: FOX_ID,
        mediaType: MediaType.BOOK,
        statusAudio: MediaStatus.PROCESSING,
        externalServiceSlug: GOOGLE_BOOK_ID,
      })
    );
    books = [fakeBook({ bookId: GOOGLE_BOOK_ID, audioStatus: 'Open' })];

    await runWithMockTimers(() => lazyLibrarianScanner.run());

    const fox = await mediaRepository.findOneOrFail({
      where: { olId: FOX_ID },
    });
    assert.strictEqual(fox.statusAudio, MediaStatus.AVAILABLE);
    assert.strictEqual(fox.status, MediaStatus.UNKNOWN);
  });

  it('leaves a declined format alone while LazyLibrarian still wants it', async () => {
    const mediaRepository = getRepository(Media);
    await mediaRepository.save(
      new Media({
        olId: FOX_ID,
        mediaType: MediaType.BOOK,
        status: MediaStatus.DELETED,
      })
    );
    books = [fakeBook({ status: 'Wanted' })];

    await runWithMockTimers(() => lazyLibrarianScanner.run());

    const fox = await mediaRepository.findOneOrFail({
      where: { olId: FOX_ID },
    });
    assert.strictEqual(fox.status, MediaStatus.DELETED);
  });

  it('completes the request of a format that finished downloading', async () => {
    const mediaRepository = getRepository(Media);
    const requestRepository = getRepository(MediaRequest);
    const requestedBy = await getRepository(User).findOneOrFail({
      where: { email: 'demo@seerr.dev' },
    });
    books = [fakeBook({ status: 'Snatched', audioStatus: 'Wanted' })];
    const media = await mediaRepository.save(
      new Media({
        olId: FOX_ID,
        mediaType: MediaType.BOOK,
        status: MediaStatus.PROCESSING,
        statusAudio: MediaStatus.PROCESSING,
        externalServiceSlug: FOX_ID,
      })
    );
    const ebookRequest = await requestRepository.save(
      new MediaRequest({
        type: MediaType.BOOK,
        status: MediaRequestStatus.APPROVED,
        media,
        requestedBy,
        isAudiobook: false,
      })
    );
    const audiobookRequest = await requestRepository.save(
      new MediaRequest({
        type: MediaType.BOOK,
        status: MediaRequestStatus.APPROVED,
        media,
        requestedBy,
        isAudiobook: true,
      })
    );
    books = [fakeBook({ status: 'Snatched', audioStatus: 'Open' })];

    await runWithMockTimers(() => lazyLibrarianScanner.run());

    const audiobook = await requestRepository.findOneOrFail({
      where: { id: audiobookRequest.id },
    });
    assert.strictEqual(audiobook.status, MediaRequestStatus.COMPLETED);

    const ebook = await requestRepository.findOneOrFail({
      where: { id: ebookRequest.id },
    });
    assert.strictEqual(ebook.status, MediaRequestStatus.APPROVED);
  });

  it('does nothing while LazyLibrarian is not configured', async () => {
    configureLazyLibrarian(false);
    books = [fakeBook({ status: 'Open' })];

    await runWithMockTimers(() => lazyLibrarianScanner.run());

    assert.strictEqual(getAllBooksCalls, 0);
    assert.strictEqual(lazyLibrarianScanner.status().running, false);
  });
});
