import { MediaStatus } from '@server/constants/media';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getBookFormatIndicator,
  getInitialBookFormat,
  needsEditionLookup,
} from './bookStatus';

describe('getInitialBookFormat', () => {
  it('uses the configured default when both formats can be requested', () => {
    assert.equal(getInitialBookFormat('both', true, true), 'both');
    assert.equal(getInitialBookFormat('ebook', true, true), 'ebook');
    assert.equal(getInitialBookFormat('audiobook', true, true), 'audiobook');
  });

  it('picks the ebook when only the ebook can be requested', () => {
    assert.equal(getInitialBookFormat('both', true, false), 'ebook');
    assert.equal(getInitialBookFormat('audiobook', true, false), 'ebook');
  });

  it('picks the audiobook when only the audiobook can be requested', () => {
    assert.equal(getInitialBookFormat('both', false, true), 'audiobook');
    assert.equal(getInitialBookFormat('ebook', false, true), 'audiobook');
  });

  it('keeps the configured default when neither format can be requested', () => {
    assert.equal(getInitialBookFormat('both', false, false), 'both');
  });
});

describe('getBookFormatIndicator', () => {
  it('shows available and partially available formats as available', () => {
    assert.equal(getBookFormatIndicator(MediaStatus.AVAILABLE), 'available');
    assert.equal(
      getBookFormatIndicator(MediaStatus.PARTIALLY_AVAILABLE, false),
      'available'
    );
  });

  it('tells requested and processing formats apart', () => {
    assert.equal(getBookFormatIndicator(MediaStatus.PENDING), 'requested');
    assert.equal(
      getBookFormatIndicator(MediaStatus.PROCESSING, false),
      'processing'
    );
  });

  it('keeps formats that were not requested neutral', () => {
    assert.equal(getBookFormatIndicator(undefined), 'none');
    assert.equal(getBookFormatIndicator(MediaStatus.UNKNOWN, true), 'none');
    assert.equal(getBookFormatIndicator(MediaStatus.DELETED), 'none');
  });

  it('fades the icon only when the edition is known to be missing', () => {
    assert.equal(getBookFormatIndicator(undefined, false), 'missing');
    assert.equal(getBookFormatIndicator(MediaStatus.UNKNOWN, false), 'missing');
    // Unknown availability, such as a failed lookup, stays neutral
    assert.equal(getBookFormatIndicator(undefined, null), 'none');
  });
});

describe('needsEditionLookup', () => {
  it('looks up a format only while its icon would be neutral', () => {
    assert.equal(needsEditionLookup(undefined), true);
    assert.equal(needsEditionLookup(MediaStatus.UNKNOWN), true);
    assert.equal(needsEditionLookup(MediaStatus.PENDING), false);
    assert.equal(needsEditionLookup(MediaStatus.AVAILABLE), false);
  });
});
