import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  AllSettings,
  BookService,
  ChaptarrSettings,
  LazyLibrarianSettings,
} from '@server/lib/settings';
import { resolveBookService } from '@server/lib/settings';

const chaptarrServer = {
  id: 0,
  name: 'Books',
  hostname: 'chaptarr.example.com',
  port: 8789,
  apiKey: 'chaptarr-key',
  isDefault: true,
} as ChaptarrSettings;

const lazyLibrarian = {
  hostname: 'lazylibrarian.example.com',
  apiKey: 'lazylibrarian-key',
} as LazyLibrarianSettings;

const resolve = ({
  bookService,
  chaptarr = false,
  lazylibrarian = false,
}: {
  bookService?: BookService;
  chaptarr?: boolean;
  lazylibrarian?: boolean;
}) =>
  resolveBookService({
    main: { bookService } as AllSettings['main'],
    chaptarr: chaptarr ? [chaptarrServer] : [],
    lazylibrarian: lazylibrarian
      ? lazyLibrarian
      : ({ hostname: '', apiKey: '' } as LazyLibrarianSettings),
  });

describe('resolveBookService', () => {
  it('resolves the settings saved before TaleArr as it did', () => {
    assert.strictEqual(resolve({}), undefined);
    assert.strictEqual(resolve({ chaptarr: true }), 'chaptarr');
    assert.strictEqual(resolve({ lazylibrarian: true }), 'lazylibrarian');
    assert.strictEqual(
      resolve({ chaptarr: true, lazylibrarian: true }),
      'chaptarr'
    );
    assert.strictEqual(
      resolve({ bookService: 'chaptarr', chaptarr: true, lazylibrarian: true }),
      'chaptarr'
    );
    assert.strictEqual(
      resolve({
        bookService: 'lazylibrarian',
        chaptarr: true,
        lazylibrarian: true,
      }),
      'lazylibrarian'
    );
    assert.strictEqual(
      resolve({ bookService: 'lazylibrarian', chaptarr: true }),
      'chaptarr'
    );
    assert.strictEqual(
      resolve({ bookService: 'chaptarr', lazylibrarian: true }),
      'lazylibrarian'
    );
  });

  it('picks TaleArr when it is chosen and a Chaptarr server is set up', () => {
    assert.strictEqual(
      resolve({ bookService: 'talearr', chaptarr: true }),
      'talearr'
    );
    assert.strictEqual(
      resolve({ bookService: 'talearr', chaptarr: true, lazylibrarian: true }),
      'talearr'
    );
  });

  it('falls back like Chaptarr when TaleArr has no server yet', () => {
    assert.strictEqual(
      resolve({ bookService: 'talearr', lazylibrarian: true }),
      'lazylibrarian'
    );
    assert.strictEqual(resolve({ bookService: 'talearr' }), undefined);
  });
});
