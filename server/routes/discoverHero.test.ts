import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';

import ListenBrainzAPI from '@server/api/listenbrainz';
import OpenLibrary from '@server/api/openlibrary';
import type { OlSearchDoc } from '@server/api/openlibrary/interfaces';
import TheAudioDb from '@server/api/theaudiodb';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { HERO_SLIDES } from '@server/lib/heroBackdrops';
import ImageProxy from '@server/lib/imageproxy';
import { setupTestDb } from '@server/test/db';
import express from 'express';
import sharp from 'sharp';
import request from 'supertest';
import discoverBooksRoutes from './discoverBooks';
import discoverMusicRoutes from './discoverMusic';

const FANART_ARTIST = 'a74b1b7f-71a5-4011-9441-d0b5e4122711';
const PLAIN_ARTIST = 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d';
const ALBUM_MBID = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';

let cover: Buffer;
before(async () => {
  cover = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#2a9d8f' },
  })
    .png()
    .toBuffer();
});

mock.method(ImageProxy.prototype, 'getImage', async (path: string) => ({
  imageBuffer: cover,
  meta: {
    revalidateAfter: 0,
    curRevalidate: 0,
    isStale: false,
    etag: '',
    extension: 'png',
    cacheKey: path,
    cacheMiss: false,
  },
}));

const artistLookups: string[][] = [];
mock.method(
  TheAudioDb.prototype,
  'batchGetArtistImages',
  async (ids: string[]) => {
    artistLookups.push(ids);
    return {
      [FANART_ARTIST]: {
        artistThumb: null,
        artistBackground: 'https://r2.theaudiodb.com/images/fanart.jpg',
      },
    };
  }
);

mock.method(ListenBrainzAPI.prototype, 'getTopAlbums', async () => ({
  payload: {
    count: 12,
    from_ts: 0,
    last_updated: 0,
    offset: 0,
    range: 'week',
    to_ts: 0,
    total_release_group_count: 12,
    release_groups: Array.from({ length: 12 }, (_, i) => ({
      artist_mbids: [i === 0 ? FANART_ARTIST : PLAIN_ARTIST],
      artist_name: i === 0 ? 'Radiohead' : 'Someone',
      listen_count: 1000 - i,
      release_group_mbid:
        i === 0
          ? ALBUM_MBID
          : `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      release_group_name: `Album ${i}`,
      caa_id: 100 + i,
      caa_release_mbid: `11111111-1111-1111-1111-${String(i).padStart(12, '0')}`,
    })),
  },
}));

mock.method(
  OpenLibrary.prototype,
  'getTrending',
  async (): Promise<{ query: string; works: OlSearchDoc[] }> => ({
    query: '/trending/daily',
    works: Array.from({ length: 20 }, (_, i) => ({
      key: `/works/OL${i + 1}W`,
      title: `Book ${i + 1}`,
      cover_i: 1000 + i,
    })),
  })
);

const app = express();
app.use('/discover/music', discoverMusicRoutes);
app.use('/discover/books', discoverBooksRoutes);

setupTestDb();

describe('GET /discover/music/hero', () => {
  it('lists the hero albums with fanart or cover colours', async () => {
    await getRepository(Media).save(
      new Media({
        mbId: ALBUM_MBID,
        mediaType: MediaType.MUSIC,
        status: MediaStatus.AVAILABLE,
      })
    );
    artistLookups.length = 0;

    const res = await request(app).get('/discover/music/hero');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.results.length, HERO_SLIDES);
    assert.strictEqual(
      res.body.results[0].artistBackdrop,
      'https://r2.theaudiodb.com/images/fanart.jpg'
    );
    assert.strictEqual(
      res.body.results[0].mediaInfo.status,
      MediaStatus.AVAILABLE
    );
    assert.strictEqual(res.body.results[1].artistBackdrop, null);
    assert.strictEqual(res.body.results[1].palette[0], '#2a9d8f');
    // One batch for the hero albums only
    assert.strictEqual(artistLookups.length, 1);
    assert.strictEqual(artistLookups[0].length, HERO_SLIDES);
  });
});

describe('GET /discover/books/hero', () => {
  it('lists the hero books with their colours and a collage', async () => {
    const res = await request(app).get('/discover/books/hero');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.results.length, HERO_SLIDES);
    assert.strictEqual(res.body.results[0].palette[0], '#2a9d8f');
    assert.strictEqual(res.body.collage.length, 12);
    assert.strictEqual<string>(
      res.body.collage[0],
      `https://covers.openlibrary.org/b/id/${1000 + HERO_SLIDES}-M.jpg`
    );
  });
});
