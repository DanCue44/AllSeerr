import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getMediaLibraryQuery, getMediaLibrarySort } from './mediaLibrary';

const query = (options: Partial<Parameters<typeof getMediaLibraryQuery>[0]>) =>
  Object.fromEntries(
    new URLSearchParams(
      getMediaLibraryQuery({
        mediaType: 'music',
        take: 24,
        skip: 0,
        ...options,
      })
    )
  );

describe('getMediaLibraryQuery', () => {
  it('lists recently added titles in the media table order', () => {
    assert.deepEqual(query({}), {
      filter: 'allavailable',
      mediaType: 'music',
      take: '24',
      skip: '0',
    });
  });

  it('splits the sort into a field and a direction', () => {
    const params = query({ sortBy: 'releaseDate.asc', skip: 48 });

    assert.equal(params.sort, 'releaseDate');
    assert.equal(params.sortDirection, 'asc');
    assert.equal(params.skip, '48');
  });

  it('keeps each filter to its own library', () => {
    assert.equal(query({ albumType: 'ep' }).albumType, 'ep');
    assert.equal(query({ format: 'ebook' }).format, undefined);

    const books = query({
      mediaType: 'book',
      format: 'audiobook',
      albumType: 'ep',
    });
    assert.equal(books.format, 'audiobook');
    assert.equal(books.albumType, undefined);
  });

  it('ignores values from the address bar it does not know', () => {
    assert.equal(getMediaLibrarySort('rating.desc'), 'mediaAdded.desc');
    assert.equal(query({ sortBy: ['title.asc'] }).sort, undefined);
    assert.equal(query({ albumType: 'mixtape' }).albumType, undefined);
  });
});
