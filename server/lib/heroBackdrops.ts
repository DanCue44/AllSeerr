import TheAudioDb from '@server/api/theaudiodb';
import { getProxiedImageBuffer } from '@server/lib/imageProxies';
import logger from '@server/logger';
import type { AlbumResult, BookResult } from '@server/models/Search';
import { LRUCache } from 'lru-cache';
import sharp from 'sharp';

/** Slides in the featured hero banner, the only items enriched */
export const HERO_SLIDES = 6;

/** Other trending covers laid behind the book slides */
export const HERO_COLLAGE_COVERS = 12;

const PALETTE_SIZE = 3;
// Covers are shrunk to this many pixels a side before counting colours
const SAMPLE_SIZE = 32;
// Colours closer than this (RGB distance) count as the same colour
const MIN_COLOUR_DISTANCE = 56;
// Lightness range of backdrop colours, dark enough for light text on top
const BACKDROP_MIN_LIGHTNESS = 0.14;
const BACKDROP_MAX_LIGHTNESS = 0.42;

const toHex = (r: number, g: number, b: number): string =>
  '#' +
  [r, g, b]
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('');

const distance = (a: number[], b: number[]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Picks the dominant colours of an image from its raw pixels, most prominent
 * first. Colours are bucketed, and buckets are ranked by how much of the
 * image they cover, favouring saturated colours over greys and pushing
 * near black and near white (page margins, borders) to the back. Always
 * returns `size` hex colours, padding with darker shades of the first one
 * when the image has fewer distinct colours.
 */
export const pickPalette = (
  pixels: Uint8Array,
  channels: number,
  size = PALETTE_SIZE
): string[] => {
  const buckets = new Map<
    number,
    { r: number; g: number; b: number; count: number }
  >();

  for (let i = 0; i + 2 < pixels.length; i += channels) {
    if (channels === 4 && pixels[i + 3] < 128) {
      continue;
    }
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count += 1;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  const ranked = [...buckets.values()]
    .map((bucket) => {
      const rgb = [
        bucket.r / bucket.count,
        bucket.g / bucket.count,
        bucket.b / bucket.count,
      ];
      const max = Math.max(...rgb) / 255;
      const min = Math.min(...rgb) / 255;
      const lightness = (max + min) / 2;
      const saturation =
        max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
      const extreme = lightness < 0.08 || lightness > 0.92 ? 0.15 : 1;

      return {
        rgb,
        score: bucket.count * (0.35 + saturation) * extreme,
      };
    })
    .sort((a, b) => b.score - a.score);

  const picked: number[][] = [];
  for (const { rgb } of ranked) {
    if (
      picked.every((colour) => distance(colour, rgb) >= MIN_COLOUR_DISTANCE)
    ) {
      picked.push(rgb);
      if (picked.length === size) {
        break;
      }
    }
  }

  const base = picked[0] ?? [32, 32, 40];
  while (picked.length < size) {
    const shade = 0.6 ** picked.length;
    picked.push(base.map((value) => value * shade));
  }

  return picked.map(([r, g, b]) => toHex(r, g, b));
};

/**
 * Brings a colour into the lightness range of a dark backdrop, keeping its
 * hue and saturation, so a white or pastel cover still gives a backdrop that
 * light text and the dark interface sit well on
 */
export const toBackdropTone = (hex: string): string => {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255
  );
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const chroma = max - min;
  const saturation =
    chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (chroma) {
    hue =
      max === r
        ? ((g - b) / chroma + 6) % 6
        : max === g
          ? (b - r) / chroma + 2
          : (r - g) / chroma + 4;
  }

  const toned = Math.min(
    BACKDROP_MAX_LIGHTNESS,
    Math.max(BACKDROP_MIN_LIGHTNESS, lightness)
  );
  const tonedChroma = (1 - Math.abs(2 * toned - 1)) * saturation;
  const x = tonedChroma * (1 - Math.abs((hue % 2) - 1));
  const [r1, g1, b1] = [
    [tonedChroma, x, 0],
    [x, tonedChroma, 0],
    [0, tonedChroma, x],
    [0, x, tonedChroma],
    [x, 0, tonedChroma],
    [tonedChroma, 0, x],
  ][Math.floor(hue) % 6];
  const m = toned - tonedChroma / 2;

  return toHex((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255);
};

/**
 * The dominant colours of an encoded image (JPEG, PNG, WebP...), toned for a
 * dark backdrop
 */
export const extractPalette = async (image: Buffer): Promise<string[]> => {
  const { data, info } = await sharp(image)
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return pickPalette(data, info.channels).map(toBackdropTone);
};

// One entry per cover url, three short strings each
const paletteCache = new LRUCache<string, string[]>({ max: 500 });

/**
 * The palette of a proxied cover image, loaded through the image proxy (so the
 * browser gets it from the disk cache too) and kept in memory afterwards.
 * Null when the cover cannot be loaded.
 */
export const getCoverPalette = async (
  url: string
): Promise<string[] | null> => {
  const cached = paletteCache.get(url);
  if (cached) {
    return cached;
  }

  try {
    const image = await getProxiedImageBuffer(url);
    if (!image) {
      return null;
    }
    const palette = await extractPalette(image);
    paletteCache.set(url, palette);
    return palette;
  } catch (e) {
    logger.debug('Unable to read the colours of a cover', {
      label: 'Hero',
      url,
      errorMessage: e.message,
    });
    return null;
  }
};

export const clearPaletteCache = (): void => paletteCache.clear();

/**
 * The albums for the featured hero: the first few with a cover, given their
 * artist's TheAudioDB fanart as a backdrop, or the palette of their cover
 * when the artist has none. Only these few artists are looked up, keeping
 * TheAudioDB calls within the free key's limit.
 */
export const getAlbumHeroes = async (
  albums: AlbumResult[]
): Promise<AlbumResult[]> => {
  const heroes = albums
    .filter((album) => album.posterPath)
    .slice(0, HERO_SLIDES);

  const artistIds = heroes
    .map((album) => album.artistId)
    .filter((id): id is string => !!id);
  let images: Awaited<ReturnType<TheAudioDb['batchGetArtistImages']>> = {};
  if (artistIds.length) {
    try {
      images = await new TheAudioDb().batchGetArtistImages(artistIds);
    } catch (e) {
      logger.debug('Unable to look up artist fanart for the hero', {
        label: 'Hero',
        errorMessage: e.message,
      });
    }
  }

  return Promise.all(
    heroes.map(async (album): Promise<AlbumResult> => {
      const artistBackdrop =
        (album.artistId && images[album.artistId]?.artistBackground) || null;
      if (artistBackdrop) {
        return { ...album, artistBackdrop };
      }
      const palette = await getCoverPalette(album.posterPath as string);
      return palette
        ? { ...album, artistBackdrop: null, palette }
        : { ...album, artistBackdrop: null };
    })
  );
};

/**
 * The books for the featured hero, the first few with a cover, each given the
 * palette of its cover, and the covers of the other books to lay behind them
 */
export const getBookHeroes = async (
  books: BookResult[]
): Promise<{ results: BookResult[]; collage: string[] }> => {
  const withCovers = books.filter((book) => book.posterPath);
  const heroes = withCovers.slice(0, HERO_SLIDES);
  // A short list lends its slide covers to the collage as well
  const others = withCovers.slice(HERO_SLIDES);
  const collage = (others.length >= HERO_SLIDES ? others : withCovers)
    .slice(0, HERO_COLLAGE_COVERS)
    .map((book) => book.posterPath as string);

  const results = await Promise.all(
    heroes.map(async (book): Promise<BookResult> => {
      const palette = await getCoverPalette(book.posterPath as string);
      return palette ? { ...book, palette } : book;
    })
  );

  return { results, collage };
};
