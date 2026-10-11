import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rankMusicResult } from '@server/lib/musicSearchRank';
import type { AlbumResult, ArtistResult } from '@server/models/Search';

const album = (overrides: Partial<AlbumResult>): AlbumResult =>
  ({
    id: 'x',
    mediaType: 'album',
    title: '',
    score: 100,
    ...overrides,
  }) as AlbumResult;

describe('rankMusicResult', () => {
  const query = 'Michael Jackson Thriller';

  it('ranks the real album above a tribute with a closer text match', () => {
    const real = album({
      title: 'Thriller',
      artistName: 'Michael Jackson',
      albumType: 'Album',
      score: 90,
    });
    const tribute = album({
      title: "Smooth Sax Tribute to Michael Jackson's Thriller",
      artistName: 'Various Artists',
      albumType: 'Album',
      score: 100,
    });

    assert.ok(rankMusicResult(query, real) > rankMusicResult(query, tribute));
  });

  it('pushes compilations and live albums down', () => {
    const studio = album({
      title: 'Thriller',
      artistName: 'Michael Jackson',
      albumType: 'Album',
    });
    const live = album({
      title: 'Thriller',
      artistName: 'Michael Jackson',
      albumType: 'Album',
      secondaryTypes: ['Live'],
    });

    assert.ok(rankMusicResult(query, studio) > rankMusicResult(query, live));
  });

  it('boosts an artist whose name is exactly the query', () => {
    const exact = {
      id: 'a',
      mediaType: 'artist',
      name: 'Michael Jackson',
      score: 80,
    } as ArtistResult;
    const other = {
      id: 'b',
      mediaType: 'artist',
      name: 'Michael Jackson Tribute Band',
      score: 95,
    } as ArtistResult;

    assert.ok(
      rankMusicResult('Michael Jackson', exact) >
        rankMusicResult('Michael Jackson', other)
    );
  });
});
