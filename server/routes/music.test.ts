import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';

import CoverArtArchive from '@server/api/coverartarchive';
import ListenBrainzAPI from '@server/api/listenbrainz';
import type { LbSimilarArtist } from '@server/api/listenbrainz/interfaces';
import MusicBrainz from '@server/api/musicbrainz';
import type {
  MbAlbumDetails,
  MbArtist,
  MbArtistDetails,
  MbBrowseReleaseGroupsResponse,
  MbRelease,
  MbReleaseGroup,
} from '@server/api/musicbrainz/interfaces';
import TheAudioDb from '@server/api/theaudiodb';
import TheMovieDb from '@server/api/themoviedb';
import type { TmdbSearchMultiResponse } from '@server/api/themoviedb/interfaces';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MetadataAlbum from '@server/entity/MetadataAlbum';
import type { LidarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import artistRoutes from './artist';
import authRoutes from './auth';
import coverArtRoutes from './coverart';
import discoverMusicRoutes from './discoverMusic';
import musicRoutes from './music';
import searchRoutes from './search';

const ALBUM_MBID = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';
const OLD_ALBUM_MBID = 'b1392450-e666-3926-a536-22c65f834433';
const LIVE_ALBUM_MBID = 'f4d0a6a4-8bbc-3e8a-a6c9-1d4f1c0b8a3e';
const ARTIST_MBID = 'a74b1b7f-71a5-4011-9441-d0b5e4122711';

const radiohead = {
  name: 'Radiohead',
  artist: { id: ARTIST_MBID, name: 'Radiohead', 'sort-name': 'Radiohead' },
};

const releaseGroup: MbReleaseGroup = {
  id: ALBUM_MBID,
  title: 'OK Computer',
  'primary-type': 'Album',
  'secondary-types': [],
  'first-release-date': '1997-05-21',
  'artist-credit': [radiohead],
  releases: [
    {
      id: '22222222-2222-2222-2222-222222222222',
      title: 'OK Computer',
      status: 'Official',
      date: '1997-06-16',
    },
    {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'OK Computer',
      status: 'Official',
      date: '1997-05-21',
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      title: 'OK Computer',
      status: 'Bootleg',
      date: '1996-01-01',
    },
  ],
  genres: [
    { name: 'art rock', count: 5 },
    { name: 'alternative rock', count: 9 },
  ],
  relations: [
    {
      type: 'wikidata',
      url: { id: 'x', resource: 'https://www.wikidata.org/wiki/Q213434' },
    },
  ],
};

let getReleaseCalls: string[] = [];

mock.method(MusicBrainz.prototype, 'getAlbum', async () => releaseGroup);
mock.method(
  MusicBrainz.prototype,
  'getRelease',
  async ({ releaseId }: { releaseId: string }): Promise<MbRelease> => {
    getReleaseCalls.push(releaseId);
    return {
      id: releaseId,
      title: 'OK Computer',
      media: [
        {
          position: 1,
          'track-count': 2,
          tracks: [
            {
              id: 't1',
              number: '1',
              position: 1,
              title: 'Airbag',
              length: 284000,
              recording: { id: 'r1', title: 'Airbag' },
            },
            {
              id: 't2',
              number: '2',
              position: 2,
              title: 'Paranoid Android',
              recording: {
                id: 'r2',
                title: 'Paranoid Android',
                length: 383000,
              },
            },
          ],
        },
      ],
    };
  }
);
mock.method(MusicBrainz.prototype, 'getArtistWikipediaExtract', async () => ({
  title: 'Radiohead',
  url: 'https://en.wikipedia.org/wiki/Radiohead',
  content: 'English rock band.',
}));
mock.method(
  MusicBrainz.prototype,
  'getArtist',
  async (): Promise<MbArtist> => ({
    id: ARTIST_MBID,
    name: 'Radiohead',
    'sort-name': 'Radiohead',
    type: 'Group',
    country: 'GB',
    area: { id: 'a', name: 'United Kingdom' },
    'life-span': { begin: '1985', ended: false },
    tags: [{ name: 'rock', count: 3 }],
  })
);
mock.method(
  MusicBrainz.prototype,
  'getArtistReleaseGroups',
  async (): Promise<MbBrowseReleaseGroupsResponse> => ({
    'release-group-count': 3,
    'release-group-offset': 0,
    'release-groups': [
      {
        id: OLD_ALBUM_MBID,
        title: 'Pablo Honey',
        'primary-type': 'Album',
        'secondary-types': [],
        'first-release-date': '1993-02-22',
        'artist-credit': [radiohead],
      },
      {
        id: ALBUM_MBID,
        title: 'OK Computer',
        'primary-type': 'Album',
        'secondary-types': [],
        'first-release-date': '1997-05-21',
        'artist-credit': [radiohead],
      },
      {
        id: LIVE_ALBUM_MBID,
        title: 'I Might Be Wrong',
        'primary-type': 'Album',
        'secondary-types': ['Live'],
        'first-release-date': '2001-11-12',
        'artist-credit': [radiohead],
      },
    ],
  })
);
mock.method(
  MusicBrainz.prototype,
  'searchAlbum',
  async (): Promise<MbAlbumDetails[]> => [
    {
      id: ALBUM_MBID,
      score: 90,
      title: 'OK Computer',
      'primary-type': 'Album',
      'first-release-date': '1997-05-21',
      'artist-credit': [radiohead],
    },
  ]
);
mock.method(
  MusicBrainz.prototype,
  'searchArtist',
  async (): Promise<MbArtistDetails[]> => [
    {
      id: ARTIST_MBID,
      score: 100,
      name: 'Radiohead',
      type: 'Group',
      'sort-name': 'Radiohead',
    },
  ]
);
mock.method(
  CoverArtArchive.prototype,
  'getFrontCoverUrl',
  async () => 'https://archive.org/download/mbid-1/mbid-1-123_thumb250.jpg'
);
mock.method(
  CoverArtArchive.prototype,
  'batchGetCoverArt',
  async (ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, `https://covers/${id}.jpg`]))
);
mock.method(TheAudioDb.prototype, 'getArtistImages', async () => ({
  artistThumb: 'https://r2.theaudiodb.com/thumb.jpg',
  artistBackground: 'https://r2.theaudiodb.com/fanart.jpg',
}));
mock.method(TheAudioDb.prototype, 'batchGetArtistImages', async () => ({
  [ARTIST_MBID]: {
    artistThumb: 'https://r2.theaudiodb.com/thumb.jpg',
    artistBackground: null,
  },
}));

Object.defineProperty(TheMovieDb.prototype, 'searchMulti', {
  set() {},
  get() {
    return async (): Promise<TmdbSearchMultiResponse> => ({
      page: 1,
      total_pages: 1,
      total_results: 1,
      results: [
        {
          id: 550,
          media_type: 'movie',
          title: 'Fight Club',
          original_title: 'Fight Club',
          adult: false,
          video: false,
          release_date: '1999-10-15',
          genre_ids: [],
          original_language: 'en',
          overview: '',
          popularity: 1,
          vote_average: 8,
          vote_count: 1,
        },
      ],
    });
  },
  configurable: true,
});

mock.method(ListenBrainzAPI.prototype, 'getFreshReleases', async () => ({
  payload: {
    releases: [
      {
        artist_credit_name: 'Radiohead',
        artist_mbids: [ARTIST_MBID],
        caa_id: 123,
        caa_release_mbid: '11111111-1111-1111-1111-111111111111',
        listen_count: 1,
        release_date: '2026-10-01',
        release_group_mbid: ALBUM_MBID,
        release_group_primary_type: 'Album',
        release_mbid: '11111111-1111-1111-1111-111111111111',
        release_name: 'OK Computer',
      },
      // A second release of the same album is shown once
      {
        artist_credit_name: 'Radiohead',
        artist_mbids: [ARTIST_MBID],
        listen_count: 1,
        release_date: '2026-10-02',
        release_group_mbid: ALBUM_MBID,
        release_mbid: '22222222-2222-2222-2222-222222222222',
        release_name: 'OK Computer',
      },
    ],
  },
}));
mock.method(ListenBrainzAPI.prototype, 'getTopAlbums', async () => ({
  payload: {
    count: 1,
    from_ts: 0,
    last_updated: 0,
    offset: 0,
    range: 'week',
    to_ts: 0,
    total_release_group_count: 1,
    release_groups: [
      {
        artist_mbids: [ARTIST_MBID],
        artist_name: 'Radiohead',
        listen_count: 1000,
        release_group_mbid: OLD_ALBUM_MBID,
        release_group_name: 'Pablo Honey',
      },
    ],
  },
}));

mock.method(ListenBrainzAPI.prototype, 'getTopArtists', async () => ({
  payload: {
    count: 1,
    from_ts: 0,
    last_updated: 0,
    offset: 0,
    range: 'week',
    to_ts: 0,
    total_artist_count: 1,
    artists: [
      { artist_mbid: ARTIST_MBID, artist_name: 'Radiohead', listen_count: 50 },
      // Artists without an MBID cannot be linked to
      { artist_mbid: null, artist_name: 'Unknown', listen_count: 40 },
    ],
  },
}));
mock.method(
  ListenBrainzAPI.prototype,
  'getReleaseGroupMetadata',
  async (ids: string[]) =>
    Object.fromEntries(
      ids.map((id) => [
        id,
        {
          release_group: {
            name: 'Pablo Honey',
            type: 'Album',
            date: '1993-02-22',
          },
          tag: {
            release_group: [
              { tag: 'alternative rock', count: 5, genre_mbid: 'x' },
            ],
          },
        },
      ])
    )
);

const NIRVANA_MBID = '5b11f4ce-a62d-471e-81fc-a69a8278c7da';
let similarArtistsImpl: () => Promise<LbSimilarArtist[]> = async () => [];
mock.method(ListenBrainzAPI.prototype, 'getSimilarArtists', async () =>
  similarArtistsImpl()
);

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/music', musicRoutes);
  app.use('/artist', artistRoutes);
  app.use('/coverart', coverArtRoutes);
  app.use('/search', searchRoutes);
  app.use('/discover/music', discoverMusicRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ status: err.status ?? 500, message: err.message });
    }
  );
  return app;
}

async function login() {
  const settings = getSettings();
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent
      .post('/auth/local')
      .send({ email: 'demo@seerr.dev', password: 'test1234' });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

before(() => {
  app = createApp();
});

setupTestDb();

beforeEach(() => {
  getReleaseCalls = [];
  getSettings().lidarr = [];
});

describe('GET /music/:id', () => {
  it('returns the album with its tracks, cover and request status', async () => {
    await getRepository(Media).save(
      new Media({
        mbId: ALBUM_MBID,
        mediaType: MediaType.MUSIC,
        status: MediaStatus.AVAILABLE,
      })
    );

    const agent = await login();
    const res = await agent.get(`/music/${ALBUM_MBID}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.title, 'OK Computer');
    assert.strictEqual(res.body.mediaType, 'album');
    assert.strictEqual(res.body.artist.id, ARTIST_MBID);
    assert.strictEqual(res.body.artistCredit, 'Radiohead');
    assert.deepStrictEqual(res.body.genres, ['alternative rock', 'art rock']);
    // The earliest official release stands for the album
    assert.deepStrictEqual(getReleaseCalls, [
      '11111111-1111-1111-1111-111111111111',
    ]);
    assert.deepStrictEqual(
      res.body.tracks.map((track: { name: string; length: number }) => [
        track.name,
        track.length,
      ]),
      [
        ['Airbag', 284000],
        ['Paranoid Android', 383000],
      ]
    );
    assert.strictEqual(
      res.body.posterPath,
      'https://archive.org/download/mbid-1/mbid-1-123_thumb500.jpg'
    );
    assert.strictEqual(res.body.artistWikipedia.content, 'English rock band.');
    assert.strictEqual(res.body.mediaInfo.status, MediaStatus.AVAILABLE);
  });

  it('answers 404 for an id that is not a MusicBrainz id', async () => {
    const agent = await login();
    const res = await agent.get('/music/550');

    assert.strictEqual(res.status, 404);
  });
});

describe('GET /artist/:id', () => {
  it('returns the artist with its discography, newest first', async () => {
    await getRepository(Media).save(
      new Media({
        mbId: OLD_ALBUM_MBID,
        mediaType: MediaType.MUSIC,
        status: MediaStatus.PROCESSING,
      })
    );
    await getRepository(MetadataAlbum).save(
      new MetadataAlbum({ mbAlbumId: ALBUM_MBID, caaUrl: 'https://cover.jpg' })
    );

    const agent = await login();
    const res = await agent.get(`/artist/${ARTIST_MBID}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.name, 'Radiohead');
    assert.strictEqual(res.body.area, 'United Kingdom');
    assert.strictEqual(res.body.beginDate, '1985');
    assert.deepStrictEqual(res.body.genres, ['rock']);
    assert.strictEqual(res.body.wikipedia.title, 'Radiohead');
    assert.strictEqual(
      res.body.artistThumb,
      'https://r2.theaudiodb.com/thumb.jpg'
    );
    assert.deepStrictEqual(res.body.typeCounts, { Album: 2, Live: 1 });
    assert.deepStrictEqual(
      res.body.releaseGroups.map((album: { title: string }) => album.title),
      ['I Might Be Wrong', 'OK Computer', 'Pablo Honey']
    );

    const okComputer = res.body.releaseGroups[1];
    assert.strictEqual(okComputer.posterPath, 'https://cover.jpg');
    assert.strictEqual(okComputer.needsCoverArt, false);
    assert.strictEqual(okComputer.artistName, 'Radiohead');

    const pabloHoney = res.body.releaseGroups[2];
    assert.strictEqual(pabloHoney.needsCoverArt, true);
    assert.strictEqual(pabloHoney.mediaInfo.status, MediaStatus.PROCESSING);
  });
});

describe('GET /artist/:id/similar', () => {
  beforeEach(() => {
    similarArtistsImpl = async () => [];
  });

  it('returns similar artists as artist cards with their images', async () => {
    similarArtistsImpl = async () => [
      { mbid: ARTIST_MBID, name: 'Radiohead', type: 'Group' },
      {
        mbid: NIRVANA_MBID,
        name: 'Nirvana',
        comment: 'US grunge band',
        type: 'Group',
      },
      // Artists without a valid MBID cannot be linked to
      { mbid: 'not-an-mbid', name: 'Unknown' },
    ];

    const agent = await login();
    const res = await agent.get(`/artist/${OLD_ALBUM_MBID}/similar`);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.results, [
      {
        id: ARTIST_MBID,
        mediaType: 'artist',
        name: 'Radiohead',
        type: 'Group',
        artistThumb: 'https://r2.theaudiodb.com/thumb.jpg',
        artistBackdrop: null,
      },
      {
        id: NIRVANA_MBID,
        mediaType: 'artist',
        name: 'Nirvana',
        type: 'Group',
        disambiguation: 'US grunge band',
        artistThumb: null,
        artistBackdrop: null,
      },
    ]);
  });

  it('returns no artists when ListenBrainz fails', async () => {
    similarArtistsImpl = async () => {
      throw new Error('[ListenBrainz] Failed to fetch similar artists');
    };

    const agent = await login();
    const res = await agent.get(`/artist/${ARTIST_MBID}/similar`);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.results, []);
  });

  it('rejects an invalid artist id', async () => {
    const agent = await login();
    const res = await agent.get('/artist/radiohead/similar');

    assert.strictEqual(res.status, 404);
  });
});

describe('GET /search (music)', () => {
  it('returns only albums and artists for the music filter', async () => {
    const agent = await login();
    const res = await agent.get('/search?query=radiohead&type=music');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((result: { mediaType: string }) => result.mediaType),
      ['artist', 'album']
    );
    assert.strictEqual(
      res.body.results[0].artistThumb,
      'https://r2.theaudiodb.com/thumb.jpg'
    );
    assert.strictEqual(res.body.results[1].artistName, 'Radiohead');
  });
});

describe('GET /search', () => {
  it('leaves music out while no Lidarr server is configured', async () => {
    const agent = await login();
    const res = await agent.get('/search?query=radiohead');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((result: { mediaType: string }) => result.mediaType),
      ['movie']
    );
  });

  it('adds albums and artists to the first page once Lidarr is set up', async () => {
    getSettings().lidarr = [{ id: 0 } as LidarrSettings];

    const agent = await login();
    const res = await agent.get('/search?query=radiohead');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((result: { mediaType: string }) => result.mediaType),
      // The artist called exactly what was searched for comes first
      ['artist', 'movie', 'album']
    );
    assert.strictEqual(res.body.totalResults, 3);
  });
});

describe('GET /discover/music', () => {
  it('lists new releases once per album with their cover', async () => {
    await getRepository(Media).save(
      new Media({
        mbId: ALBUM_MBID,
        mediaType: MediaType.MUSIC,
        status: MediaStatus.PENDING,
      })
    );

    const agent = await login();
    const res = await agent.get('/discover/music');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalResults, 1);
    assert.strictEqual(res.body.results[0].id, ALBUM_MBID);
    assert.strictEqual(
      res.body.results[0].posterPath,
      'https://archive.org/download/mbid-11111111-1111-1111-1111-111111111111/mbid-11111111-1111-1111-1111-111111111111-123_thumb250.jpg'
    );
    assert.strictEqual(
      res.body.results[0].mediaInfo.status,
      MediaStatus.PENDING
    );
  });

  it('lists popular albums, asking for covers it does not know', async () => {
    const agent = await login();
    const res = await agent.get('/discover/music/albums');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.results[0].title, 'Pablo Honey');
    assert.strictEqual(res.body.results[0].needsCoverArt, true);
  });
});

describe('GET /discover/music/artists and /genre/:genre', () => {
  it('lists popular artists with their images', async () => {
    const agent = await login();
    const res = await agent.get('/discover/music/artists');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.results.length, 1);
    assert.strictEqual(res.body.results[0].mediaType, 'artist');
    assert.strictEqual(res.body.results[0].name, 'Radiohead');
    assert.strictEqual(
      res.body.results[0].artistThumb,
      'https://r2.theaudiodb.com/thumb.jpg'
    );
  });

  it('lists the popular albums of a genre', async () => {
    const agent = await login();
    const rock = await agent.get('/discover/music/genre/rock');

    assert.strictEqual(rock.status, 200);
    assert.strictEqual(rock.body.totalResults, 1);
    assert.strictEqual(rock.body.results[0].id, OLD_ALBUM_MBID);
    assert.strictEqual(rock.body.results[0].releaseDate, '1993-02-22');
    assert.strictEqual(rock.body.results[0].needsCoverArt, true);

    const jazz = await agent.get('/discover/music/genre/jazz');
    assert.strictEqual(jazz.body.totalResults, 0);

    const unknown = await agent.get('/discover/music/genre/polka');
    assert.strictEqual(unknown.status, 404);
  });
});

describe('GET /coverart/batch/:ids', () => {
  it('returns covers keyed by release group id', async () => {
    const agent = await login();
    const res = await agent.get(
      `/coverart/batch/${ALBUM_MBID},${OLD_ALBUM_MBID}`
    );

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
      [ALBUM_MBID]: `https://covers/${ALBUM_MBID}.jpg`,
      [OLD_ALBUM_MBID]: `https://covers/${OLD_ALBUM_MBID}.jpg`,
    });
  });
});
