import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getBookSubjectSliderUrls } from './bookSubjectSlider';

describe('getBookSubjectSliderUrls', () => {
  it('loads the subject books and links to the subject in the books space', () => {
    assert.deepStrictEqual(getBookSubjectSliderUrls('science_fiction'), {
      url: '/api/v1/discover/books/subject/science_fiction',
      linkUrl: '/books/browse?list=subject&subject=science_fiction',
    });
  });

  it('keeps hyphenated keys intact', () => {
    assert.strictEqual(
      getBookSubjectSliderUrls('self-help').linkUrl,
      '/books/browse?list=subject&subject=self-help'
    );
  });
});
