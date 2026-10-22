import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaRequest from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import type { DownloadServerGroup, QueueRecord } from '@server/lib/downloads';
import {
  collectDownloads,
  getProgress,
  linkDownloads,
  mapDownloadStatus,
  mapQueueRecords,
  parseTimeLeft,
  sortDownloads,
} from '@server/lib/downloads';
import { Permission } from '@server/lib/permissions';
import type { DVRSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';

// Requests are saved without telling anyone
mock.method(MediaRequest, 'sendNotification', async () => undefined);

const dvr = (id: number, name: string, is4k = false): DVRSettings => ({
  id,
  name,
  hostname: name.toLowerCase().replace(/\s/g, ''),
  port: 7878,
  apiKey: 'test-key',
  useSsl: false,
  activeProfileId: 1,
  activeProfileName: 'Any',
  activeDirectory: '/media',
  tags: [],
  is4k,
  isDefault: true,
  syncEnabled: true,
  preventSearch: false,
  tagRequests: false,
  overrideRule: [],
});

const group = (
  service: DownloadServerGroup['service'],
  server: DVRSettings
): DownloadServerGroup => ({ service, server, serverIds: [server.id] });

const radarr = group('radarr', dvr(0, 'Radarr'));
const radarr4k = group('radarr', dvr(1, '4K Radarr', true));
const sonarr = group('sonarr', dvr(0, 'Sonarr'));
const chaptarr = group('chaptarr', dvr(0, 'Chaptarr'));

const record = (fields: Partial<QueueRecord>): QueueRecord => ({
  id: 1,
  title: 'Release.Title.2024.1080p',
  size: 1000,
  sizeleft: 250,
  status: 'downloading',
  trackedDownloadStatus: 'ok',
  trackedDownloadState: 'downloading',
  protocol: 'usenet',
  downloadClient: 'NZBGet',
  indexer: 'Example Indexer',
  ...fields,
});

describe('mapDownloadStatus', () => {
  const cases: [Partial<QueueRecord>, string][] = [
    [{}, 'downloading'],
    [{ status: 'queued', trackedDownloadState: 'downloading' }, 'queued'],
    [{ status: 'delay' }, 'queued'],
    [{ status: 'paused' }, 'paused'],
    [
      { status: 'completed', trackedDownloadState: 'importPending' },
      'importPending',
    ],
    [{ status: 'completed', trackedDownloadState: 'importing' }, 'importing'],
    [{ status: 'completed', trackedDownloadState: 'imported' }, 'completed'],
    [
      {
        status: 'completed',
        trackedDownloadState: 'importBlocked',
        trackedDownloadStatus: 'warning',
      },
      'warning',
    ],
    [{ status: 'failed' }, 'failed'],
    [{ trackedDownloadState: 'failedPending' }, 'failed'],
    [{ trackedDownloadStatus: 'error' }, 'failed'],
    [
      {
        status: 'warning',
        protocol: 'torrent',
        statusMessages: [
          {
            title: 'Book.torrent',
            messages: ['The download is stalled with no connections'],
          },
        ],
      },
      'stalled',
    ],
    [
      {
        status: 'downloading',
        trackedDownloadStatus: 'warning',
        statusMessages: [{ title: 'Unable to parse the release' }],
      },
      'warning',
    ],
    [{ status: 'downloadClientUnavailable' }, 'warning'],
  ];

  for (const [fields, expected] of cases) {
    it(`maps ${JSON.stringify(fields)} to ${expected}`, () => {
      assert.strictEqual(mapDownloadStatus(record(fields)), expected);
    });
  }
});

describe('getProgress and parseTimeLeft', () => {
  it('works out the part downloaded', () => {
    assert.strictEqual(getProgress(1000, 250, 'downloading'), 0.75);
    assert.strictEqual(getProgress(0, 0, 'queued'), 0);
    assert.strictEqual(getProgress(1000, 1200, 'downloading'), 0);
    assert.strictEqual(getProgress(1000, 600, 'importing'), 1);
  });

  it('reads the time left with and without days', () => {
    assert.strictEqual(parseTimeLeft('00:12:30'), 750);
    assert.strictEqual(parseTimeLeft('1.02:00:05'), 93_605);
    assert.strictEqual(parseTimeLeft(undefined), undefined);
    assert.strictEqual(parseTimeLeft('soon'), undefined);
  });
});

describe('mapQueueRecords', () => {
  it('maps a movie with its poster, client and progress', () => {
    const [{ item, ref }] = mapQueueRecords(radarr, [
      record({
        id: 7,
        movieId: 12,
        timeleft: '00:05:00',
        movie: {
          title: 'Sample Movie',
          year: 2024,
          tmdbId: 550,
          images: [
            { coverType: 'fanart', remoteUrl: 'https://image.tmdb.org/f.jpg' },
            { coverType: 'poster', remoteUrl: 'https://image.tmdb.org/p.jpg' },
          ],
        },
      }),
    ]);

    assert.deepStrictEqual(ref, { queueIds: [7], movieId: 12, tmdbId: 550 });
    assert.strictEqual(item.id, 'radarr:0:7');
    assert.strictEqual(item.title, 'Sample Movie');
    assert.strictEqual(item.mediaType, 'movie');
    assert.strictEqual(item.posterUrl, 'https://image.tmdb.org/p.jpg');
    assert.strictEqual(item.backdropUrl, 'https://image.tmdb.org/f.jpg');
    assert.strictEqual(item.protocol, 'usenet');
    assert.strictEqual(item.downloadClient, 'NZBGet');
    assert.strictEqual(item.progress, 0.75);
    assert.strictEqual(item.timeLeftSeconds, 300);
    assert.strictEqual(item.needsAttention, false);
    assert.strictEqual(item.canSearch, true);
  });

  it('keeps the quality and the output path the arr reports', () => {
    const [{ item }] = mapQueueRecords(radarr, [
      record({
        id: 8,
        quality: { quality: { name: 'Bluray-1080p' } },
        outputPath: '/downloads/completed/Movies/Sample.Movie.2024',
      }),
    ]);

    assert.strictEqual(item.quality, 'Bluray-1080p');
    assert.strictEqual(
      item.outputPath,
      '/downloads/completed/Movies/Sample.Movie.2024'
    );
    assert.strictEqual(item.backdropUrl, undefined);
  });

  it('gathers the episodes of a season pack into one download', () => {
    const episode = (id: number, episodeNumber: number) =>
      record({
        id,
        downloadId: 'SABnzbd_nzo_pack',
        seriesId: 3,
        episodeId: 100 + episodeNumber,
        series: { title: 'Sample Show', tvdbId: 81189 },
        episode: { seasonNumber: 2, episodeNumber, title: `E${episodeNumber}` },
      });
    const downloads = mapQueueRecords(sonarr, [
      episode(1, 2),
      episode(2, 1),
      record({
        id: 3,
        downloadId: 'single',
        seriesId: 3,
        episodeId: 301,
        series: { title: 'Sample Show' },
        episode: { seasonNumber: 3, episodeNumber: 1, title: 'Pilot' },
      }),
    ]);

    assert.strictEqual(downloads.length, 2);
    const [pack, single] = downloads;
    assert.deepStrictEqual(pack.ref.queueIds, [1, 2]);
    assert.deepStrictEqual(pack.ref.episodeIds, [102, 101]);
    assert.deepStrictEqual(pack.item.episodeNumbers, [1, 2]);
    assert.strictEqual(pack.item.seasonNumber, 2);
    assert.strictEqual(pack.item.episodeTitle, undefined);
    assert.strictEqual(single.item.episodeTitle, 'Pilot');
  });

  it('keeps the format of a book and leaves unknown downloads unsearchable', () => {
    const [audio, unknown] = mapQueueRecords(chaptarr, [
      record({
        id: 1,
        bookId: 501,
        protocol: 'torrent',
        downloadClient: 'qBittorrent',
        book: { title: 'The Lantern Keeper', mediaType: 'audiobook' },
      }),
      record({ id: 2, title: 'Mystery.Release' }),
    ]);

    assert.strictEqual(audio.item.mediaType, 'audiobook');
    assert.strictEqual(audio.item.protocol, 'torrent');
    assert.strictEqual(audio.item.canSearch, true);
    assert.strictEqual(unknown.item.title, 'Mystery.Release');
    assert.strictEqual(unknown.item.canSearch, false);
  });

  it('puts downloads needing attention first', () => {
    const downloads = mapQueueRecords(radarr, [
      record({ id: 1, status: 'queued', movie: { title: 'A' } }),
      record({ id: 2, movie: { title: 'B' } }),
      record({ id: 3, status: 'failed', movie: { title: 'C' } }),
    ]);

    assert.deepStrictEqual(
      sortDownloads(downloads.map(({ item }) => item)).map((i) => i.title),
      ['C', 'B', 'A']
    );
  });
});

describe('linkDownloads', () => {
  setupTestDb();

  const createUser = (email: string) =>
    getRepository(User).save(
      new User({
        email,
        username: email.split('@')[0],
        avatar: `/avatar/${email}`,
        permissions: Permission.REQUEST,
      })
    );

  const request = async (
    media: Media,
    user: User,
    fields: Partial<MediaRequest>
  ) => {
    // Saved without servers set up, so nothing is sent anywhere
    const settings = getSettings();
    const saved = {
      radarr: settings.radarr,
      sonarr: settings.sonarr,
      chaptarr: settings.chaptarr,
    };
    settings.radarr = [];
    settings.sonarr = [];
    settings.chaptarr = [];
    await getRepository(MediaRequest).save(
      new MediaRequest({
        type: media.mediaType,
        status: MediaRequestStatus.APPROVED,
        media,
        requestedBy: user,
        ...fields,
      })
    );
    Object.assign(settings, saved);
  };

  it('finds the movie by its Radarr id, then by its TMDB id', async () => {
    const viewer = await createUser('viewer@example.com');
    const other = await createUser('other@example.com');
    const linked = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 550,
        status: MediaStatus.PROCESSING,
        serviceId: 0,
        externalServiceId: 12,
      })
    );
    const unlinked = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 680,
        status: MediaStatus.PROCESSING,
      })
    );
    await request(linked, viewer, {});
    await request(unlinked, other, {
      status: MediaRequestStatus.DECLINED,
    });
    await request(unlinked, viewer, { status: MediaRequestStatus.COMPLETED });

    const downloads = mapQueueRecords(radarr, [
      record({ id: 1, movieId: 12, movie: { title: 'Linked', tmdbId: 550 } }),
      record({ id: 2, movieId: 99, movie: { title: 'Unlinked', tmdbId: 680 } }),
      record({ id: 3, movieId: 98, movie: { title: 'Not here', tmdbId: 1 } }),
    ]);
    await linkDownloads(radarr, downloads);

    const [first, second, third] = downloads.map(({ item }) => item);
    assert.strictEqual(first.mediaId, linked.id);
    assert.strictEqual(first.tmdbId, 550);
    assert.deepStrictEqual(first.target, { is4k: false });
    assert.deepStrictEqual(first.requester, {
      id: viewer.id,
      displayName: 'viewer',
      avatar: '/avatar/viewer@example.com',
    });
    // The declined request is left out
    assert.strictEqual(second.mediaId, unlinked.id);
    assert.strictEqual(second.requester?.id, viewer.id);
    assert.strictEqual(third.mediaId, undefined);
    assert.strictEqual(third.requester, undefined);
  });

  it('matches 4K requests only to 4K servers', async () => {
    const viewer = await createUser('viewer@example.com');
    const fan = await createUser('fan@example.com');
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 550,
        status: MediaStatus.PROCESSING,
        status4k: MediaStatus.PROCESSING,
        serviceId4k: 1,
        externalServiceId4k: 40,
      })
    );
    await request(media, viewer, { is4k: false });
    await request(media, fan, { is4k: true });

    const downloads = mapQueueRecords(radarr4k, [
      record({ id: 1, movieId: 40, movie: { title: 'Sample', tmdbId: 550 } }),
    ]);
    await linkDownloads(radarr4k, downloads);

    assert.strictEqual(downloads[0].item.mediaId, media.id);
    assert.strictEqual(downloads[0].item.requester?.id, fan.id);
    assert.deepStrictEqual(downloads[0].item.target, { is4k: true });
  });

  it('finds the audiobook of a book by its Chaptarr id', async () => {
    const reader = await createUser('reader@example.com');
    const listener = await createUser('listener@example.com');
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.BOOK,
        olId: 'OL900001W',
        status: MediaStatus.PROCESSING,
        statusAudio: MediaStatus.PROCESSING,
        serviceId: 0,
        externalServiceId: 500,
        externalServiceIdAudio: 501,
      })
    );
    await request(media, reader, { isAudiobook: false });
    await request(media, listener, { isAudiobook: true });

    // Chaptarr left the book out, the format comes from the media
    const downloads = mapQueueRecords(chaptarr, [
      record({ id: 1, bookId: 501 }),
    ]);
    await linkDownloads(chaptarr, downloads);

    const [{ item }] = downloads;
    assert.strictEqual(item.mediaType, 'audiobook');
    assert.strictEqual(item.olId, 'OL900001W');
    assert.deepStrictEqual(item.target, { bookFormat: 'audiobook' });
    assert.strictEqual(item.requester?.id, listener.id);
  });
});

describe('collectDownloads', () => {
  setupTestDb();

  it('lists the servers that did not answer and shows the others', async () => {
    const response = await collectDownloads([radarr, sonarr], async (g) => {
      if (g.service === 'sonarr') {
        throw new Error('[Sonarr] Failed to retrieve queue: ECONNREFUSED');
      }
      return [
        record({ id: 1, movie: { title: 'Downloading' } }),
        record({ id: 2, status: 'queued', movie: { title: 'Waiting' } }),
        record({ id: 3, status: 'failed', movie: { title: 'Broken' } }),
      ];
    });

    assert.deepStrictEqual(response.serverErrors, [
      {
        service: 'sonarr',
        serverId: 0,
        serverName: 'Sonarr',
        message: '[Sonarr] Failed to retrieve queue: ECONNREFUSED',
      },
    ]);
    assert.deepStrictEqual(response.totals, {
      total: 3,
      downloading: 1,
      queued: 1,
      attention: 1,
    });
    assert.deepStrictEqual(
      response.results.map((item) => item.title),
      ['Broken', 'Downloading', 'Waiting']
    );
  });
});
