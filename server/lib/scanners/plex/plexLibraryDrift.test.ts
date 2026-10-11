import MusicBrainz from '@server/api/musicbrainz';
import type { PlexLibrary, PlexLibraryItem } from '@server/api/plexapi';
import PlexAPI from '@server/api/plexapi';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { plexFullScanner } from '@server/lib/scanners/plex';
import scanHealth from '@server/lib/scanners/scanHealth';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import { runWithMockTimers } from '@server/test/runWithMockTimers';
import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

const RELEASE_GROUP_MBID = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';

const fakeAlbum = (ratingKey: string): PlexLibraryItem => ({
  ratingKey,
  parentRatingKey: 'artist-1',
  title: 'OK Computer',
  guid: `plex://album/${ratingKey}`,
  addedAt: 1700000000,
  updatedAt: 1700000000,
  Guid: [{ id: `mbid://${RELEASE_GROUP_MBID}` }],
  type: 'album',
  Media: [],
});

// Section ids Plex answers for. Others get a 404, like after a Plex
// database restore renumbered the sections.
let liveSections: PlexLibrary[] = [];
let requestedIds: string[] = [];

const notFound = (id: string) =>
  Object.assign(new Error('Request failed with status code 404'), {
    response: { status: 404 },
    config: {
      baseURL: 'http://plex.local:32400',
      url: `/library/sections/${id}/all`,
    },
  });

mock.method(PlexAPI.prototype, 'getLibraries', async () => liveSections);
mock.method(
  PlexAPI.prototype,
  'getLibraryContents',
  async (id: string, options: { offset?: number }) => {
    requestedIds.push(id);

    if (!liveSections.some((section) => section.key === id)) {
      throw notFound(id);
    }

    const items = id === '30' ? [fakeAlbum('101')] : [];
    return { totalSize: items.length, items: options.offset ? [] : items };
  }
);
mock.method(MusicBrainz.prototype, 'getReleaseGroup', async () => {
  throw new Error('Request failed with status code 404');
});

setupTestDb();

describe('Plex Scanner, library ids that changed', () => {
  beforeEach(() => {
    requestedIds = [];
    scanHealth.reset();
  });

  it('remaps a renumbered library by name and retries the scan', async () => {
    getSettings().plex.libraries = [
      { id: '3', name: 'UFC PPV Events', enabled: true, type: 'music' },
    ];
    liveSections = [
      { key: '30', title: 'UFC Events', type: 'artist', agent: 'tv.plex' },
      { key: '31', title: 'Movies', type: 'movie', agent: 'tv.plex' },
    ];

    await runWithMockTimers(() => plexFullScanner.run());

    assert.deepEqual(requestedIds, ['3', '30']);
    assert.deepEqual(
      getSettings().plex.libraries.map((library) => [
        library.id,
        library.enabled,
      ]),
      [
        ['30', true],
        ['31', false],
      ]
    );
    assert.equal(
      await getRepository(Media).count({
        where: { mbId: RELEASE_GROUP_MBID, mediaType: MediaType.MUSIC },
      }),
      1
    );
    assert.equal(scanHealth.get('plex-full-scan')?.consecutiveFailures, 0);
  });

  it('scans the libraries that work and reports an ambiguous one', async () => {
    getSettings().plex.libraries = [
      { id: '1', name: 'Concerts', enabled: true, type: 'music' },
      { id: '30', name: 'Music', enabled: true, type: 'music' },
    ];
    liveSections = [
      { key: '30', title: 'Music', type: 'artist', agent: 'tv.plex' },
      { key: '41', title: 'Concerts HD', type: 'artist', agent: 'tv.plex' },
      { key: '42', title: 'Concerts 4K', type: 'artist', agent: 'tv.plex' },
    ];

    await runWithMockTimers(() => plexFullScanner.run());

    // The broken library does not stop the others
    assert.deepEqual(requestedIds, ['1', '30']);

    const health = scanHealth.get('plex-full-scan');
    assert.equal(health?.consecutiveFailures, 1);
    assert.match(health?.lastError ?? '', /"Concerts" \(id 1\) was not found/);

    // It stays enabled so it keeps being reported until an admin picks again
    assert.deepEqual(
      getSettings().plex.libraries.find((library) => library.id === '1'),
      { id: '1', name: 'Concerts', enabled: true, type: 'music' }
    );
  });
});
