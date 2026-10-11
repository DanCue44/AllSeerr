import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DiscoverSliderType } from '@server/constants/discover';
import { prepareCustomSliderData } from '@server/lib/discoverSliders';

describe('prepareCustomSliderData', () => {
  it('stores the subject of a book subject slider as its key', () => {
    assert.deepStrictEqual(
      prepareCustomSliderData(
        DiscoverSliderType.BOOK_SUBJECT,
        'Science fiction'
      ),
      { valid: true, data: 'science_fiction' }
    );
  });

  it('rejects a book subject slider without a subject', () => {
    for (const data of [undefined, '', '   ', '?!']) {
      const prepared = prepareCustomSliderData(
        DiscoverSliderType.BOOK_SUBJECT,
        data
      );

      assert.strictEqual(prepared.valid, false, `data ${data}`);
    }
  });

  it('leaves the data of other sliders alone', () => {
    assert.deepStrictEqual(
      prepareCustomSliderData(DiscoverSliderType.TMDB_SEARCH, 'Star Wars'),
      { valid: true, data: 'Star Wars' }
    );
    assert.deepStrictEqual(
      prepareCustomSliderData(DiscoverSliderType.RECENTLY_ADDED, undefined),
      { valid: true, data: undefined }
    );
  });
});
