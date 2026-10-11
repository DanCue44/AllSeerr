import MusicBrainz from '@server/api/musicbrainz';
import type { PlexLibraryItem } from '@server/api/plexapi';
import PlexAPI from '@server/api/plexapi';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { plexFullScanner, plexRecentScanner } from '@server/lib/scanners/plex';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import { runWithMockTimers } from '@server/test/runWithMockTimers';
import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

const RELEASE_MBID = '11111111-1111-1111-1111-111111111111';
const RELEASE_GROUP_MBID = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';
const OTHER_RELEASE_GROUP_MBID = 'b1392450-e666-3926-a536-22c65f834433';

const fakeAlbum = (
  ratingKey: string,
  mbId: string,
  title = 'OK Computer'
): PlexLibraryItem => ({
  ratingKey,
  // Albums of one artist share it as their parent
  parentRatingKey: 'artist-1',
  title,
  guid: `plex://album/${ratingKey}`,
  addedAt: 1700000000,
  updatedAt: 1700000000,
  Guid: [{ id: `mbid://${mbId}` }],
  type: 'album',
  Media: [],
});

let libraryItems: PlexLibraryItem[] = [];
let contentsOptions: { type?: string }[] = [];

mock.method(PlexAPI.prototype, 'getLibraries', async () => []);
mock.method(
  PlexAPI.prototype,
  'getLibraryContents',
  async (_id: string, options: { type?: string; offset?: number }) => {
    contentsOptions.push(options);
    return {
      totalSize: libraryItems.length,
      items: options.offset ? [] : libraryItems,
    };
  }
);
mock.method(PlexAPI.prototype, 'getRecentlyAdded', async () => libraryItems);

// Plex tags albums with a release, which MusicBrainz maps to its group
const getReleaseGroup = mock.method(
  MusicBrainz.prototype,
  'getReleaseGroup',
  async ({ releaseId }: { releaseId: string }) => {
    if (releaseId === RELEASE_MBID) {
      return RELEASE_GROUP_MBID;
    }
    throw new Error('Request failed with status code 404');
  }
);

setupTestDb();

describe('Plex Scanner, music', () => {
  beforeEach(() => {
    getReleaseGroup.mock.resetCalls();
    contentsOptions = [];
    libraryItems = [];
    getSettings().plex.libraries = [
      { id: '3', name: 'Music', enabled: true, type: 'music' },
    ];
  });

  it('saves albums of a music library as available', async () => {
    libraryItems = [
      fakeAlbum('101', RELEASE_MBID),
      // A release group id is used as it is when it is not a release
      fakeAlbum('102', OTHER_RELEASE_GROUP_MBID, 'Kid A'),
    ];

    await runWithMockTimers(() => plexFullScanner.run());

    assert.strictEqual(contentsOptions[0].type, 'album');

    const mediaRepository = getRepository(Media);
    const okComputer = await mediaRepository.findOneOrFail({
      where: { mbId: RELEASE_GROUP_MBID, mediaType: MediaType.MUSIC },
    });
    assert.strictEqual(okComputer.status, MediaStatus.AVAILABLE);
    assert.strictEqual(okComputer.ratingKey, '101');

    const kidA = await mediaRepository.findOneOrFail({
      where: { mbId: OTHER_RELEASE_GROUP_MBID },
    });
    assert.strictEqual(kidA.ratingKey, '102');
  });

  it('marks a requested album available from the recently added scan', async () => {
    const mediaRepository = getRepository(Media);
    await mediaRepository.save(
      new Media({
        mbId: RELEASE_GROUP_MBID,
        mediaType: MediaType.MUSIC,
        status: MediaStatus.PROCESSING,
      })
    );

    libraryItems = [
      fakeAlbum('101', RELEASE_MBID),
      fakeAlbum('102', OTHER_RELEASE_GROUP_MBID, 'Kid A'),
    ];

    await runWithMockTimers(() => plexRecentScanner.run());

    const okComputer = await mediaRepository.findOneOrFail({
      where: { mbId: RELEASE_GROUP_MBID },
    });
    assert.strictEqual(okComputer.status, MediaStatus.AVAILABLE);
    assert.strictEqual(okComputer.ratingKey, '101');

    // Both albums of the artist are kept, not bundled by their parent
    assert.strictEqual(
      await mediaRepository.count({
        where: { mbId: OTHER_RELEASE_GROUP_MBID },
      }),
      1
    );
  });

  it('skips the MusicBrainz lookup for albums it already knows', async () => {
    await getRepository(Media).save(
      new Media({
        mbId: RELEASE_GROUP_MBID,
        mediaType: MediaType.MUSIC,
        status: MediaStatus.AVAILABLE,
        ratingKey: '101',
      })
    );
    libraryItems = [fakeAlbum('101', RELEASE_MBID)];

    await runWithMockTimers(() => plexFullScanner.run());

    assert.strictEqual(getReleaseGroup.mock.callCount(), 0);
  });
});
