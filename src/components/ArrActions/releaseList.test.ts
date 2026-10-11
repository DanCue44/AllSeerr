import type { ArrRelease } from '@server/interfaces/api/arrActionInterfaces';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterReleases, splitAge, targetQuery } from './releaseList';

const release = (guid: string, extra: Partial<ArrRelease>): ArrRelease => ({
  guid,
  indexerId: 1,
  title: guid,
  size: 1000,
  ageHours: 10,
  indexer: 'Indexer',
  protocol: 'usenet',
  quality: 'WEBDL-1080p',
  qualityWeight: 10,
  languages: ['English'],
  approved: true,
  rejections: [],
  ...extra,
});

const releases = [
  release('rejected-best', { approved: false, qualityWeight: 99 }),
  release('approved-small', { size: 10 }),
  release('approved-big', { size: 5000, ageHours: 500 }),
  release('torrent', {
    protocol: 'torrent',
    seeders: 50,
    qualityWeight: 5,
    ageHours: 1,
  }),
];

describe('filterReleases', () => {
  it('lists approved releases first, then by quality and size', () => {
    assert.deepStrictEqual(
      filterReleases(
        releases,
        { approvedOnly: false, protocol: 'all' },
        'default'
      ).map((r) => r.guid),
      ['approved-big', 'approved-small', 'torrent', 'rejected-best']
    );
  });

  it('filters by approval and protocol', () => {
    assert.deepStrictEqual(
      filterReleases(
        releases,
        { approvedOnly: true, protocol: 'usenet' },
        'default'
      ).map((r) => r.guid),
      ['approved-big', 'approved-small']
    );
  });

  it('sorts by age and by seeders', () => {
    const all = { approvedOnly: false, protocol: 'all' } as const;

    assert.strictEqual(filterReleases(releases, all, 'age')[0].guid, 'torrent');
    assert.strictEqual(
      filterReleases(releases, all, 'seeders')[0].guid,
      'torrent'
    );
    assert.strictEqual(
      filterReleases(releases, all, 'size')[0].guid,
      'approved-big'
    );
  });
});

describe('splitAge', () => {
  it('uses hours, days and years', () => {
    assert.deepStrictEqual(splitAge(5.4), { unit: 'hour', value: 5 });
    assert.deepStrictEqual(splitAge(72), { unit: 'day', value: 3 });
    assert.deepStrictEqual(splitAge(24 * 730), { unit: 'year', value: 2 });
  });
});

describe('targetQuery', () => {
  it('leaves out what the target does not set', () => {
    assert.strictEqual(targetQuery({}), '');
    assert.strictEqual(
      targetQuery({ is4k: true, seasonNumber: 0, episodeNumber: 2 }),
      '?is4k=true&seasonNumber=0&episodeNumber=2'
    );
    assert.strictEqual(
      targetQuery({ bookFormat: 'audiobook' }),
      '?bookFormat=audiobook'
    );
  });
});
