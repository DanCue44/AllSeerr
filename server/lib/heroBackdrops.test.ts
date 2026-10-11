import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';

import TheAudioDb from '@server/api/theaudiodb';
import {
  clearPaletteCache,
  extractPalette,
  getAlbumHeroes,
  getBookHeroes,
  getCoverPalette,
  HERO_COLLAGE_COVERS,
  HERO_SLIDES,
  pickPalette,
  toBackdropTone,
} from '@server/lib/heroBackdrops';
import ImageProxy from '@server/lib/imageproxy';
import type { AlbumResult, BookResult } from '@server/models/Search';
import sharp from 'sharp';

const HEX = /^#[0-9a-f]{6}$/;

const rgbDistance = (a: string, b: string): number => {
  const channels = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
};

/** Raw RGB pixels, `count` of each colour in turn */
const pixels = (...runs: [number[], number][]): Uint8Array =>
  Uint8Array.from(
    runs.flatMap(([rgb, count]) =>
      Array.from({ length: count }, () => rgb).flat()
    )
  );

/** A PNG with a band of each colour, as tall as its share */
const bandedImage = async (bands: [string, number][]): Promise<Buffer> => {
  const height = bands.reduce((sum, [, share]) => sum + share, 0);
  let top = 0;
  const composites = [];
  for (const [colour, share] of bands) {
    composites.push({
      input: {
        create: {
          width: 40,
          height: share,
          channels: 3 as const,
          background: colour,
        },
      },
      top,
      left: 0,
    });
    top += share;
  }
  return sharp({
    create: { width: 40, height, channels: 3, background: '#000000' },
  })
    .composite(composites)
    .png()
    .toBuffer();
};

let coverImage: Buffer;
const proxyCalls: string[] = [];
let failingPaths = new Set<string>();

before(async () => {
  coverImage = await bandedImage([
    ['#c0392b', 30],
    ['#1f4e9c', 10],
  ]);
});

// Covers come through the image proxy, which is stubbed so nothing reaches
// the network
mock.method(ImageProxy.prototype, 'getImage', async (path: string) => {
  proxyCalls.push(path);
  if (failingPaths.has(path)) {
    throw new Error('Failed to load image');
  }
  return {
    imageBuffer: coverImage,
    meta: {
      revalidateAfter: 0,
      curRevalidate: 0,
      isStale: false,
      etag: '',
      extension: 'png',
      cacheKey: path,
      cacheMiss: false,
    },
  };
});

let artistLookups: string[][] = [];
let fanart: Record<string, string | null> = {};

mock.method(
  TheAudioDb.prototype,
  'batchGetArtistImages',
  async (ids: string[]) => {
    artistLookups.push(ids);
    return Object.fromEntries(
      ids.map((id) => [
        id,
        { artistThumb: null, artistBackground: fanart[id] ?? null },
      ])
    );
  }
);

beforeEach(() => {
  clearPaletteCache();
  proxyCalls.length = 0;
  failingPaths = new Set();
  artistLookups = [];
  fanart = {};
});

const album = (
  n: number,
  overrides: Partial<AlbumResult> = {}
): AlbumResult => ({
  id: `album-${n}`,
  mediaType: 'album',
  title: `Album ${n}`,
  artistId: `artist-${n}`,
  artistName: `Artist ${n}`,
  posterPath: `https://archive.org/download/mbid-${n}/mbid-${n}-1_thumb250.jpg`,
  ...overrides,
});

const book = (n: number, overrides: Partial<BookResult> = {}): BookResult => ({
  id: `OL${n}W`,
  mediaType: 'book',
  title: `Book ${n}`,
  posterPath: `https://covers.openlibrary.org/b/id/${n}-M.jpg`,
  ...overrides,
});

describe('pickPalette', () => {
  it('puts the colour covering most of the image first', () => {
    const palette = pickPalette(
      pixels([[200, 30, 30], 70], [[30, 60, 200], 20], [[40, 160, 60], 10]),
      3
    );

    assert.strictEqual(palette.length, 3);
    palette.forEach((colour) => assert.match(colour, HEX));
    assert.ok(rgbDistance(palette[0], '#c81e1e') < 20, palette[0]);
    assert.ok(palette.some((colour) => rgbDistance(colour, '#1e3cc8') < 20));
    assert.ok(palette.some((colour) => rgbDistance(colour, '#28a03c') < 20));
  });

  it('prefers a colour over the white or black around it', () => {
    const palette = pickPalette(
      pixels([[250, 250, 250], 50], [[5, 5, 5], 30], [[180, 120, 20], 20]),
      3
    );

    assert.ok(rgbDistance(palette[0], '#b47814') < 20, palette[0]);
  });

  it('keeps the colours apart from one another', () => {
    const palette = pickPalette(
      pixels([[200, 30, 30], 40], [[205, 35, 35], 40], [[30, 60, 200], 20]),
      3
    );

    for (let i = 0; i < palette.length; i++) {
      for (let j = i + 1; j < palette.length; j++) {
        assert.notStrictEqual(palette[i], palette[j]);
      }
    }
    assert.ok(rgbDistance(palette[1], '#1e3cc8') < 20, palette[1]);
  });

  it('pads a single colour image with darker shades of it', () => {
    const palette = pickPalette(pixels([[120, 60, 200], 64]), 3);

    assert.strictEqual(palette.length, 3);
    assert.strictEqual(palette[0], '#783cc8');
    assert.strictEqual(palette[1], '#482478');
    assert.strictEqual(palette[2], '#2b1648');
  });

  it('skips transparent pixels', () => {
    const rgba = Uint8Array.from([
      ...Array.from({ length: 80 }, () => [255, 0, 255, 0]).flat(),
      ...Array.from({ length: 20 }, () => [20, 120, 90, 255]).flat(),
    ]);

    assert.ok(rgbDistance(pickPalette(rgba, 4)[0], '#14785a') < 20);
  });

  it('falls back to a dark slate for an empty image', () => {
    assert.deepStrictEqual(pickPalette(new Uint8Array(), 3, 2), [
      '#202028',
      '#131318',
    ]);
  });
});

describe('toBackdropTone', () => {
  it('darkens white and lifts black into the backdrop range', () => {
    assert.strictEqual(toBackdropTone('#ffffff'), '#6b6b6b');
    assert.strictEqual(toBackdropTone('#000000'), '#242424');
  });

  it('keeps the hue of a pale colour while darkening it', () => {
    const toned = toBackdropTone('#eee7e1');
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(toned.slice(i, i + 2), 16));

    assert.ok(r > g && g > b, toned);
    assert.ok(r < 140, toned);
  });

  it('leaves a colour already in range as it is', () => {
    assert.ok(rgbDistance(toBackdropTone('#2a9d8f'), '#2a9d8f') <= 2);
    assert.ok(rgbDistance(toBackdropTone('#1f4e9c'), '#1f4e9c') <= 2);
  });
});

describe('extractPalette', () => {
  it('reads the dominant colours of an encoded image', async () => {
    const palette = await extractPalette(coverImage);

    assert.ok(rgbDistance(palette[0], '#c0392b') < 24, palette[0]);
    assert.ok(rgbDistance(palette[1], '#1f4e9c') < 24, palette[1]);
  });
});

describe('getCoverPalette', () => {
  it('loads a cover through its image proxy once', async () => {
    const url = 'https://covers.openlibrary.org/b/id/1-M.jpg';

    const first = await getCoverPalette(url);
    const second = await getCoverPalette(url);

    assert.deepStrictEqual(first, second);
    assert.deepStrictEqual(proxyCalls, ['/b/id/1-M.jpg']);
  });

  it('gives up on hosts it does not proxy and on failed loads', async () => {
    failingPaths.add('/b/id/2-M.jpg');

    assert.strictEqual(
      await getCoverPalette('https://example.com/cover.jpg'),
      null
    );
    assert.strictEqual(
      await getCoverPalette('https://covers.openlibrary.org/b/id/2-M.jpg'),
      null
    );
    assert.deepStrictEqual(proxyCalls, ['/b/id/2-M.jpg']);
  });
});

describe('getAlbumHeroes', () => {
  it('backs each album with its artist fanart, or else its cover colours', async () => {
    fanart = { 'artist-1': 'https://r2.theaudiodb.com/images/fanart-1.jpg' };

    const heroes = await getAlbumHeroes([album(1), album(2)]);

    assert.strictEqual(
      heroes[0].artistBackdrop,
      'https://r2.theaudiodb.com/images/fanart-1.jpg'
    );
    assert.strictEqual(heroes[0].palette, undefined);
    assert.strictEqual(heroes[1].artistBackdrop, null);
    assert.strictEqual(heroes[1].palette?.length, 3);
    // Only the album without fanart needed its cover read
    assert.deepStrictEqual(proxyCalls, [
      '/download/mbid-2/mbid-2-1_thumb250.jpg',
    ]);
  });

  it('looks up only the artists of the few hero albums, in one batch', async () => {
    const albums = [
      album(0, { posterPath: null }),
      ...Array.from({ length: 20 }, (_, i) => album(i + 1)),
    ];

    const heroes = await getAlbumHeroes(albums);

    assert.strictEqual(heroes.length, HERO_SLIDES);
    assert.strictEqual(heroes[0].id, 'album-1');
    assert.strictEqual(artistLookups.length, 1);
    assert.deepStrictEqual(
      artistLookups[0],
      Array.from({ length: HERO_SLIDES }, (_, i) => `artist-${i + 1}`)
    );
  });

  it('falls back to cover colours when TheAudioDB fails', async () => {
    const batch = mock.method(
      TheAudioDb.prototype,
      'batchGetArtistImages',
      async () => {
        throw new Error('rate limited');
      }
    );

    try {
      const heroes = await getAlbumHeroes([album(1)]);

      assert.strictEqual(heroes[0].artistBackdrop, null);
      assert.strictEqual(heroes[0].palette?.length, 3);
    } finally {
      batch.mock.restore();
    }
  });

  it('leaves the palette out when the cover cannot be read', async () => {
    failingPaths.add('/download/mbid-1/mbid-1-1_thumb250.jpg');

    const [hero] = await getAlbumHeroes([album(1, { artistId: undefined })]);

    assert.strictEqual(hero.artistBackdrop, null);
    assert.strictEqual(hero.palette, undefined);
    assert.strictEqual(artistLookups.length, 0);
  });
});

describe('getBookHeroes', () => {
  it('gives the hero books their cover colours and collages the rest', async () => {
    const books = [
      book(0, { posterPath: null }),
      ...Array.from({ length: 20 }, (_, i) => book(i + 1)),
    ];

    const { results, collage } = await getBookHeroes(books);

    assert.strictEqual(results.length, HERO_SLIDES);
    assert.ok(results.every((result) => result.palette?.length === 3));
    assert.strictEqual(collage.length, HERO_COLLAGE_COVERS);
    assert.strictEqual<string>(
      collage[0],
      `https://covers.openlibrary.org/b/id/${HERO_SLIDES + 1}-M.jpg`
    );
    assert.ok(!collage.includes(results[0].posterPath as string));
    // Only the hero covers are read
    assert.strictEqual(proxyCalls.length, HERO_SLIDES);
  });

  it('lends the slide covers to the collage when the list is short', async () => {
    const { results, collage } = await getBookHeroes([
      book(1),
      book(2),
      book(3),
    ]);

    assert.strictEqual(results.length, 3);
    assert.deepStrictEqual(
      collage,
      results.map((result) => result.posterPath)
    );
  });
});
