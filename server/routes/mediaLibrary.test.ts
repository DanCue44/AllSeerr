import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import type { ChaptarrBook } from '@server/api/servarr/chaptarr';
import ChaptarrAPI from '@server/api/servarr/chaptarr';
import type { LidarrAlbum } from '@server/api/servarr/lidarr';
import LidarrAPI from '@server/api/servarr/lidarr';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import {
  clearLibraryMetadataCache,
  matchesAlbumType,
  sortLibraryMedia,
} from '@server/lib/mediaLibrary';
import type { ChaptarrSettings, LidarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import express from 'express';
import request from 'supertest';
import mediaRoutes from './media';

let albums: Partial<LidarrAlbum>[] = [];
let books: Partial<ChaptarrBook>[] = [];

// getAlbums is an instance arrow function, so the prototype answers for it
Object.defineProperty(LidarrAPI.prototype, 'getAlbums', {
  get() {
    return async () => albums;
  },
  set() {},
  configurable: true,
});
mock.method(ChaptarrAPI.prototype, 'getAllBooks', async () => books);

const app = express();
app.use(express.json());
app.use('/media', mediaRoutes);

const server = {
  id: 0,
  name: 'Main',
  hostname: 'localhost',
  port: 8686,
  apiKey: 'key',
  useSsl: false,
};

setupTestDb();

beforeEach(() => {
  clearLibraryMetadataCache();
  getSettings().lidarr = [server as LidarrSettings];
  getSettings().chaptarr = [{ ...server, port: 8789 } as ChaptarrSettings];
});

const album = (
  mbId: string,
  title: string,
  artistName: string,
  releaseDate: string,
  albumType = 'Album'
): Partial<LidarrAlbum> => ({
  foreignAlbumId: mbId,
  title,
  albumType,
  releaseDate,
  artist: { artistName } as LidarrAlbum['artist'],
});

const saveMusic = async (mbIds: string[]) => {
  const saved: Media[] = [];

  for (const mbId of mbIds) {
    saved.push(
      await getRepository(Media).save(
        new Media({
          mbId,
          mediaType: MediaType.MUSIC,
          status: MediaStatus.AVAILABLE,
        })
      )
    );
  }

  return saved;
};

const ids = (res: request.Response): (string | null)[] =>
  res.body.results.map((media: Media) => media.mbId ?? media.olId);

describe('GET /media for the music library', () => {
  beforeEach(() => {
    albums = [
      album('mb-ok', 'OK Computer', 'Radiohead', '1997-05-21'),
      album('mb-abbey', 'Abbey Road', 'The Beatles', '1969-09-26'),
      album('mb-single', 'Creep', 'Radiohead', '1992-09-21', 'Single'),
      album('mb-live', 'Live at Leeds', 'The Who', '1970-05-16', 'Broadcast'),
    ];
  });

  it('sorts by title, artist and release date', async () => {
    // mb-plex is on the media server only, so Lidarr knows nothing of it
    await saveMusic(['mb-ok', 'mb-plex', 'mb-abbey', 'mb-single', 'mb-live']);
    const query = { filter: 'allavailable', mediaType: 'music' };

    const byTitle = await request(app)
      .get('/media')
      .query({ ...query, sort: 'title' });
    assert.strictEqual(byTitle.status, 200);
    assert.deepStrictEqual(ids(byTitle), [
      'mb-abbey',
      'mb-single',
      'mb-live',
      'mb-ok',
      'mb-plex',
    ]);

    const byArtist = await request(app)
      .get('/media')
      .query({ ...query, sort: 'creator' });
    assert.deepStrictEqual(ids(byArtist), [
      'mb-single',
      'mb-ok',
      'mb-abbey',
      'mb-live',
      'mb-plex',
    ]);

    const newest = await request(app)
      .get('/media')
      .query({ ...query, sort: 'releaseDate' });
    assert.deepStrictEqual(ids(newest), [
      'mb-ok',
      'mb-single',
      'mb-live',
      'mb-abbey',
      'mb-plex',
    ]);

    const oldest = await request(app)
      .get('/media')
      .query({ ...query, sort: 'releaseDate', sortDirection: 'asc' });
    assert.deepStrictEqual(ids(oldest).slice(0, 2), ['mb-abbey', 'mb-live']);
  });

  it('pages through the sorted list', async () => {
    await saveMusic(['mb-ok', 'mb-abbey', 'mb-single', 'mb-live']);

    const res = await request(app).get('/media').query({
      filter: 'allavailable',
      mediaType: 'music',
      sort: 'title',
      take: 2,
      skip: 2,
    });

    assert.deepStrictEqual(ids(res), ['mb-live', 'mb-ok']);
    assert.strictEqual(res.body.pageInfo.results, 4);
    assert.strictEqual(res.body.pageInfo.pages, 2);
    assert.strictEqual(res.body.pageInfo.page, 2);
  });

  it('filters by album type', async () => {
    await saveMusic(['mb-ok', 'mb-abbey', 'mb-single', 'mb-live', 'mb-plex']);
    const query = { filter: 'allavailable', mediaType: 'music' };

    const singles = await request(app)
      .get('/media')
      .query({ ...query, albumType: 'single' });
    assert.deepStrictEqual(ids(singles), ['mb-single']);

    const other = await request(app)
      .get('/media')
      .query({ ...query, albumType: 'other' });
    assert.deepStrictEqual(ids(other), ['mb-live']);

    // Newest first, as without a sort
    const full = await request(app)
      .get('/media')
      .query({ ...query, albumType: 'album' });
    assert.deepStrictEqual(ids(full), ['mb-abbey', 'mb-ok']);
  });

  it('keeps the newest first when Lidarr cannot be read', async () => {
    albums = [];
    getSettings().lidarr = [];
    await saveMusic(['mb-ok', 'mb-abbey']);

    const res = await request(app)
      .get('/media')
      .query({ filter: 'allavailable', mediaType: 'music', sort: 'title' });

    assert.deepStrictEqual(ids(res), ['mb-abbey', 'mb-ok']);
  });
});

describe('GET /media for the books library', () => {
  beforeEach(async () => {
    books = [
      {
        foreignBookId: 'ch-1',
        openLibraryWorkId: 'OL1W',
        title: 'Dune',
        author: { authorName: 'Frank Herbert', foreignAuthorId: 'a1' },
        releaseDate: '1965-08-01T00:00:00Z',
      },
      {
        foreignBookId: 'ch-2',
        title: 'Anathem',
        author: { authorName: 'Neal Stephenson', foreignAuthorId: 'a2' },
        releaseDate: '2008-09-09T00:00:00Z',
      },
    ];
    const repository = getRepository(Media);
    await repository.save(
      new Media({
        olId: 'OL1W',
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
        statusAudio: MediaStatus.AVAILABLE,
      })
    );
    await repository.save(
      new Media({
        olId: 'OL2W',
        foreignBookId: 'ch-2',
        mediaType: MediaType.BOOK,
        statusAudio: MediaStatus.AVAILABLE,
      })
    );
    await repository.save(
      new Media({
        olId: 'OL3W',
        mediaType: MediaType.BOOK,
        status: MediaStatus.PARTIALLY_AVAILABLE,
      })
    );
    await repository.save(
      new Media({
        olId: 'OL4W',
        mediaType: MediaType.BOOK,
        status: MediaStatus.PROCESSING,
      })
    );
  });

  it('lists books available in either format', async () => {
    const res = await request(app)
      .get('/media')
      .query({ filter: 'allavailable', mediaType: 'book' });

    assert.deepStrictEqual(ids(res), ['OL3W', 'OL2W', 'OL1W']);
  });

  it('filters by format', async () => {
    const query = { filter: 'allavailable', mediaType: 'book' };

    const ebooks = await request(app)
      .get('/media')
      .query({ ...query, format: 'ebook' });
    assert.deepStrictEqual(ids(ebooks), ['OL3W', 'OL1W']);

    const audiobooks = await request(app)
      .get('/media')
      .query({ ...query, format: 'audiobook' });
    assert.deepStrictEqual(ids(audiobooks), ['OL2W', 'OL1W']);

    const both = await request(app)
      .get('/media')
      .query({ ...query, format: 'both' });
    assert.deepStrictEqual(ids(both), ['OL1W']);
  });

  it('sorts by title and author from Chaptarr', async () => {
    const query = { filter: 'allavailable', mediaType: 'book' };

    const byTitle = await request(app)
      .get('/media')
      .query({ ...query, sort: 'title' });
    assert.deepStrictEqual(ids(byTitle), ['OL2W', 'OL1W', 'OL3W']);

    const byAuthor = await request(app)
      .get('/media')
      .query({ ...query, sort: 'creator', sortDirection: 'desc' });
    assert.deepStrictEqual(ids(byAuthor), ['OL2W', 'OL1W', 'OL3W']);
  });
});

describe('sortLibraryMedia', () => {
  const index = new Map([
    ['a', { title: 'beta', creator: 'Zed', releaseDate: '2001' }],
    ['b', { title: 'Alpha', creator: 'zed', releaseDate: '2001-05-01' }],
    ['c', { title: 'album 10' }],
    ['d', { title: 'album 9' }],
  ]);
  const media = ['a', 'b', 'c', 'd', 'e'].map((mbId, i) => ({
    id: i + 1,
    mbId,
    olId: null,
    foreignBookId: null,
  }));
  const order = (sorted: typeof media) => sorted.map((item) => item.mbId);

  it('ignores case and orders numbers by value', () => {
    assert.deepStrictEqual(
      order(sortLibraryMedia(media, index, 'title', 'asc')),
      ['d', 'c', 'b', 'a', 'e']
    );
  });

  it('keeps titles without a value last, newest first', () => {
    assert.deepStrictEqual(
      order(sortLibraryMedia(media, index, 'releaseDate', 'desc')),
      ['b', 'a', 'e', 'd', 'c']
    );
    assert.deepStrictEqual(
      order(sortLibraryMedia(media, index, 'releaseDate', 'asc')),
      ['a', 'b', 'e', 'd', 'c']
    );
  });

  it('groups an artist and sorts their titles', () => {
    assert.deepStrictEqual(
      order(sortLibraryMedia(media, index, 'creator', 'asc')).slice(0, 2),
      ['b', 'a']
    );
  });

  it('matches album types, with anything unusual as other', () => {
    assert.strictEqual(matchesAlbumType({ albumType: 'ep' }, 'ep'), true);
    assert.strictEqual(
      matchesAlbumType({ albumType: 'broadcast' }, 'other'),
      true
    );
    assert.strictEqual(
      matchesAlbumType({ albumType: 'album' }, 'other'),
      false
    );
    assert.strictEqual(matchesAlbumType(undefined, 'album'), false);
  });
});
