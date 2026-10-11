import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { LidarrCalendarAlbum } from '@server/api/servarr/lidarr';
import type { RadarrCalendarMovie } from '@server/api/servarr/radarr';
import type { SonarrCalendarEpisode } from '@server/api/servarr/sonarr';
import { MediaType } from '@server/constants/media';
import type { CalendarMedia } from '@server/lib/calendar';
import {
  applyMediaToCalendarItems,
  dedupeCalendarItems,
  normalizeLidarrCalendar,
  normalizeRadarrCalendar,
  normalizeSonarrCalendar,
  parseCalendarRange,
  shiftDate,
} from '@server/lib/calendar';

const range = { start: '2026-10-01', end: '2026-10-31' };

const movie = {
  id: 4,
  title: 'Spider-Man: Brand New Day',
  year: 2026,
  tmdbId: 969681,
  hasFile: false,
  monitored: true,
  inCinemas: '2026-07-31T00:00:00Z',
  digitalRelease: '2026-10-14T00:00:00Z',
  physicalRelease: '2026-11-03T00:00:00Z',
  images: [
    {
      coverType: 'poster',
      url: '/MediaCover/4/poster.jpg',
      remoteUrl: 'https://image.tmdb.org/t/p/original/spider.jpg',
    },
  ],
} as RadarrCalendarMovie;

const episode = {
  id: 77,
  seriesId: 3,
  seasonNumber: 2,
  episodeNumber: 5,
  title: 'The Long Night',
  airDate: '2026-10-09',
  airDateUtc: '2026-10-10T01:00:00Z',
  hasFile: false,
  monitored: true,
  series: {
    title: 'Andor',
    tvdbId: 393189,
    tmdbId: 83867,
    images: [
      {
        coverType: 'poster',
        url: '/MediaCover/3/poster.jpg',
        remoteUrl: 'https://artworks.thetvdb.com/banners/andor.jpg',
      },
    ],
  },
} as SonarrCalendarEpisode;

const album = {
  id: 9,
  title: 'Midnight Sun',
  foreignAlbumId: 'b7c1e2a4',
  releaseDate: '2026-10-23T00:00:00Z',
  artist: { artistName: 'Example Artist', foreignArtistId: 'a1' },
  images: [
    {
      coverType: 'cover',
      url: '/MediaCover/Albums/9/cover.jpg',
      remoteUrl: 'https://coverartarchive.org/release/b7c1e2a4/front.jpg',
    },
  ],
  statistics: {
    trackFileCount: 0,
    trackCount: 12,
    totalTrackCount: 12,
    sizeOnDisk: 0,
    percentOfTracks: 0,
  },
} as LidarrCalendarAlbum;

describe('parseCalendarRange', () => {
  it('accepts a valid range', () => {
    assert.deepEqual(parseCalendarRange('2026-10-01', '2026-11-30'), {
      start: '2026-10-01',
      end: '2026-11-30',
    });
  });

  it('rejects invalid dates', () => {
    assert.throws(() => parseCalendarRange('2026-02-31', '2026-03-01'));
    assert.throws(() => parseCalendarRange('10/01/2026', '2026-10-31'));
    assert.throws(() => parseCalendarRange(undefined, '2026-10-31'));
  });

  it('rejects an end date before the start date', () => {
    assert.throws(() => parseCalendarRange('2026-10-31', '2026-10-01'));
  });

  it('rejects ranges longer than the maximum', () => {
    assert.throws(() => parseCalendarRange('2026-10-01', '2026-12-31'));
  });
});

describe('shiftDate', () => {
  it('moves across month and year boundaries', () => {
    assert.equal(shiftDate('2026-10-01', -1), '2026-09-30');
    assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  });
});

describe('normalizeRadarrCalendar', () => {
  it('creates an item for each release date in the range', () => {
    assert.deepEqual(normalizeRadarrCalendar([movie], range), [
      {
        id: 'movie-969681-digital',
        type: 'movie',
        date: '2026-10-14',
        releaseType: 'digital',
        title: 'Spider-Man: Brand New Day',
        subtitle: '2026',
        tmdbId: 969681,
        posterUrl: 'https://image.tmdb.org/t/p/original/spider.jpg',
        hasFile: false,
        requestedByMe: false,
      },
    ]);
  });

  it('includes every release type that falls in the range', () => {
    const items = normalizeRadarrCalendar([movie], {
      start: '2026-07-01',
      end: '2026-11-30',
    });

    assert.deepEqual(
      items.map((item) => item.releaseType),
      ['cinema', 'digital', 'physical']
    );
  });
});

describe('normalizeSonarrCalendar', () => {
  it('uses the air date and formats the episode code', () => {
    assert.deepEqual(normalizeSonarrCalendar([episode], range), [
      {
        id: 'episode-393189-2-5',
        type: 'episode',
        date: '2026-10-09',
        airDateUtc: '2026-10-10T01:00:00Z',
        releaseType: 'airing',
        title: 'Andor',
        subtitle: 'S02E05 - The Long Night',
        tmdbId: 83867,
        tvdbId: 393189,
        posterUrl: 'https://artworks.thetvdb.com/banners/andor.jpg',
        hasFile: false,
        requestedByMe: false,
      },
    ]);
  });

  it('leaves out episodes outside the range', () => {
    assert.deepEqual(
      normalizeSonarrCalendar([{ ...episode, airDate: '2026-11-01' }], range),
      []
    );
  });

  it('treats a missing Sonarr TMDB ID as unknown', () => {
    const [item] = normalizeSonarrCalendar(
      [{ ...episode, series: { ...episode.series!, tmdbId: 0 } }],
      range
    );

    assert.equal(item.tmdbId, undefined);
  });
});

describe('normalizeLidarrCalendar', () => {
  it('maps album releases', () => {
    assert.deepEqual(normalizeLidarrCalendar([album], range), [
      {
        id: 'album-b7c1e2a4',
        type: 'album',
        date: '2026-10-23',
        releaseType: 'release',
        title: 'Midnight Sun',
        subtitle: 'Example Artist',
        posterUrl: 'https://coverartarchive.org/release/b7c1e2a4/front.jpg',
        hasFile: false,
        requestedByMe: false,
      },
    ]);
  });
});

describe('dedupeCalendarItems', () => {
  it('merges the same item from several servers', () => {
    const [standard] = normalizeSonarrCalendar([episode], range);
    const [uhd] = normalizeSonarrCalendar(
      [{ ...episode, hasFile: true }],
      range
    );

    const items = dedupeCalendarItems([standard, uhd]);

    assert.equal(items.length, 1);
    assert.equal(items[0].hasFile, true);
  });

  it('sorts by date', () => {
    const items = dedupeCalendarItems([
      ...normalizeLidarrCalendar([album], range),
      ...normalizeRadarrCalendar([movie], range),
      ...normalizeSonarrCalendar([episode], range),
    ]);

    assert.deepEqual(
      items.map((item) => item.date),
      ['2026-10-09', '2026-10-14', '2026-10-23']
    );
  });
});

describe('applyMediaToCalendarItems', () => {
  const user = { id: 1, displayName: 'Alex', avatar: '/avatar.png' };
  const friend = { id: 2, displayName: 'Sam', avatar: '/sam.png' };

  const media: CalendarMedia[] = [
    {
      id: 10,
      mediaType: MediaType.MOVIE,
      tmdbId: 969681,
      requests: [{ requestedBy: friend }],
    },
    {
      id: 11,
      mediaType: MediaType.TV,
      tmdbId: 83867,
      tvdbId: 393189,
      requests: [{ requestedBy: user }, { requestedBy: user }],
    },
  ];

  it('links media and marks the current user requests', () => {
    const items = applyMediaToCalendarItems(
      [
        ...normalizeRadarrCalendar([movie], range),
        ...normalizeSonarrCalendar([episode], range),
      ],
      media,
      { userId: 1, showRequesters: true }
    );

    assert.equal(items[0].mediaId, 10);
    assert.equal(items[0].requestedByMe, false);
    assert.deepEqual(items[0].requestedBy, [friend]);
    assert.equal(items[1].mediaId, 11);
    assert.equal(items[1].requestedByMe, true);
    assert.deepEqual(items[1].requestedBy, [user]);
  });

  it('hides requesters without permission', () => {
    const [item] = applyMediaToCalendarItems(
      normalizeRadarrCalendar([movie], range),
      media,
      { userId: 2, showRequesters: false }
    );

    assert.equal(item.requestedBy, undefined);
    assert.equal(item.requestedByMe, true);
  });

  it('matches series by TVDB ID and fills in the TMDB ID', () => {
    const [item] = applyMediaToCalendarItems(
      normalizeSonarrCalendar(
        [{ ...episode, series: { ...episode.series!, tmdbId: undefined } }],
        range
      ),
      media,
      { userId: 1, showRequesters: false }
    );

    assert.equal(item.tmdbId, 83867);
    assert.equal(item.mediaId, 11);
  });

  it('leaves items without media untouched', () => {
    const [item] = applyMediaToCalendarItems(
      normalizeLidarrCalendar([album], range),
      media,
      { userId: 1, showRequesters: true }
    );

    assert.equal(item.mediaId, undefined);
    assert.equal(item.requestedByMe, false);
  });
});
