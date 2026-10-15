import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MediaType } from '@server/constants/media';
import {
  capEmailOverview,
  getEmailPosterUrl,
  splitEmailMediaTitle,
} from '@server/lib/email/media';

describe('getEmailPosterUrl', () => {
  it('asks TMDB for the larger poster', () => {
    assert.equal(
      getEmailPosterUrl(
        'https://image.tmdb.org/t/p/w600_and_h900_bestv2/yWHWC8fJRp2kLgiFrEa8o3krOH9.jpg'
      ),
      'https://image.tmdb.org/t/p/w780/yWHWC8fJRp2kLgiFrEa8o3krOH9.jpg'
    );
  });

  it('leaves other covers alone', () => {
    const cover = 'https://covers.openlibrary.org/b/id/11200092-L.jpg';

    assert.equal(getEmailPosterUrl(cover), cover);
    assert.equal(getEmailPosterUrl(undefined), undefined);
  });
});

describe('splitEmailMediaTitle', () => {
  it('moves the author of a book to its own line', () => {
    assert.deepEqual(
      splitEmailMediaTitle(
        'Project Hail Mary by Andy Weir (2021)',
        MediaType.BOOK
      ),
      { title: 'Project Hail Mary (2021)', byline: 'Andy Weir' }
    );
  });

  it('splits on the last "by" so titles can contain it', () => {
    assert.deepEqual(
      splitEmailMediaTitle('Stand by Me by Ben E. King', MediaType.MUSIC),
      { title: 'Stand by Me', byline: 'Ben E. King' }
    );
  });

  it('keeps movie and series subjects as they are', () => {
    assert.deepEqual(
      splitEmailMediaTitle('Stand by Me (1986)', MediaType.MOVIE),
      { title: 'Stand by Me (1986)' }
    );
    assert.deepEqual(splitEmailMediaTitle('Dune', MediaType.BOOK), {
      title: 'Dune',
    });
  });
});

describe('capEmailOverview', () => {
  it('keeps short overviews whole', () => {
    assert.equal(capEmailOverview('  A short summary.  '), 'A short summary.');
    assert.equal(capEmailOverview('   '), undefined);
  });

  it('cuts long overviews at a word with an ellipsis', () => {
    const text = capEmailOverview('one two three four five six', 15);

    assert.equal(text, 'one two three…');
  });
});
