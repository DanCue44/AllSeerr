import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MediaStatus, MediaType } from '@server/constants/media';
import type { NewsletterMedia } from '@server/lib/newsletter';
import {
  getNewsletterSchedule,
  getNewsletterSince,
  selectNewsletterMedia,
} from '@server/lib/newsletter';

const since = new Date('2026-10-01T00:00:00Z');

const createMedia = (
  overrides: Partial<NewsletterMedia> & Pick<NewsletterMedia, 'tmdbId'>
): NewsletterMedia => ({
  mediaType: MediaType.MOVIE,
  status: MediaStatus.AVAILABLE,
  status4k: MediaStatus.UNKNOWN,
  mediaAddedAt: new Date('2026-10-03T12:00:00Z'),
  ...overrides,
});

describe('selectNewsletterMedia', () => {
  it('groups available media into movies and series', () => {
    const content = selectNewsletterMedia(
      [
        createMedia({ tmdbId: 1 }),
        createMedia({ tmdbId: 2, mediaType: MediaType.TV }),
        createMedia({
          tmdbId: 3,
          mediaType: MediaType.TV,
          status: MediaStatus.PARTIALLY_AVAILABLE,
        }),
      ],
      { since }
    );

    assert.deepEqual(
      content.movies.map((item) => item.tmdbId),
      [1]
    );
    assert.deepEqual(
      content.series.map((item) => item.tmdbId),
      [2, 3]
    );
  });

  it('skips media added outside of the window', () => {
    const content = selectNewsletterMedia(
      [
        createMedia({ tmdbId: 1, mediaAddedAt: since }),
        createMedia({
          tmdbId: 2,
          mediaAddedAt: new Date('2026-09-30T23:59:59Z'),
        }),
        createMedia({
          tmdbId: 3,
          mediaAddedAt: new Date('2026-10-09T00:00:00Z'),
        }),
        createMedia({ tmdbId: 4, mediaAddedAt: null }),
        createMedia({ tmdbId: 5 }),
      ],
      { since, until: new Date('2026-10-08T00:00:00Z') }
    );

    assert.deepEqual(
      content.movies.map((item) => item.tmdbId),
      [5]
    );
  });

  it('skips media which is not available', () => {
    const content = selectNewsletterMedia(
      [
        createMedia({ tmdbId: 1, status: MediaStatus.PROCESSING }),
        createMedia({ tmdbId: 2, status: MediaStatus.PENDING }),
        createMedia({ tmdbId: 3, status: MediaStatus.DELETED }),
      ],
      { since }
    );

    assert.equal(content.movies.length, 0);
    assert.equal(content.series.length, 0);
  });

  it('only includes 4K-only media when enabled', () => {
    const media = [
      createMedia({
        tmdbId: 1,
        status: MediaStatus.UNKNOWN,
        status4k: MediaStatus.AVAILABLE,
      }),
    ];

    assert.equal(selectNewsletterMedia(media, { since }).movies.length, 0);
    assert.deepEqual(
      selectNewsletterMedia(media, { since, include4k: true }).movies.map(
        (item) => item.tmdbId
      ),
      [1]
    );
  });

  it('sorts newest first, removes duplicates and applies the limit', () => {
    const content = selectNewsletterMedia(
      [
        createMedia({
          tmdbId: 1,
          mediaAddedAt: new Date('2026-10-02T00:00:00Z'),
        }),
        createMedia({
          tmdbId: 2,
          mediaAddedAt: new Date('2026-10-05T00:00:00Z'),
        }),
        createMedia({
          tmdbId: 2,
          mediaAddedAt: new Date('2026-10-04T00:00:00Z'),
        }),
        createMedia({
          tmdbId: 3,
          mediaAddedAt: new Date('2026-10-04T00:00:00Z'),
        }),
        createMedia({
          tmdbId: 2,
          mediaType: MediaType.TV,
          mediaAddedAt: new Date('2026-10-03T00:00:00Z'),
        }),
      ],
      { since, limit: 2 }
    );

    assert.deepEqual(
      content.movies.map((item) => item.tmdbId),
      [2, 3]
    );
    assert.deepEqual(
      content.series.map((item) => item.tmdbId),
      [2]
    );
  });
});

describe('getNewsletterSince', () => {
  const now = new Date('2026-10-08T09:00:00Z');

  it('uses the last sent time', () => {
    assert.equal(
      getNewsletterSince('2026-10-01T09:00:00.000Z', now).toISOString(),
      '2026-10-01T09:00:00.000Z'
    );
  });

  it('falls back to one week ago', () => {
    const expected = '2026-10-01T09:00:00.000Z';

    assert.equal(getNewsletterSince(undefined, now).toISOString(), expected);
    assert.equal(getNewsletterSince('invalid', now).toISOString(), expected);
    assert.equal(
      getNewsletterSince('2026-10-09T00:00:00.000Z', now).toISOString(),
      expected
    );
  });
});

describe('getNewsletterSchedule', () => {
  it('builds a weekly cron schedule', () => {
    assert.equal(getNewsletterSchedule(5, 18), '0 0 18 * * 5');
    assert.equal(getNewsletterSchedule(0, 0), '0 0 0 * * 0');
  });

  it('falls back to the defaults for invalid values', () => {
    assert.equal(getNewsletterSchedule(), '0 0 9 * * 0');
    assert.equal(getNewsletterSchedule(7, 24), '0 0 9 * * 0');
    assert.equal(getNewsletterSchedule(-1, 1.5), '0 0 9 * * 0');
  });
});
