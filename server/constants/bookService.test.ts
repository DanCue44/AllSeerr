import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  bookArrName,
  bookServiceName,
  isBookService,
  isTalearrService,
  usesChaptarr,
} from '@server/constants/bookService';

describe('book services', () => {
  it('sends Chaptarr and Talearr requests through the Chaptarr servers', () => {
    assert.strictEqual(usesChaptarr('chaptarr'), true);
    assert.strictEqual(usesChaptarr('talearr'), true);
    assert.strictEqual(usesChaptarr('lazylibrarian'), false);
    assert.strictEqual(usesChaptarr(undefined), false);
  });

  it('turns on the Talearr extras for Talearr only', () => {
    assert.strictEqual(isTalearrService('talearr'), true);
    assert.strictEqual(isTalearrService('chaptarr'), false);
    assert.strictEqual(isTalearrService('lazylibrarian'), false);
    assert.strictEqual(isTalearrService(undefined), false);
  });

  it('names each service', () => {
    assert.strictEqual(bookServiceName('chaptarr'), 'Chaptarr');
    assert.strictEqual(bookServiceName('talearr'), 'Talearr');
    assert.strictEqual(bookServiceName('lazylibrarian'), 'LazyLibrarian');
    assert.strictEqual(bookArrName('talearr'), 'Talearr');
    assert.strictEqual(bookArrName('chaptarr'), 'Chaptarr');
    // As before, books without Chaptarr went to LazyLibrarian
    assert.strictEqual(bookArrName(undefined), 'LazyLibrarian');
  });

  it('only accepts known services', () => {
    assert.strictEqual(isBookService('chaptarr'), true);
    assert.strictEqual(isBookService('talearr'), true);
    assert.strictEqual(isBookService('lazylibrarian'), true);
    assert.strictEqual(isBookService('readarr'), false);
    assert.strictEqual(isBookService('Talearr'), false);
    assert.strictEqual(isBookService(1), false);
  });
});
