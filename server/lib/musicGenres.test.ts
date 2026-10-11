import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  LbReleaseGroup,
  LbReleaseGroupMetadata,
} from '@server/api/listenbrainz/interfaces';
import type { MusicGenrePoolItem } from '@server/lib/musicGenres';
import {
  buildMusicGenrePool,
  getTopGenreTags,
  isMusicGenre,
  isTagInGenre,
  selectGenreAlbums,
} from '@server/lib/musicGenres';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const releaseGroup = (n: number, artist = `Artist ${n}`): LbReleaseGroup => ({
  artist_mbids: [`artist-${artist}`],
  artist_name: artist,
  listen_count: 1000 - n,
  release_group_mbid: id(n),
  release_group_name: `Album ${n}`,
});

const metadata = (
  tags: { tag: string; count: number; genre?: boolean }[],
  {
    type = 'Album',
    artistTags = [],
  }: {
    type?: string;
    artistTags?: { tag: string; count: number; genre?: boolean }[];
  } = {}
): LbReleaseGroupMetadata => ({
  release_group: { name: 'Album', type, date: '2020-01-01' },
  tag: {
    release_group: tags.map(({ tag, count, genre = true }) => ({
      tag,
      count,
      genre_mbid: genre ? 'genre' : undefined,
    })),
    artist: artistTags.map(({ tag, count, genre = true }) => ({
      tag,
      count,
      genre_mbid: genre ? 'genre' : undefined,
    })),
  },
});

const poolItem = (
  n: number,
  genres: string[],
  artistId = `artist-${n}`
): MusicGenrePoolItem => ({
  id: id(n),
  title: `Album ${n}`,
  artistId,
  artistName: artistId,
  posterPath: null,
  genres,
});

describe('isTagInGenre', () => {
  it('places a tag by its last word and the extra tags of a genre', () => {
    assert.ok(isTagInGenre('rock', 'rock'));
    assert.ok(isTagInGenre('Alternative Rock', 'rock'));
    assert.ok(isTagInGenre('post-punk', 'rock'));
    assert.ok(isTagInGenre('k-pop', 'pop'));
    assert.ok(isTagInGenre('dance-pop', 'pop'));
    assert.ok(isTagInGenre('pop rap', 'hip-hop'));
    assert.ok(isTagInGenre('hip hop', 'hip-hop'));
    assert.ok(isTagInGenre('neo soul', 'rnb'));
    assert.ok(isTagInGenre('hard bop', 'jazz'));
    assert.ok(isTagInGenre('alt-country', 'country'));
    assert.ok(isTagInGenre('nu metal', 'metal'));
  });

  it('does not match a root inside another word', () => {
    assert.ok(!isTagInGenre('rockabilly', 'rock'));
    assert.ok(!isTagInGenre('alternative metal', 'rock'));
    assert.ok(!isTagInGenre('trip hop', 'hip-hop'));
    assert.ok(!isTagInGenre('new jack swing', 'jazz'));
    assert.ok(!isTagInGenre('pop rock', 'pop'));
  });

  it('knows the genre slugs', () => {
    assert.ok(isMusicGenre('hip-hop'));
    assert.ok(!isMusicGenre('polka'));
    assert.ok(!isMusicGenre('toString'));
  });
});

describe('getTopGenreTags', () => {
  it('takes the strongest genres of the release group, not free tags', () => {
    assert.deepStrictEqual(
      getTopGenreTags(
        metadata([
          { tag: 'seen live', count: 50, genre: false },
          { tag: 'indie rock', count: 3 },
          { tag: 'Shoegaze', count: 9 },
          { tag: 'dream pop', count: 5 },
          { tag: 'noise pop', count: 1 },
        ])
      ),
      ['shoegaze', 'dream pop', 'indie rock']
    );
  });

  it('falls back to the genres of the artists, adding up their counts', () => {
    assert.deepStrictEqual(
      getTopGenreTags(
        metadata([], {
          artistTags: [
            { tag: 'jazz', count: 2 },
            { tag: 'soul', count: 3 },
            { tag: 'jazz', count: 2 },
          ],
        })
      ),
      ['jazz', 'soul']
    );
  });
});

describe('buildMusicGenrePool', () => {
  it('keeps albums and EPs with genres once, in order', () => {
    const pool = buildMusicGenrePool(
      [
        releaseGroup(1),
        releaseGroup(2),
        releaseGroup(3),
        releaseGroup(1),
        releaseGroup(4),
        { ...releaseGroup(5), release_group_mbid: null },
      ],
      {
        [id(1)]: metadata([{ tag: 'rock', count: 1 }]),
        // A single is left out
        [id(2)]: metadata([{ tag: 'rock', count: 1 }], { type: 'Single' }),
        // So is an album without genres
        [id(3)]: metadata([{ tag: 'favourite', count: 4, genre: false }]),
        [id(4)]: metadata([{ tag: 'jazz', count: 1 }], { type: 'EP' }),
      }
    );

    assert.deepStrictEqual(
      pool.map((item) => [item.id, item.genres, item.albumType]),
      [
        [id(1), ['rock'], 'Album'],
        [id(4), ['jazz'], 'EP'],
      ]
    );
  });
});

describe('selectGenreAlbums', () => {
  it('picks the albums of a genre with at most two per artist', () => {
    const pool = [
      poolItem(1, ['indie rock'], 'busy'),
      poolItem(2, ['jazz']),
      poolItem(3, ['rock'], 'busy'),
      poolItem(4, ['grunge'], 'busy'),
      poolItem(5, ['k-pop', 'alternative rock']),
    ];

    assert.deepStrictEqual(
      selectGenreAlbums(pool, 'rock').map((item) => item.id),
      [id(1), id(3), id(5)]
    );
    assert.deepStrictEqual(
      selectGenreAlbums(pool, 'jazz').map((item) => item.id),
      [id(2)]
    );
    assert.deepStrictEqual(selectGenreAlbums(pool, 'country'), []);
  });
});
