import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getBookFormatName } from '@server/lib/bookNotifications';

describe('getBookFormatName', () => {
  it('names ebooks and audiobooks', () => {
    assert.strictEqual(getBookFormatName(false), 'Ebook');
    assert.strictEqual(getBookFormatName(true), 'Audiobook');
    assert.strictEqual(getBookFormatName(true, null), 'Audiobook');
  });

  it('names the recording a recording request is for', () => {
    assert.strictEqual(
      getBookFormatName(true, 'unabridged'),
      'Unabridged Audiobook'
    );
    assert.strictEqual(
      getBookFormatName(true, 'abridged'),
      'Abridged Audiobook'
    );
    assert.strictEqual(
      getBookFormatName(true, 'narrator'),
      'Audiobook Recording'
    );
    assert.strictEqual(
      getBookFormatName(true, 'edition'),
      'Audiobook Recording'
    );
  });
});
