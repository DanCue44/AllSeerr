import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MediaRequestStatus } from '@server/constants/media';
import {
  MAX_REQUESTED_VOLUMES,
  formatRequestedVolumes,
  formatVolumeRanges,
  getRequestedComicVolumes,
  parseComicVolumes,
} from '@server/lib/comicVolumes';

describe('formatVolumeRanges', () => {
  it('joins volumes in a row into runs', () => {
    assert.equal(formatVolumeRanges([1, 2, 3, 7]), '1-3, 7');
    assert.equal(formatVolumeRanges([7, 3, 1, 2, 9, 10]), '1-3, 7, 9-10');
  });

  it('writes single volumes and leaves duplicates out', () => {
    assert.equal(formatVolumeRanges([5]), '5');
    assert.equal(formatVolumeRanges([2, 2, 4]), '2, 4');
    assert.equal(formatVolumeRanges([]), '');
  });

  it('starts a run at volume 0 and keeps half volumes on their own', () => {
    assert.equal(formatVolumeRanges([0, 1, 2]), '0-2');
    assert.equal(formatVolumeRanges([1, 1.5, 2, 3]), '1, 1.5, 2-3');
  });

  it('writes the volumes of a notification', () => {
    assert.equal(formatRequestedVolumes([1, 2, 3, 7]), 'Vol. 1-3, 7');
  });
});

describe('parseComicVolumes', () => {
  it('sorts and deduplicates the volumes', () => {
    assert.deepEqual(parseComicVolumes([7, 1, 3, 1]), [1, 3, 7]);
  });

  it('reads no volumes or an empty list as the whole series', () => {
    assert.equal(parseComicVolumes(undefined), null);
    assert.equal(parseComicVolumes(null), null);
    assert.equal(parseComicVolumes([]), null);
  });

  it('refuses anything but a list of volume numbers', () => {
    assert.equal(parseComicVolumes('1-3'), undefined);
    assert.equal(parseComicVolumes([1, '2']), undefined);
    assert.equal(parseComicVolumes([-1]), undefined);
    assert.equal(parseComicVolumes([Number.NaN]), undefined);
    assert.equal(
      parseComicVolumes(
        Array.from({ length: MAX_REQUESTED_VOLUMES + 1 }, (_, i) => i)
      ),
      undefined
    );
  });
});

describe('getRequestedComicVolumes', () => {
  it('collects the volumes of standing requests', () => {
    assert.deepEqual(
      getRequestedComicVolumes([
        { status: MediaRequestStatus.PENDING, comicVolumes: [4, 5] },
        { status: MediaRequestStatus.APPROVED, comicVolumes: [1] },
        { status: MediaRequestStatus.DECLINED, comicVolumes: [9] },
        { status: MediaRequestStatus.COMPLETED, comicVolumes: [10] },
      ]),
      { wholeSeries: false, volumes: [1, 4, 5] }
    );
  });

  it('says when a standing request asks for the whole series', () => {
    assert.equal(
      getRequestedComicVolumes([
        { status: MediaRequestStatus.APPROVED, comicVolumes: null },
      ]).wholeSeries,
      true
    );
    assert.equal(
      getRequestedComicVolumes([
        { status: MediaRequestStatus.DECLINED, comicVolumes: null },
      ]).wholeSeries,
      false
    );
  });
});
