import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import type { LidarrAlbum } from '@server/api/servarr/lidarr';
import LidarrAPI from '@server/api/servarr/lidarr';

const ALBUM_MBID = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';

const fakeAlbum = (overrides: Partial<LidarrAlbum> = {}): LidarrAlbum => ({
  id: 42,
  mbId: ALBUM_MBID,
  title: 'OK Computer',
  monitored: true,
  artistId: 7,
  foreignAlbumId: ALBUM_MBID,
  titleSlug: 'ok-computer',
  profileId: 1,
  duration: 0,
  albumType: 'Album',
  ...overrides,
});

/**
 * A Lidarr client whose HTTP calls are recorded and answered from the given
 * albums of the artist
 */
const createApi = (artistAlbums: LidarrAlbum[]) => {
  const lidarr = new LidarrAPI({
    url: 'http://localhost:8686/api/v1',
    apiKey: 'test-key',
  });
  const calls: { method: string; url: string; data?: unknown }[] = [];
  const http = (lidarr as unknown as { axios: Record<string, unknown> }).axios;

  http.get = async (url: string, config?: { params?: unknown }) => {
    calls.push({ method: 'get', url, data: config?.params });
    if (url === '/trackfile') {
      return {
        data: [
          { id: 501, albumId: 42 },
          { id: 502, albumId: 42 },
        ],
      };
    }
    if (url === '/album') {
      return { data: artistAlbums };
    }
    return { data: {} };
  };
  http.delete = async (
    url: string,
    config?: { params?: unknown; data?: unknown }
  ) => {
    calls.push({
      method: 'delete',
      url,
      data: config?.data ?? config?.params,
    });
    return { data: {} };
  };
  http.put = async (url: string, data: unknown) => {
    calls.push({ method: 'put', url, data });
    return { data: {} };
  };

  return { lidarr, calls };
};

describe('LidarrAPI.removeAlbumFiles', () => {
  it('deletes the files and unmonitors the album, keeping an artist with other monitored albums', async () => {
    const { lidarr, calls } = createApi([
      fakeAlbum(),
      fakeAlbum({ id: 43, monitored: true }),
    ]);
    mock.method(lidarr, 'getAlbumByForeignAlbumId', async () => fakeAlbum());

    const result = await lidarr.removeAlbumFiles(ALBUM_MBID);

    assert.deepStrictEqual(result, { removed: true, artistRemoved: false });
    assert.deepStrictEqual(
      calls.map((call) => `${call.method} ${call.url}`),
      [
        'get /trackfile',
        'delete /trackfile/bulk',
        'put /album/monitor',
        'get /album',
      ]
    );
    assert.deepStrictEqual(calls[1].data, { trackFileIds: [501, 502] });
    assert.deepStrictEqual(calls[2].data, { albumIds: [42], monitored: false });
  });

  it('keeps an artist whose other albums have files', async () => {
    const { lidarr, calls } = createApi([
      fakeAlbum(),
      fakeAlbum({
        id: 43,
        monitored: false,
        statistics: {
          trackFileCount: 3,
          trackCount: 10,
          totalTrackCount: 10,
          sizeOnDisk: 1,
          percentOfTracks: 30,
        },
      }),
    ]);
    mock.method(lidarr, 'getAlbumByForeignAlbumId', async () => fakeAlbum());

    const result = await lidarr.removeAlbumFiles(ALBUM_MBID);

    assert.strictEqual(result.artistRemoved, false);
    assert.ok(!calls.some((call) => call.url.startsWith('/artist')));
  });

  it('removes the artist when nothing else of theirs is monitored', async () => {
    const { lidarr, calls } = createApi([
      fakeAlbum(),
      fakeAlbum({ id: 43, monitored: false }),
    ]);
    mock.method(lidarr, 'getAlbumByForeignAlbumId', async () => fakeAlbum());

    const result = await lidarr.removeAlbumFiles(ALBUM_MBID);

    assert.deepStrictEqual(result, { removed: true, artistRemoved: true });
    const artistCall = calls.find((call) => call.url === '/artist/7');
    assert.ok(artistCall);
    assert.strictEqual(artistCall.method, 'delete');
    assert.deepStrictEqual(artistCall.data, {
      deleteFiles: false,
      addImportListExclusion: false,
    });
  });

  it('does nothing for an album that is not in Lidarr', async () => {
    const { lidarr, calls } = createApi([]);
    mock.method(lidarr, 'getAlbumByForeignAlbumId', async () =>
      fakeAlbum({ id: 0 })
    );

    const result = await lidarr.removeAlbumFiles(ALBUM_MBID);

    assert.deepStrictEqual(result, { removed: false, artistRemoved: false });
    assert.strictEqual(calls.length, 0);
  });
});
