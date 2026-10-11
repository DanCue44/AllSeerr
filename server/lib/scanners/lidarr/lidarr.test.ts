import CoverArtArchive from '@server/api/coverartarchive';
import MusicBrainz from '@server/api/musicbrainz';
import type { MbReleaseGroup } from '@server/api/musicbrainz/interfaces';
import type { LidarrAlbum } from '@server/api/servarr/lidarr';
import LidarrAPI from '@server/api/servarr/lidarr';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaRequest from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import {
  getLidarrAlbumState,
  lidarrScanner,
} from '@server/lib/scanners/lidarr';
import type { LidarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import { runWithMockTimers } from '@server/test/runWithMockTimers';
import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

const AVAILABLE_MBID = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';
const MISSING_MBID = 'b1392450-e666-3926-a536-22c65f834433';
const UNMONITORED_MBID = 'f4d0a6a4-8bbc-3e8a-a6c9-1d4f1c0b8a3e';

let getAlbumsImpl: () => Promise<LidarrAlbum[]> = async () => [];
Object.defineProperty(LidarrAPI.prototype, 'getAlbums', {
  set() {},
  get() {
    return async () => getAlbumsImpl();
  },
  configurable: true,
});

mock.method(MediaRequest, 'sendNotification', async () => undefined);

// Completing a request announces the album with its details and cover
mock.method(
  MusicBrainz.prototype,
  'getAlbum',
  async () => ({ id: AVAILABLE_MBID, title: 'OK Computer' }) as MbReleaseGroup
);
mock.method(CoverArtArchive.prototype, 'getFrontCoverUrl', async () => null);

setupTestDb();

function configureLidarr(overrides: Partial<LidarrSettings> = {}): void {
  getSettings().lidarr = [
    {
      id: 3,
      name: 'Lidarr',
      hostname: 'localhost',
      port: 8686,
      apiKey: 'test-key',
      useSsl: false,
      baseUrl: '',
      activeProfileId: 1,
      activeProfileName: 'Lossless',
      activeDirectory: '/music',
      activeMetadataProfileId: 1,
      activeMetadataProfileName: 'Standard',
      tags: [],
      is4k: false,
      isDefault: true,
      syncEnabled: true,
      preventSearch: false,
      tagRequests: false,
      overrideRule: [],
      ...overrides,
    },
  ];
}

function fakeAlbum(overrides: Partial<LidarrAlbum> = {}): LidarrAlbum {
  return {
    id: 10,
    mbId: AVAILABLE_MBID,
    title: 'OK Computer',
    monitored: true,
    artistId: 1,
    foreignAlbumId: AVAILABLE_MBID,
    titleSlug: 'ok-computer',
    profileId: 1,
    duration: 0,
    albumType: 'Album',
    statistics: {
      trackFileCount: 12,
      trackCount: 12,
      totalTrackCount: 12,
      sizeOnDisk: 1,
      percentOfTracks: 100,
    },
    ...overrides,
  };
}

const missingTracks = {
  trackFileCount: 3,
  trackCount: 12,
  totalTrackCount: 12,
  sizeOnDisk: 1,
  percentOfTracks: 25,
};

describe('getLidarrAlbumState', () => {
  it('is available once every track of the release has a file', () => {
    assert.strictEqual(getLidarrAlbumState(fakeAlbum()), 'available');
    assert.strictEqual(
      getLidarrAlbumState(fakeAlbum({ monitored: false })),
      'available'
    );
  });

  it('is processing while a monitored album misses tracks', () => {
    assert.strictEqual(
      getLidarrAlbumState(fakeAlbum({ statistics: missingTracks })),
      'processing'
    );
    assert.strictEqual(
      getLidarrAlbumState(fakeAlbum({ statistics: undefined })),
      'processing'
    );
  });

  it('skips unmonitored albums missing tracks', () => {
    assert.strictEqual(
      getLidarrAlbumState(
        fakeAlbum({ monitored: false, statistics: missingTracks })
      ),
      'skip'
    );
  });
});

describe('Lidarr Scanner', () => {
  beforeEach(() => {
    configureLidarr();
    getAlbumsImpl = async () => [];
  });

  it('saves Lidarr albums as available or processing music', async () => {
    getAlbumsImpl = async () => [
      fakeAlbum(),
      fakeAlbum({
        id: 11,
        foreignAlbumId: MISSING_MBID,
        statistics: missingTracks,
      }),
      fakeAlbum({
        id: 12,
        foreignAlbumId: UNMONITORED_MBID,
        monitored: false,
        statistics: missingTracks,
      }),
    ];

    await runWithMockTimers(() => lidarrScanner.run());

    const mediaRepository = getRepository(Media);
    const available = await mediaRepository.findOneOrFail({
      where: { mbId: AVAILABLE_MBID, mediaType: MediaType.MUSIC },
    });
    assert.strictEqual(available.status, MediaStatus.AVAILABLE);
    assert.strictEqual(available.serviceId, 3);
    assert.strictEqual(available.externalServiceId, 10);
    assert.strictEqual(available.externalServiceSlug, AVAILABLE_MBID);

    const missing = await mediaRepository.findOneOrFail({
      where: { mbId: MISSING_MBID },
    });
    assert.strictEqual(missing.status, MediaStatus.PROCESSING);

    assert.strictEqual(
      await mediaRepository.count({ where: { mbId: UNMONITORED_MBID } }),
      0
    );
  });

  it('completes the request of an album that finished downloading', async () => {
    const mediaRepository = getRepository(Media);
    const requestedBy = await getRepository(User).findOneOrFail({
      where: { email: 'demo@seerr.dev' },
    });
    const media = await mediaRepository.save(
      new Media({
        mbId: AVAILABLE_MBID,
        mediaType: MediaType.MUSIC,
        status: MediaStatus.PROCESSING,
      })
    );
    // Saved without Lidarr set up, so it is not sent there
    getSettings().lidarr = [];
    const mediaRequest = await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.MUSIC,
        status: MediaRequestStatus.APPROVED,
        media,
        requestedBy,
        is4k: false,
      })
    );
    configureLidarr();

    getAlbumsImpl = async () => [fakeAlbum()];

    await runWithMockTimers(() => lidarrScanner.run());

    const updated = await mediaRepository.findOneOrFail({
      where: { id: media.id },
    });
    assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
    assert.strictEqual(updated.externalServiceId, 10);

    const completed = await getRepository(MediaRequest).findOneOrFail({
      where: { id: mediaRequest.id },
    });
    assert.strictEqual(completed.status, MediaRequestStatus.COMPLETED);
  });

  it('leaves declined albums alone while Lidarr still has them monitored', async () => {
    const mediaRepository = getRepository(Media);
    await mediaRepository.save(
      new Media({
        mbId: MISSING_MBID,
        mediaType: MediaType.MUSIC,
        status: MediaStatus.DELETED,
      })
    );

    getAlbumsImpl = async () => [
      fakeAlbum({ foreignAlbumId: MISSING_MBID, statistics: missingTracks }),
    ];

    await runWithMockTimers(() => lidarrScanner.run());

    const media = await mediaRepository.findOneOrFail({
      where: { mbId: MISSING_MBID },
    });
    assert.strictEqual(media.status, MediaStatus.DELETED);
  });

  it('skips servers with sync disabled', async () => {
    configureLidarr({ syncEnabled: false });
    getAlbumsImpl = async () => [fakeAlbum()];

    await runWithMockTimers(() => lidarrScanner.run());

    assert.strictEqual(
      await getRepository(Media).count({ where: { mbId: AVAILABLE_MBID } }),
      0
    );
  });
});
