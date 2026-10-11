import CoverArtArchive from '@server/api/coverartarchive';
import MusicBrainz from '@server/api/musicbrainz';
import type { MbReleaseGroup } from '@server/api/musicbrainz/interfaces';
import type { PlexMetadata } from '@server/api/plexapi';
import PlexAPI from '@server/api/plexapi';
import type { LidarrAlbum } from '@server/api/servarr/lidarr';
import LidarrAPI from '@server/api/servarr/lidarr';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaRequest from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { lidarrScanner } from '@server/lib/scanners/lidarr';
import { isAbandonedLidarrAlbum } from '@server/lib/scanners/lidarr/availability';
import type { LidarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import { runWithMockTimers } from '@server/test/runWithMockTimers';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

const OK_COMPUTER = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';
const OTHER = 'b1392450-e666-3926-a536-22c65f834433';

let albums: LidarrAlbum[] = [];
let libraryError: Error | undefined;
// Albums read one at a time, by id. Missing ids are a 404.
let albumById: Record<number, LidarrAlbum> = {};
let albumError: Error | undefined;
const findAlbumCalls: number[] = [];

Object.defineProperty(LidarrAPI.prototype, 'getAlbums', {
  set() {},
  get() {
    return async () => {
      if (libraryError) {
        throw libraryError;
      }
      return albums;
    };
  },
  configurable: true,
});
mock.method(LidarrAPI.prototype, 'findAlbum', async (id: number) => {
  findAlbumCalls.push(id);
  if (albumError) {
    throw albumError;
  }
  return albumById[id];
});

// Plex items by rating key. Missing keys are a 404.
let plexItems: Record<string, PlexMetadata> = {};
let plexError: Error | undefined;
const plexCalls: string[] = [];
mock.method(PlexAPI.prototype, 'getMetadata', async (key: string) => {
  plexCalls.push(key);
  if (plexError) {
    throw plexError;
  }
  if (!plexItems[key]) {
    throw Object.assign(new Error('Request failed with status code 404'), {
      response: { status: 404 },
    });
  }
  return plexItems[key];
});

mock.method(MediaRequest, 'sendNotification', async () => undefined);
mock.method(
  MusicBrainz.prototype,
  'getAlbum',
  async () => ({ id: OK_COMPUTER, title: 'OK Computer' }) as MbReleaseGroup
);
mock.method(CoverArtArchive.prototype, 'getFrontCoverUrl', async () => null);

setupTestDb();

const server: LidarrSettings = {
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
};

const fakeAlbum = (overrides: Partial<LidarrAlbum> = {}): LidarrAlbum => ({
  id: 10,
  mbId: OK_COMPUTER,
  title: 'OK Computer',
  monitored: true,
  artistId: 1,
  foreignAlbumId: OK_COMPUTER,
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
});

const stats = (trackFileCount: number) => ({
  trackFileCount,
  trackCount: 12,
  totalTrackCount: 12,
  sizeOnDisk: trackFileCount,
  percentOfTracks: Math.round((trackFileCount / 12) * 100),
});

// Lidarr still lists other albums, but not OK Computer
const otherAlbum = fakeAlbum({ id: 50, foreignAlbumId: OTHER, mbId: OTHER });

// The album emptied in Lidarr: unmonitored with no track files left
const emptied = fakeAlbum({ monitored: false, statistics: stats(0) });

// OK Computer linked to Lidarr album 10 of server 3
const saveAlbum = (init: Partial<Media> = {}): Promise<Media> =>
  getRepository(Media).save(
    new Media({
      mbId: OK_COMPUTER,
      mediaType: MediaType.MUSIC,
      status: MediaStatus.AVAILABLE,
      serviceId: 3,
      externalServiceId: 10,
      externalServiceSlug: OK_COMPUTER,
      ...init,
    })
  );

const saveRequest = async (
  media: Media,
  status: MediaRequestStatus
): Promise<MediaRequest> => {
  const requestedBy = await getRepository(User).findOneOrFail({
    where: { email: 'demo@seerr.dev' },
  });
  // Saved without Lidarr set up, so it is not sent there
  getSettings().lidarr = [];
  const request = await getRepository(MediaRequest).save(
    new MediaRequest({
      type: MediaType.MUSIC,
      status,
      media,
      requestedBy,
      is4k: false,
    })
  );
  getSettings().lidarr = [server];

  return request;
};

const reload = () =>
  getRepository(Media).findOneOrFail({ where: { mbId: OK_COMPUTER } });

const reloadRequest = (id: number) =>
  getRepository(MediaRequest).findOneOrFail({ where: { id } });

const scan = () => runWithMockTimers(() => lidarrScanner.run());

describe('isAbandonedLidarrAlbum', () => {
  it('is an unmonitored album with no track files', () => {
    assert.strictEqual(isAbandonedLidarrAlbum(emptied), true);
  });

  it('is not a monitored album, one with files or without statistics', () => {
    assert.strictEqual(
      isAbandonedLidarrAlbum(fakeAlbum({ statistics: stats(0) })),
      false
    );
    assert.strictEqual(
      isAbandonedLidarrAlbum(
        fakeAlbum({ monitored: false, statistics: stats(3) })
      ),
      false
    );
    assert.strictEqual(
      isAbandonedLidarrAlbum(
        fakeAlbum({ monitored: false, statistics: undefined })
      ),
      false
    );
  });
});

describe('Lidarr availability sync', () => {
  beforeEach(() => {
    albums = [];
    albumById = {};
    libraryError = undefined;
    albumError = undefined;
    findAlbumCalls.length = 0;
    plexItems = {};
    plexError = undefined;
    plexCalls.length = 0;
    getSettings().lidarr = [server];
    getSettings().main.mediaServerType = MediaServerType.PLEX;
  });

  afterEach(() => {
    getSettings().lidarr = [];
    getSettings().main.mediaServerType = MediaServerType.NOT_CONFIGURED;
  });

  it('marks an available album removed from Lidarr as deleted', async () => {
    await saveAlbum();
    albums = [otherAlbum];

    await scan();

    const album = await reload();
    assert.strictEqual(album.status, MediaStatus.DELETED);
    assert.strictEqual(album.serviceId, null);
    assert.strictEqual(album.externalServiceId, null);
    assert.strictEqual(album.externalServiceSlug, null);
    // Confirmed by reading the album again
    assert.deepStrictEqual(findAlbumCalls, [10]);
  });

  it('marks an available album emptied and unmonitored as deleted', async () => {
    await saveAlbum();
    albums = [emptied];
    albumById = { 10: emptied };

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.DELETED);
  });

  it('keeps an album Lidarr re-added under a new id', async () => {
    await saveAlbum();
    albums = [fakeAlbum({ id: 77 })];

    await scan();

    const album = await reload();
    assert.strictEqual(album.status, MediaStatus.AVAILABLE);
    // The scan moved the link to the new album
    assert.strictEqual(album.externalServiceId, 77);
    assert.deepStrictEqual(findAlbumCalls, []);
  });

  it('keeps an unmonitored album that still has some track files', async () => {
    await saveAlbum();
    const partial = fakeAlbum({ monitored: false, statistics: stats(3) });
    albums = [partial];

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.AVAILABLE);
    assert.deepStrictEqual(findAlbumCalls, []);
  });

  it('keeps a monitored album whose files were deleted', async () => {
    await saveAlbum();
    albums = [fakeAlbum({ statistics: stats(0) })];

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.AVAILABLE);
    assert.deepStrictEqual(findAlbumCalls, []);
  });

  it('keeps an album whose files arrived after the listing', async () => {
    await saveAlbum();
    albums = [emptied];
    albumById = { 10: fakeAlbum({ monitored: false }) };

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.AVAILABLE);
  });

  it('keeps an album whose Lidarr id now holds another release group', async () => {
    await saveAlbum();
    albums = [fakeAlbum({ foreignAlbumId: OTHER, mbId: OTHER })];

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.AVAILABLE);
    assert.deepStrictEqual(findAlbumCalls, []);
  });

  it('keeps an album when Lidarr reads it back as another release group', async () => {
    await saveAlbum();
    albums = [otherAlbum];
    albumById = { 10: fakeAlbum({ foreignAlbumId: OTHER, mbId: OTHER }) };

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.AVAILABLE);
  });

  it('keeps an album without a Lidarr id', async () => {
    await saveAlbum({ externalServiceId: null });
    albums = [otherAlbum];

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.AVAILABLE);
    assert.deepStrictEqual(findAlbumCalls, []);
  });

  it('resets nothing when Lidarr cannot list its albums', async () => {
    await saveAlbum();
    await saveAlbum({ mbId: OTHER, status: MediaStatus.PROCESSING });
    libraryError = new Error('connect ECONNREFUSED');

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.AVAILABLE);
    const other = await getRepository(Media).findOneOrFail({
      where: { mbId: OTHER },
    });
    assert.strictEqual(other.status, MediaStatus.PROCESSING);
    assert.deepStrictEqual(findAlbumCalls, []);
  });

  it('resets nothing when Lidarr lists no albums', async () => {
    await saveAlbum();
    albums = [];

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.AVAILABLE);
    assert.deepStrictEqual(findAlbumCalls, []);
  });

  it('keeps an album when Lidarr fails to read it', async () => {
    await saveAlbum();
    albums = [otherAlbum];
    albumError = new Error('[Lidarr] Failed to retrieve album: timeout');

    await scan();

    const album = await reload();
    assert.strictEqual(album.status, MediaStatus.AVAILABLE);
    assert.strictEqual(album.externalServiceId, 10);
  });

  it('leaves albums of other servers alone', async () => {
    await saveAlbum({ serviceId: 7 });
    albums = [otherAlbum];

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.AVAILABLE);
    assert.deepStrictEqual(findAlbumCalls, []);
  });

  it('leaves albums alone when sync is disabled', async () => {
    getSettings().lidarr = [{ ...server, syncEnabled: false }];
    await saveAlbum();
    albums = [otherAlbum];

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.AVAILABLE);
  });

  it('leaves declined and deleted albums alone', async () => {
    await saveAlbum({ status: MediaStatus.DELETED });
    albums = [otherAlbum];

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.DELETED);
    assert.deepStrictEqual(findAlbumCalls, []);
  });

  it('keeps an album Plex still has', async () => {
    await saveAlbum({ ratingKey: '500' });
    albums = [otherAlbum];
    plexItems = { '500': { ratingKey: '500' } as PlexMetadata };

    await scan();

    const album = await reload();
    assert.strictEqual(album.status, MediaStatus.AVAILABLE);
    assert.strictEqual(album.ratingKey, '500');
    assert.deepStrictEqual(plexCalls, ['500']);
  });

  it('keeps an album when Plex cannot be asked', async () => {
    await saveAlbum({ ratingKey: '500' });
    albums = [otherAlbum];
    plexError = new Error('connect ETIMEDOUT');

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.AVAILABLE);
  });

  it('deletes an album Plex no longer has and clears its Plex link', async () => {
    await saveAlbum({ ratingKey: '500' });
    albums = [otherAlbum];

    await scan();

    const album = await reload();
    assert.strictEqual(album.status, MediaStatus.DELETED);
    assert.strictEqual(album.ratingKey, null);
  });

  it('keeps an album Jellyfin may still have', async () => {
    getSettings().main.mediaServerType = MediaServerType.JELLYFIN;
    await saveAlbum({ jellyfinMediaId: 'abc' });
    albums = [otherAlbum];

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.AVAILABLE);
  });

  it('keeps the Lidarr link of an album with a request in flight', async () => {
    const media = await saveAlbum();
    const request = await saveRequest(media, MediaRequestStatus.APPROVED);
    albums = [otherAlbum];

    await scan();

    const album = await reload();
    assert.strictEqual(album.status, MediaStatus.DELETED);
    assert.strictEqual(album.externalServiceId, 10);
    assert.strictEqual(album.serviceId, 3);
    // As for movies and shows, the request is completed
    assert.strictEqual(
      (await reloadRequest(request.id)).status,
      MediaRequestStatus.COMPLETED
    );
  });

  it('resets a processing album removed from Lidarr and declines its request', async () => {
    const media = await saveAlbum({ status: MediaStatus.PROCESSING });
    const request = await saveRequest(media, MediaRequestStatus.APPROVED);
    albums = [otherAlbum];

    await scan();

    const album = await reload();
    assert.strictEqual(album.status, MediaStatus.UNKNOWN);
    assert.strictEqual(album.serviceId, null);
    assert.strictEqual(album.externalServiceId, null);
    assert.strictEqual(
      (await reloadRequest(request.id)).status,
      MediaRequestStatus.DECLINED
    );
  });

  it('resets a processing album unmonitored with nothing downloaded', async () => {
    await saveAlbum({ status: MediaStatus.PROCESSING });
    albums = [emptied];
    albumById = { 10: emptied };

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.UNKNOWN);
    // Plex is not asked about albums that never finished
    assert.deepStrictEqual(plexCalls, []);
  });

  it('keeps a processing album Lidarr is still downloading', async () => {
    await saveAlbum({ status: MediaStatus.PROCESSING });
    albums = [fakeAlbum({ statistics: stats(3) })];

    await scan();

    assert.strictEqual((await reload()).status, MediaStatus.PROCESSING);
  });
});
