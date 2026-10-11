import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LEGACY_SPACE_REDIRECTS,
  getAvailableSpaces,
  getPhoneTabs,
  getSpaceForMediaType,
  getSpaceForPath,
  getSpaceSectionForPath,
  getSpaceSectionPath,
} from './spaces';

describe('getSpaceForPath', () => {
  it('maps the spaces and their sections', () => {
    assert.equal(getSpaceForPath('/movies'), 'movies');
    assert.equal(getSpaceForPath('/movies/browse'), 'movies');
    assert.equal(getSpaceForPath('/series/upcoming'), 'series');
    assert.equal(getSpaceForPath('/music/library'), 'music');
    assert.equal(getSpaceForPath('/books'), 'books');
  });

  it('lights the space on title pages', () => {
    assert.equal(getSpaceForPath('/movie/[movieId]'), 'movies');
    assert.equal(getSpaceForPath('/movie/603'), 'movies');
    assert.equal(getSpaceForPath('/collection/[collectionId]'), 'movies');
    assert.equal(getSpaceForPath('/tv/[tvId]/season/1'), 'series');
    assert.equal(getSpaceForPath('/music/[musicId]'), 'music');
    assert.equal(getSpaceForPath('/artist/[artistId]'), 'music');
    assert.equal(getSpaceForPath('/book/[bookId]'), 'books');
    assert.equal(getSpaceForPath('/author/[authorId]'), 'books');
  });

  it('keeps the older browse pages in their space', () => {
    assert.equal(getSpaceForPath('/discover/movies/genre/[genreId]'), 'movies');
    assert.equal(getSpaceForPath('/discover/tv/upcoming'), 'series');
    assert.equal(getSpaceForPath('/discover/music/genre/[genre]'), 'music');
    assert.equal(getSpaceForPath('/discover/books/popular'), 'books');
  });

  it('leaves other pages alone', () => {
    assert.equal(getSpaceForPath('/'), undefined);
    assert.equal(getSpaceForPath('/discover/trending'), undefined);
    assert.equal(getSpaceForPath('/library/movies'), undefined);
    assert.equal(getSpaceForPath('/requests'), undefined);
    assert.equal(getSpaceForPath('/moviesx'), undefined);
    assert.equal(getSpaceForPath('/person/[personId]'), undefined);
  });
});

describe('getSpaceSectionForPath', () => {
  it('finds the section of a space page', () => {
    assert.deepEqual(getSpaceSectionForPath('/movies'), {
      space: 'movies',
      section: 'discover',
    });
    assert.deepEqual(getSpaceSectionForPath('/series/browse'), {
      space: 'series',
      section: 'browse',
    });
    assert.deepEqual(getSpaceSectionForPath('/music/upcoming'), {
      space: 'music',
      section: 'upcoming',
    });
    assert.deepEqual(getSpaceSectionForPath('/books/upcoming'), {
      space: 'books',
      section: 'upcoming',
    });
  });

  it('ignores title pages and sections a space does not have', () => {
    assert.equal(getSpaceSectionForPath('/music/[musicId]'), undefined);
    assert.equal(getSpaceSectionForPath('/movie/603'), undefined);
  });
});

describe('getSpaceSectionPath', () => {
  it('builds the section paths', () => {
    assert.equal(getSpaceSectionPath('movies', 'discover'), '/movies');
    assert.equal(getSpaceSectionPath('series', 'browse'), '/series/browse');
    assert.equal(getSpaceSectionPath('books', 'library'), '/books/library');
  });
});

describe('getSpaceForMediaType', () => {
  it('maps media types to spaces', () => {
    assert.equal(getSpaceForMediaType('movie'), 'movies');
    assert.equal(getSpaceForMediaType('tv'), 'series');
    assert.equal(getSpaceForMediaType('music'), 'music');
    assert.equal(getSpaceForMediaType('book'), 'books');
  });
});

describe('LEGACY_SPACE_REDIRECTS', () => {
  it('sends the old browse pages to their space', () => {
    assert.deepEqual(LEGACY_SPACE_REDIRECTS, {
      '/discover/movies': '/movies/browse',
      '/discover/tv': '/series/browse',
      '/discover/music': '/music',
      '/discover/books': '/books',
    });
  });
});

describe('getAvailableSpaces', () => {
  it('offers music and books only when they are set up', () => {
    assert.deepEqual(
      getAvailableSpaces({ musicEnabled: false, booksEnabled: false }),
      ['movies', 'series']
    );
    assert.deepEqual(
      getAvailableSpaces({ musicEnabled: true, booksEnabled: false }),
      ['movies', 'series', 'music']
    );
    assert.deepEqual(
      getAvailableSpaces({ musicEnabled: true, booksEnabled: true }),
      ['movies', 'series', 'music', 'books']
    );
  });
});

describe('getPhoneTabs', () => {
  it('gives every space a tab when all four are set up', () => {
    assert.deepEqual(getPhoneTabs(['movies', 'series', 'music', 'books']), [
      'home',
      'movies',
      'series',
      'music',
      'books',
    ]);
  });

  it('fills free slots with Requests, then Library', () => {
    assert.deepEqual(getPhoneTabs(['movies', 'series', 'music']), [
      'home',
      'movies',
      'series',
      'music',
      'requests',
    ]);
    assert.deepEqual(getPhoneTabs(['movies', 'series']), [
      'home',
      'movies',
      'series',
      'requests',
      'library',
    ]);
  });
});
