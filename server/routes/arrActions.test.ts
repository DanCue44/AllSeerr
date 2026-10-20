import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import { IssueStatus, IssueType } from '@server/constants/issue';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Issue from '@server/entity/Issue';
import Media from '@server/entity/Media';
import Season from '@server/entity/Season';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import type {
  ChaptarrSettings,
  LidarrSettings,
  RadarrSettings,
  SonarrSettings,
} from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import axios from 'axios';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import arrActionRoutes from './arrActions';
import authRoutes from './auth';

/**
 * Every arr client is built on axios.create, so the arrs are replaced by
 * one fake instance that answers from the handlers below and records each
 * call. Nothing reaches the network.
 */
interface ArrCall {
  service: string;
  method: string;
  url: string;
  params?: Record<string, unknown>;
  data?: unknown;
}

type Handler = (call: ArrCall) => unknown;

let calls: ArrCall[] = [];
let handlers: Record<string, Handler> = {};

const SERVICE_PORTS: Record<string, string> = {
  '7878': 'radarr',
  '7879': 'radarr4k',
  '8989': 'sonarr',
  '8686': 'lidarr',
  '8789': 'chaptarr',
  '5299': 'lazylibrarian',
};

mock.method(axios, 'create', (config: { baseURL?: string } = {}) => {
  const port = /:(\d+)/.exec(config.baseURL ?? '')?.[1] ?? '';
  const service = SERVICE_PORTS[port] ?? 'unknown';
  const send =
    (method: string) =>
    async (url: string, first?: unknown, second?: unknown) => {
      const withBody = method === 'post' || method === 'put';
      const options = (withBody ? second : first) as
        | { params?: Record<string, unknown>; data?: unknown }
        | undefined;
      const call: ArrCall = {
        service,
        method: method.toUpperCase(),
        url,
        params: options?.params,
        data: withBody ? first : options?.data,
      };
      calls.push(call);

      const handler = handlers[`${service} ${call.method} ${url}`];
      if (!handler) {
        throw Object.assign(new Error(`No handler for ${call.method} ${url}`), {
          response: { status: 404, data: { message: 'Not found' } },
        });
      }

      return { data: await handler(call) };
    };

  return {
    get: send('get'),
    post: send('post'),
    put: send('put'),
    delete: send('delete'),
    interceptors: {
      request: { use: () => 0 },
      response: { use: () => 0 },
    },
    defaults: { headers: {} },
  };
});

const callsTo = (service: string) =>
  calls
    .filter((call) => call.service === service && call.method !== 'GET')
    .map((call) => `${call.method} ${call.url}`);

const server = (port: number, extra: Record<string, unknown> = {}) => ({
  id: 0,
  name: 'Arr',
  hostname: 'localhost',
  port,
  apiKey: 'test-key',
  useSsl: false,
  baseUrl: '',
  activeProfileId: 1,
  activeProfileName: 'Any',
  activeDirectory: '/media',
  tags: [],
  is4k: false,
  isDefault: true,
  syncEnabled: true,
  preventSearch: false,
  tagRequests: false,
  ...extra,
});

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/media/:mediaId/arr', isAuthenticated(), arrActionRoutes);
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

before(() => {
  app = createApp();
});

setupTestDb();

beforeEach(() => {
  calls = [];
  handlers = {};
  const settings = getSettings();
  settings.radarr = [
    server(7878) as unknown as RadarrSettings,
    server(7879, { id: 1, is4k: true }) as unknown as RadarrSettings,
  ];
  settings.sonarr = [server(8989) as unknown as SonarrSettings];
  settings.lidarr = [server(8686) as unknown as LidarrSettings];
  settings.chaptarr = [server(8789) as unknown as ChaptarrSettings];
  settings.lazylibrarian = {
    ...settings.lazylibrarian,
    hostname: '',
    apiKey: '',
  };
});

afterEach(() => {
  const settings = getSettings();
  settings.radarr = [];
  settings.sonarr = [];
  settings.lidarr = [];
  settings.chaptarr = [];
});

async function loginAs(email: string) {
  const settings = getSettings();
  const prior = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent
      .post('/auth/local')
      .send({ email, password: 'test1234' });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = prior;
  }
}

async function setDemoPermissions(permissions: number) {
  const users = getRepository(User);
  const demo = await users.findOneOrFail({
    where: { email: 'demo@seerr.dev' },
  });
  demo.permissions = permissions;
  await users.save(demo);
}

const saveMedia = (init: Partial<Media>) =>
  getRepository(Media).save(new Media(init));

const getMedia = (id: number) =>
  getRepository(Media).findOneOrFail({ where: { id } });

function radarrMovie(withFile = true) {
  handlers['radarr GET /movie/7'] = () => ({
    id: 7,
    title: 'Fight Club',
    tmdbId: 550,
    hasFile: withFile,
    ...(withFile && { movieFile: { id: 70, movieId: 7, size: 1 } }),
  });
}

describe('arr action permissions', () => {
  it('turns away users without Manage Requests', async () => {
    const media = await saveMedia({
      mediaType: MediaType.MOVIE,
      tmdbId: 550,
      externalServiceId: 7,
      serviceId: 0,
    });
    await setDemoPermissions(Permission.REQUEST);
    const demo = await loginAs('demo@seerr.dev');

    for (const res of [
      await demo.get(`/media/${media.id}/arr`),
      await demo.get(`/media/${media.id}/arr/releases`),
      await demo.post(`/media/${media.id}/arr/search`).send({}),
      await demo
        .post(`/media/${media.id}/arr/grab`)
        .send({ guid: 'g', indexerId: 1 }),
      await demo.post(`/media/${media.id}/arr/replace`).send({}),
    ]) {
      assert.strictEqual(res.status, 403);
    }
    assert.deepStrictEqual(calls, []);
  });

  it('lets users with Manage Requests in', async () => {
    radarrMovie();
    const media = await saveMedia({
      mediaType: MediaType.MOVIE,
      tmdbId: 550,
      externalServiceId: 7,
      serviceId: 0,
    });
    await setDemoPermissions(Permission.REQUEST | Permission.MANAGE_REQUESTS);
    const demo = await loginAs('demo@seerr.dev');

    const res = await demo.get(`/media/${media.id}/arr`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.inService, true);
  });
});

describe('arr actions for Radarr', () => {
  it('lists the actions for a movie with a file', async () => {
    radarrMovie();
    const media = await saveMedia({
      mediaType: MediaType.MOVIE,
      tmdbId: 550,
      externalServiceId: 7,
      serviceId: 0,
    });
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin.get(`/media/${media.id}/arr`);

    assert.deepStrictEqual(res.body, {
      service: 'radarr',
      serviceName: 'Radarr',
      inService: true,
      title: 'Fight Club',
      hasFile: true,
      actions: {
        search: { available: true },
        interactive: { available: true },
        replace: { available: true },
      },
    });
  });

  it('says why when the movie is not in Radarr', async () => {
    // The lookup knows the movie, but Radarr has not added it
    handlers['radarr GET /movie/lookup'] = () => [{ id: 0, title: 'Fight' }];
    const media = await saveMedia({ mediaType: MediaType.MOVIE, tmdbId: 550 });
    const admin = await loginAs('admin@seerr.dev');

    const info = await admin.get(`/media/${media.id}/arr`);
    assert.strictEqual(info.status, 200);
    assert.strictEqual(info.body.inService, false);
    assert.strictEqual(
      info.body.actions.search.reason,
      'This movie is not in Radarr.'
    );

    const search = await admin.post(`/media/${media.id}/arr/search`).send({});
    assert.strictEqual(search.status, 404);
    assert.strictEqual(search.body.message, 'This movie is not in Radarr.');
  });

  it('answers 409 when no Radarr server is set up', async () => {
    getSettings().radarr = [];
    const media = await saveMedia({ mediaType: MediaType.MOVIE, tmdbId: 550 });
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin.post(`/media/${media.id}/arr/search`).send({});

    assert.strictEqual(res.status, 409);
    assert.match(res.body.message, /No Radarr server/);
  });

  it('searches again on the 4K server', async () => {
    handlers['radarr4k GET /movie/8'] = () => ({ id: 8, title: 'Fight Club' });
    handlers['radarr4k POST /command'] = () => ({});
    const media = await saveMedia({
      mediaType: MediaType.MOVIE,
      tmdbId: 550,
      externalServiceId4k: 8,
      serviceId4k: 1,
    });
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin
      .post(`/media/${media.id}/arr/search`)
      .send({ is4k: true });

    assert.strictEqual(res.status, 200);
    const command = calls.find((call) => call.url === '/command');
    assert.strictEqual(command?.service, 'radarr4k');
    assert.deepStrictEqual(command?.data, {
      name: 'MoviesSearch',
      movieIds: [8],
    });
  });

  it('lists releases with a long timeout and grabs one with its movie', async () => {
    radarrMovie();
    let releaseParams: Record<string, unknown> | undefined;
    handlers['radarr GET /release'] = (call) => {
      releaseParams = call.params;
      return [
        {
          guid: 'rejected',
          indexerId: 1,
          title: 'Fight.Club.CAM',
          qualityWeight: 1,
          approved: false,
          rejections: ['CAM is not wanted in profile'],
          protocol: 'torrent',
          seeders: 2,
        },
        {
          guid: 'good',
          indexerId: 2,
          title: 'Fight.Club.1999.1080p',
          qualityWeight: 10,
          approved: true,
          protocol: 'usenet',
        },
      ];
    };
    handlers['radarr POST /release'] = () => ({});
    const media = await saveMedia({
      mediaType: MediaType.MOVIE,
      tmdbId: 550,
      externalServiceId: 7,
      serviceId: 0,
    });
    const admin = await loginAs('admin@seerr.dev');

    const releases = await admin.get(`/media/${media.id}/arr/releases`);
    assert.strictEqual(releases.status, 200);
    assert.deepStrictEqual(releaseParams, { movieId: 7 });
    assert.deepStrictEqual(
      releases.body.results.map((r: { guid: string }) => r.guid),
      ['good', 'rejected']
    );
    assert.strictEqual(releases.body.results[1].seeders, 2);

    const grab = await admin
      .post(`/media/${media.id}/arr/grab`)
      .send({ guid: 'good', indexerId: 2, title: 'Fight.Club.1999.1080p' });
    assert.strictEqual(grab.status, 200);
    assert.deepStrictEqual(
      calls.find((call) => call.method === 'POST' && call.url === '/release')
        ?.data,
      { guid: 'good', indexerId: 2, movieId: 7 }
    );
  });

  it('passes the arr message on when a grab fails', async () => {
    radarrMovie();
    handlers['radarr POST /release'] = () => {
      throw Object.assign(new Error('Request failed with status code 404'), {
        response: {
          status: 404,
          data: {
            message:
              "Couldn't find requested release in cache, cache timeout probably expired.",
          },
        },
      });
    };
    const media = await saveMedia({
      mediaType: MediaType.MOVIE,
      tmdbId: 550,
      externalServiceId: 7,
      serviceId: 0,
    });
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin
      .post(`/media/${media.id}/arr/grab`)
      .send({ guid: 'old', indexerId: 2 });

    assert.strictEqual(res.status, 502);
    assert.match(res.body.message, /cache timeout probably expired/);
  });

  it('replaces the file: delete, blocklist, search, in that order', async () => {
    radarrMovie();
    handlers['radarr GET /history/movie'] = () => [
      {
        id: 51,
        eventType: 'grabbed',
        downloadId: 'D1',
        date: '2026-01-01T00:00:00Z',
        sourceTitle: 'Fight.Club.1999.720p-BAD',
      },
      {
        id: 52,
        eventType: 'downloadFolderImported',
        downloadId: 'D1',
        date: '2026-01-01T01:00:00Z',
      },
    ];
    handlers['radarr DELETE /moviefile/70'] = () => ({});
    handlers['radarr POST /history/failed/51'] = () => ({});
    handlers['radarr POST /command'] = () => ({});
    const owner = await getRepository(User).findOneOrFail({
      where: { id: 1 },
    });
    const media = await saveMedia({
      mediaType: MediaType.MOVIE,
      tmdbId: 550,
      status: MediaStatus.AVAILABLE,
      externalServiceId: 7,
      serviceId: 0,
    });
    const issue = await getRepository(Issue).save(
      new Issue({
        issueType: IssueType.VIDEO,
        media,
        createdBy: owner,
        problemSeason: 0,
        problemEpisode: 0,
      })
    );
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin.post(`/media/${media.id}/arr/replace`).send({
      blocklist: true,
      search: 'automatic',
      issueId: issue.id,
      resolveIssue: true,
    });

    assert.strictEqual(res.status, 200, res.body.message);
    assert.deepStrictEqual(res.body, {
      deletedFiles: 1,
      blocklisted: ['Fight.Club.1999.720p-BAD'],
      searched: true,
      issueResolved: true,
    });
    assert.deepStrictEqual(callsTo('radarr'), [
      'DELETE /moviefile/70',
      'POST /history/failed/51',
      'POST /command',
    ]);
    assert.strictEqual(
      (await getMedia(media.id)).status,
      MediaStatus.PROCESSING
    );

    const stored = await getRepository(Issue).findOneOrFail({
      where: { id: issue.id },
    });
    assert.strictEqual(stored.status, IssueStatus.RESOLVED);
    assert.match(
      stored.comments[stored.comments.length - 1].message,
      /Replaced the file, blocklisted Fight\.Club\.1999\.720p-BAD/
    );
  });

  it('replaces without blocklisting and leaves the pick to the admin', async () => {
    radarrMovie();
    handlers['radarr DELETE /moviefile/70'] = () => ({});
    const media = await saveMedia({
      mediaType: MediaType.MOVIE,
      tmdbId: 550,
      status: MediaStatus.AVAILABLE,
      externalServiceId: 7,
      serviceId: 0,
    });
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin
      .post(`/media/${media.id}/arr/replace`)
      .send({ blocklist: false, search: 'interactive' });

    assert.strictEqual(res.status, 200, res.body.message);
    assert.strictEqual(res.body.searched, false);
    assert.deepStrictEqual(callsTo('radarr'), ['DELETE /moviefile/70']);
    assert.ok(!calls.some((call) => call.url.startsWith('/history')));
  });

  it('refuses to replace a movie without a file', async () => {
    radarrMovie(false);
    const media = await saveMedia({
      mediaType: MediaType.MOVIE,
      tmdbId: 550,
      externalServiceId: 7,
      serviceId: 0,
    });
    const admin = await loginAs('admin@seerr.dev');

    const info = await admin.get(`/media/${media.id}/arr`);
    assert.strictEqual(info.body.actions.replace.available, false);

    const res = await admin.post(`/media/${media.id}/arr/replace`).send({});
    assert.strictEqual(res.status, 409);
    assert.deepStrictEqual(callsTo('radarr'), []);
  });
});

describe('arr actions for Sonarr', () => {
  const episodes = [
    { id: 320, episodeNumber: 1, episodeFileId: 900, hasFile: true },
    { id: 321, episodeNumber: 2, episodeFileId: 900, hasFile: true },
    { id: 322, episodeNumber: 3, episodeFileId: 902, hasFile: true },
    { id: 323, episodeNumber: 4, episodeFileId: 0, hasFile: false },
  ].map((episode) => ({
    ...episode,
    seriesId: 3,
    seasonNumber: 1,
    title: `Episode ${episode.episodeNumber}`,
  }));

  const seedSeries = () => {
    handlers['sonarr GET /series/3'] = () => ({ id: 3, title: 'Almost Human' });
    handlers['sonarr GET /episode'] = () => episodes;
    return saveMedia({
      mediaType: MediaType.TV,
      tmdbId: 1,
      tvdbId: 267702,
      status: MediaStatus.AVAILABLE,
      externalServiceId: 3,
      serviceId: 0,
      seasons: [
        new Season({ seasonNumber: 1, status: MediaStatus.AVAILABLE }),
        new Season({ seasonNumber: 2, status: MediaStatus.AVAILABLE }),
      ],
    });
  };

  it('lists episodes and needs a season to search manually', async () => {
    const media = await seedSeries();
    const admin = await loginAs('admin@seerr.dev');

    const info = await admin.get(`/media/${media.id}/arr`);
    assert.strictEqual(info.body.episodes.length, 4);
    assert.strictEqual(info.body.actions.interactive.available, false);
    assert.strictEqual(info.body.actions.replace.available, false);

    const releases = await admin.get(`/media/${media.id}/arr/releases`);
    assert.strictEqual(releases.status, 400);
  });

  it('runs a season, episode and series search', async () => {
    handlers['sonarr POST /command'] = () => ({});
    const media = await seedSeries();
    const admin = await loginAs('admin@seerr.dev');

    await admin.post(`/media/${media.id}/arr/search`).send({});
    await admin.post(`/media/${media.id}/arr/search`).send({ seasonNumber: 1 });
    await admin
      .post(`/media/${media.id}/arr/search`)
      .send({ seasonNumber: 1, episodeNumber: 3 });

    assert.deepStrictEqual(
      calls.filter((call) => call.url === '/command').map((call) => call.data),
      [
        { name: 'SeriesSearch', seriesId: 3 },
        { name: 'SeasonSearch', seriesId: 3, seasonNumber: 1 },
        { name: 'EpisodeSearch', episodeIds: [322] },
      ]
    );
  });

  it('searches releases of an episode and grabs one for it', async () => {
    handlers['sonarr GET /release'] = () => [
      { guid: 'ep', indexerId: 5, approved: true, title: 'S01E03' },
    ];
    handlers['sonarr POST /release'] = () => ({});
    const media = await seedSeries();
    const admin = await loginAs('admin@seerr.dev');

    await admin
      .get(`/media/${media.id}/arr/releases`)
      .query({ seasonNumber: 1, episodeNumber: 3 });
    await admin
      .post(`/media/${media.id}/arr/grab`)
      .send({ guid: 'ep', indexerId: 5, seasonNumber: 1, episodeNumber: 3 });

    assert.deepStrictEqual(
      calls.find((call) => call.method === 'GET' && call.url === '/release')
        ?.params,
      { episodeId: 322 }
    );
    assert.deepStrictEqual(
      calls.find((call) => call.method === 'POST' && call.url === '/release')
        ?.data,
      { guid: 'ep', indexerId: 5, seriesId: 3, episodeId: 322 }
    );
  });

  it('searches releases of a season and grabs a pack for the series', async () => {
    handlers['sonarr GET /release'] = () => [];
    handlers['sonarr POST /release'] = () => ({});
    const media = await seedSeries();
    const admin = await loginAs('admin@seerr.dev');

    await admin
      .get(`/media/${media.id}/arr/releases`)
      .query({ seasonNumber: 1 });
    await admin
      .post(`/media/${media.id}/arr/grab`)
      .send({ guid: 'pack', indexerId: 5, seasonNumber: 1 });

    assert.deepStrictEqual(
      calls.find((call) => call.method === 'GET' && call.url === '/release')
        ?.params,
      { seriesId: 3, seasonNumber: 1 }
    );
    assert.deepStrictEqual(
      calls.find((call) => call.method === 'POST' && call.url === '/release')
        ?.data,
      { guid: 'pack', indexerId: 5, seriesId: 3, seasonNumber: 1 }
    );
  });

  it('replaces a season: each file once, a season pack blocklisted once', async () => {
    handlers['sonarr GET /history/series'] = () => [
      ...[320, 321].flatMap((episodeId, i) => [
        {
          id: 10 + i,
          episodeId,
          eventType: 'grabbed',
          downloadId: 'PACK',
          date: '2026-01-01T00:00:00Z',
          sourceTitle: 'Almost.Human.S01.720p',
        },
        {
          id: 20 + i,
          episodeId,
          eventType: 'downloadFolderImported',
          downloadId: 'PACK',
          date: '2026-01-01T01:00:00Z',
        },
      ]),
      {
        id: 30,
        episodeId: 322,
        eventType: 'grabbed',
        downloadId: 'E3',
        date: '2026-01-02T00:00:00Z',
        sourceTitle: 'Almost.Human.S01E03',
      },
    ];
    handlers['sonarr DELETE /episodefile/bulk'] = () => ({});
    handlers['sonarr POST /history/failed/10'] = () => ({});
    handlers['sonarr POST /history/failed/11'] = () => ({});
    handlers['sonarr POST /history/failed/30'] = () => ({});
    handlers['sonarr POST /command'] = () => ({});
    const media = await seedSeries();
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin
      .post(`/media/${media.id}/arr/replace`)
      .send({ seasonNumber: 1 });

    assert.strictEqual(res.status, 200, res.body.message);
    assert.strictEqual(res.body.deletedFiles, 2);
    const failed = callsTo('sonarr').filter((c) => c.includes('failed'));
    assert.strictEqual(failed.length, 2);
    assert.ok(failed.includes('POST /history/failed/30'));
    assert.deepStrictEqual(
      calls.find((call) => call.url === '/episodefile/bulk')?.data,
      { episodeFileIds: [900, 902] }
    );
    assert.deepStrictEqual(
      calls.find((call) => call.url === '/history/series')?.params,
      { seriesId: 3, seasonNumber: 1 }
    );
    assert.deepStrictEqual(
      calls.find((call) => call.url === '/command')?.data,
      { name: 'SeasonSearch', seriesId: 3, seasonNumber: 1 }
    );

    const stored = await getMedia(media.id);
    assert.strictEqual(stored.status, MediaStatus.PARTIALLY_AVAILABLE);
    assert.strictEqual(
      stored.seasons.find((s) => s.seasonNumber === 1)?.status,
      MediaStatus.PROCESSING
    );
    assert.strictEqual(
      stored.seasons.find((s) => s.seasonNumber === 2)?.status,
      MediaStatus.AVAILABLE
    );
  });

  it('answers 404 for an episode Sonarr does not have', async () => {
    const media = await seedSeries();
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin
      .post(`/media/${media.id}/arr/search`)
      .send({ seasonNumber: 1, episodeNumber: 9 });

    assert.strictEqual(res.status, 404);
    assert.match(res.body.message, /S01E09/);
  });
});

describe('arr actions for Lidarr', () => {
  const seedAlbum = () => {
    handlers['lidarr GET /album/2'] = () => ({
      id: 2,
      artistId: 1,
      title: 'Music & Me',
      statistics: { trackFileCount: 10 },
    });
    return saveMedia({
      mediaType: MediaType.MUSIC,
      mbId: 'a5b4c3d2-0000-0000-0000-000000000000',
      status: MediaStatus.AVAILABLE,
      externalServiceId: 2,
      serviceId: 0,
    });
  };

  it('grabs a release for the album and its artist', async () => {
    handlers['lidarr GET /release'] = () => [
      { guid: 'flac', indexerId: 3, approved: true },
    ];
    handlers['lidarr POST /release'] = () => ({});
    const media = await seedAlbum();
    const admin = await loginAs('admin@seerr.dev');

    await admin.get(`/media/${media.id}/arr/releases`);
    await admin
      .post(`/media/${media.id}/arr/grab`)
      .send({ guid: 'flac', indexerId: 3 });

    assert.deepStrictEqual(
      calls.find((call) => call.method === 'GET' && call.url === '/release')
        ?.params,
      { albumId: 2 }
    );
    assert.deepStrictEqual(
      calls.find((call) => call.method === 'POST' && call.url === '/release')
        ?.data,
      { guid: 'flac', indexerId: 3, albumId: 2, artistId: 1 }
    );
  });

  it('replaces the album: track files, blocklist, album search', async () => {
    handlers['lidarr GET /trackfile'] = () => [{ id: 41 }, { id: 42 }];
    handlers['lidarr GET /history/artist'] = () => [
      {
        id: 29465,
        eventType: 'grabbed',
        downloadId: 'FC',
        date: '2022-03-25T20:01:46Z',
        sourceTitle: 'Michael Jackson - Music and Me',
      },
      {
        id: 29482,
        eventType: 'downloadImported',
        downloadId: 'FC',
        date: '2022-03-25T20:30:00Z',
      },
    ];
    handlers['lidarr DELETE /trackfile/bulk'] = () => ({});
    handlers['lidarr POST /history/failed/29465'] = () => ({});
    handlers['lidarr POST /command'] = () => ({});
    const media = await seedAlbum();
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin.post(`/media/${media.id}/arr/replace`).send({});

    assert.strictEqual(res.status, 200, res.body.message);
    assert.deepStrictEqual(callsTo('lidarr'), [
      'DELETE /trackfile/bulk',
      'POST /history/failed/29465',
      'POST /command',
    ]);
    assert.deepStrictEqual(
      calls.find((call) => call.url === '/history/artist')?.params,
      { artistId: 1, albumId: 2 }
    );
    assert.deepStrictEqual(
      calls.find((call) => call.url === '/trackfile/bulk')?.data,
      { trackFileIds: [41, 42] }
    );
    assert.deepStrictEqual(
      calls.find((call) => call.url === '/command')?.data,
      { name: 'AlbumSearch', albumIds: [2] }
    );
    assert.strictEqual(
      (await getMedia(media.id)).status,
      MediaStatus.PROCESSING
    );
  });
});

describe('arr actions for Chaptarr', () => {
  const seedBook = () => {
    handlers['chaptarr GET /book/31'] = () => ({
      id: 31,
      title: 'Steve Jobs',
      mediaType: 'ebook',
      authorId: 3,
      statistics: { bookFileCount: 1 },
    });
    handlers['chaptarr GET /book/32'] = () => ({
      id: 32,
      title: 'Steve Jobs',
      mediaType: 'audiobook',
      authorId: 3,
      statistics: { bookFileCount: 1 },
    });
    return saveMedia({
      mediaType: MediaType.BOOK,
      olId: 'OL1W',
      status: MediaStatus.AVAILABLE,
      statusAudio: MediaStatus.AVAILABLE,
      serviceId: 0,
      externalServiceId: 31,
      externalServiceIdAudio: 32,
    });
  };

  it('needs a format', async () => {
    const media = await seedBook();
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin.post(`/media/${media.id}/arr/search`).send({});

    assert.strictEqual(res.status, 400);
  });

  it('searches and lists releases of the chosen format, hidden ones last', async () => {
    handlers['chaptarr POST /command'] = () => ({});
    handlers['chaptarr GET /release'] = () => ({
      releases: [{ guid: 'm4b', indexerId: 1, approved: true }],
      hiddenReleases: [{ guid: 'mp3', indexerId: 1, approved: true }],
      filterSummary: { summaryText: 'Showing 1 of 2 results' },
    });
    const media = await seedBook();
    const admin = await loginAs('admin@seerr.dev');

    await admin
      .post(`/media/${media.id}/arr/search`)
      .send({ bookFormat: 'audiobook' });
    const releases = await admin
      .get(`/media/${media.id}/arr/releases`)
      .query({ bookFormat: 'audiobook' });

    assert.deepStrictEqual(
      calls.find((call) => call.url === '/command')?.data,
      { name: 'BookSearch', bookIds: [32] }
    );
    assert.deepStrictEqual(
      calls.find((call) => call.url === '/release')?.params,
      { bookId: 32 }
    );
    assert.deepStrictEqual(
      releases.body.results.map(
        (r: { guid: string; approved: boolean }) => `${r.guid}:${r.approved}`
      ),
      ['m4b:true', 'mp3:false']
    );
  });

  it('names Talearr and shows its rejection labels only when it is the book service', async () => {
    handlers['chaptarr GET /release'] = () => ({
      releases: [
        {
          guid: 'de',
          indexerId: 1,
          approved: false,
          rejections: ['Wanted language is English, found German'],
          rejectionDetails: [
            {
              reason: 'Wanted language is English, found German',
              label: 'Language',
              source: 'LanguageSpecification',
            },
          ],
        },
      ],
      hiddenReleases: [],
    });
    const media = await seedBook();
    const admin = await loginAs('admin@seerr.dev');
    const settings = getSettings();
    const prior = settings.main.bookService;

    try {
      settings.main.bookService = 'talearr';
      const info = await admin
        .get(`/media/${media.id}/arr`)
        .query({ bookFormat: 'ebook' });
      const talearr = await admin
        .get(`/media/${media.id}/arr/releases`)
        .query({ bookFormat: 'ebook' });

      assert.strictEqual(info.body.serviceName, 'Talearr');
      assert.deepStrictEqual(talearr.body.results[0].rejectionLabels, [
        'Language',
      ]);

      settings.main.bookService = 'chaptarr';
      const chaptarr = await admin
        .get(`/media/${media.id}/arr/releases`)
        .query({ bookFormat: 'ebook' });

      assert.strictEqual(chaptarr.body.results[0].rejectionLabels, undefined);
      assert.deepStrictEqual(chaptarr.body.results[0].rejections, [
        'Wanted language is English, found German',
      ]);
    } finally {
      settings.main.bookService = prior;
    }
  });

  it('grabs a release for the book and its author', async () => {
    handlers['chaptarr POST /release'] = () => ({});
    const media = await seedBook();
    const admin = await loginAs('admin@seerr.dev');

    await admin
      .post(`/media/${media.id}/arr/grab`)
      .send({ guid: 'epub', indexerId: 1, bookFormat: 'ebook' });

    assert.deepStrictEqual(
      calls.find((call) => call.method === 'POST' && call.url === '/release')
        ?.data,
      { guid: 'epub', indexerId: 1, bookId: 31, authorId: 3 }
    );
  });

  it('replaces only the chosen format', async () => {
    handlers['chaptarr GET /bookfile'] = (call) =>
      call.params?.bookId === 32 ? [{ id: 320, bookId: 32 }] : [];
    handlers['chaptarr GET /history/author'] = () => [
      {
        id: 11,
        bookId: 32,
        eventType: 'grabbed',
        downloadId: 'F5',
        date: '2026-10-09T22:36:04Z',
        sourceTitle: 'Steve.Jobs.Audiobook',
      },
      {
        id: 12,
        bookId: 32,
        eventType: 'bookFileImported',
        downloadId: 'F5',
        date: '2026-10-09T22:40:00Z',
      },
    ];
    handlers['chaptarr DELETE /bookfile/bulk'] = () => ({});
    handlers['chaptarr POST /history/failed/11'] = () => ({});
    handlers['chaptarr POST /command'] = () => ({});
    const media = await seedBook();
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin
      .post(`/media/${media.id}/arr/replace`)
      .send({ bookFormat: 'audiobook' });

    assert.strictEqual(res.status, 200, res.body.message);
    assert.deepStrictEqual(callsTo('chaptarr'), [
      'DELETE /bookfile/bulk',
      'POST /history/failed/11',
      'POST /command',
    ]);
    assert.deepStrictEqual(
      calls.find((call) => call.url === '/bookfile/bulk')?.data,
      { bookFileIds: [320] }
    );
    assert.deepStrictEqual(
      calls.find((call) => call.url === '/history/author')?.params,
      { authorId: 3, bookId: 32 }
    );

    const stored = await getMedia(media.id);
    assert.strictEqual(stored.statusAudio, MediaStatus.PROCESSING);
    assert.strictEqual(stored.status, MediaStatus.AVAILABLE);
  });
});

describe('arr actions for LazyLibrarian', () => {
  beforeEach(() => {
    getSettings().chaptarr = [];
    getSettings().lazylibrarian = {
      ...getSettings().lazylibrarian,
      hostname: 'localhost',
      port: 5299,
      apiKey: 'a'.repeat(32),
    };
    handlers['lazylibrarian GET /api'] = (call) => {
      switch (call.params?.cmd) {
        case 'getAllBooks':
          return [
            {
              BookID: 'OL1W',
              BookName: 'Steve Jobs',
              Status: 'Open',
              AudioStatus: 'Skipped',
            },
          ];
        default:
          return 'OK';
      }
    };
  });

  afterEach(() => {
    getSettings().lazylibrarian = {
      ...getSettings().lazylibrarian,
      hostname: '',
      apiKey: '',
    };
  });

  const seedBook = () =>
    saveMedia({
      mediaType: MediaType.BOOK,
      olId: 'OL1W',
      status: MediaStatus.AVAILABLE,
    });

  it('only offers a search, and says why the rest is unavailable', async () => {
    const media = await seedBook();
    const admin = await loginAs('admin@seerr.dev');

    const info = await admin
      .get(`/media/${media.id}/arr`)
      .query({ bookFormat: 'ebook' });

    assert.strictEqual(info.body.service, 'lazylibrarian');
    assert.strictEqual(info.body.hasFile, true);
    assert.deepStrictEqual(info.body.actions.search, { available: true });
    assert.match(info.body.actions.interactive.reason, /cannot list releases/);
    assert.match(info.body.actions.replace.reason, /cannot delete files/);
  });

  it('starts a search for the chosen format', async () => {
    const media = await seedBook();
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin
      .post(`/media/${media.id}/arr/search`)
      .send({ bookFormat: 'audiobook' });

    assert.strictEqual(res.status, 200, res.body.message);
    const search = calls.find((call) => call.params?.cmd === 'searchBook');
    assert.strictEqual(search?.params?.id, 'OL1W');
    assert.strictEqual(search?.params?.type, 'AudioBook');
  });

  it('refuses releases, grabs and replacing', async () => {
    const media = await seedBook();
    const admin = await loginAs('admin@seerr.dev');

    const releases = await admin
      .get(`/media/${media.id}/arr/releases`)
      .query({ bookFormat: 'ebook' });
    const grab = await admin
      .post(`/media/${media.id}/arr/grab`)
      .send({ guid: 'g', indexerId: 1, bookFormat: 'ebook' });
    const replace = await admin
      .post(`/media/${media.id}/arr/replace`)
      .send({ bookFormat: 'ebook' });

    assert.strictEqual(releases.status, 400);
    assert.strictEqual(grab.status, 400);
    assert.strictEqual(replace.status, 400);
    assert.ok(!calls.some((call) => call.params?.cmd === 'searchBook'));
  });
});
