import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rankCombinedResults, titleMatchTier } from '@server/lib/searchRank';
import type { Results } from '@server/models/Search';

const album = (title: string): Results => ({
  id: title,
  mediaType: 'album',
  title,
});
const artist = (name: string): Results => ({
  id: name,
  mediaType: 'artist',
  name,
});
const comic = (title: string): Results => ({
  id: title,
  mediaType: 'comic',
  kind: 'manga',
  title,
  isAdult: false,
  posterPath: null,
});

describe('titleMatchTier', () => {
  it('ranks the same words above a title that starts with them', () => {
    assert.strictEqual(
      titleMatchTier('witch hat atelier', 'Witch Hat Atelier'),
      3
    );
    assert.strictEqual(
      titleMatchTier('witch hat atelier', 'Witch Hat Atelier Kitchen'),
      2
    );
    assert.strictEqual(
      titleMatchTier('witch hat atelier', 'The Atelier of the Witch Hat'),
      1
    );
    assert.strictEqual(titleMatchTier('witch hat atelier', 'Witch'), 0);
    assert.strictEqual(titleMatchTier('', 'Witch'), 0);
  });
});

describe('rankCombinedResults', () => {
  it('puts close title matches first across kinds, keeping order within a tier', () => {
    const ranked = rankCombinedResults('witch hat atelier', [
      artist('Witch'),
      album('Hat Trick'),
      album('Atelier Witch Hat'),
      comic('Witch Hat Atelier Kitchen'),
      comic('Witch Hat Atelier'),
    ]);

    assert.deepStrictEqual(
      ranked.map((result) => result.id),
      [
        'Witch Hat Atelier',
        'Witch Hat Atelier Kitchen',
        'Atelier Witch Hat',
        'Witch',
        'Hat Trick',
      ]
    );
  });
});
