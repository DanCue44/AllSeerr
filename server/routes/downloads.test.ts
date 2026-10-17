import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { clearDownloadsCache } from '@server/lib/downloads';
import { Permission } from '@server/lib/permissions';
import type { RadarrSettings, SonarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { generateUserApiKey, hashUserApiKey } from '@server/lib/userApiKey';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import downloadRoutes from '@server/routes/downloads';
import { setupTestDb } from '@server/test/db';
import axios from 'axios';
import type { Express } from 'express';
import express from 'express';
import request from 'supertest';

/**
 * Each arr is replaced by a fake axios instance that answers from the
 * handlers below, keyed on the arr's host, and records each call. Nothing
 * reaches the network.
 */
interface ArrCall {
  host: string;
  method: string;
  url: string;
  params?: Record<string, unknown>;
  data?: unknown;
}

let calls: ArrCall[] = [];
let handlers: Record<string, (call: ArrCall) => unknown> = {};

mock.method(axios, 'create', (config?: { baseURL?: string }) => {
  const host = new URL(config?.baseURL ?? 'http://unknown').hostname;
  const send =
    (method: string) =>
    async (url: string, first?: unknown, second?: unknown) => {
      const withBody = method === 'post' || method === 'put';
      const options = (withBody ? second : first) as
        | { params?: Record<string, unknown>; data?: unknown }
        | undefined;
      const call: ArrCall = {
        host,
        method: method.toUpperCase(),
        url,
        params: options?.params,
        data: withBody ? first : options?.data,
      };
      calls.push(call);

      const handler = handlers[`${host} ${call.method} ${url}`];
      if (!handler) {
        throw Object.assign(new Error(`connect ECONNREFUSED ${host}`), {
          response: undefined,
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

const dvr = {
  port: 7878,
  apiKey: 'test-key',
  useSsl: false,
  activeProfileId: 1,
  activeProfileName: 'Any',
  activeDirectory: '/media',
  tags: [],
  is4k: false,
  isDefault: true,
  syncEnabled: true,
  preventSearch: false,
  tagRequests: false,
  overrideRule: [],
};

const radarr = {
  ...dvr,
  id: 0,
  name: 'Radarr',
  hostname: 'radarr',
  minimumAvailability: 'released',
} as RadarrSettings;

// Never answers
const sonarr = {
  ...dvr,
  id: 0,
  name: 'Sonarr',
  hostname: 'sonarr',
  seriesType: 'standard',
  animeSeriesType: 'anime',
  enableSeasonFolders: true,
  monitorNewItems: 'all',
} as SonarrSettings;

const queue = [
  {
    id: 11,
    movieId: 12,
    title: 'Sample.Movie.2024.1080p.WEB-DL',
    size: 4000,
    sizeleft: 1000,
    timeleft: '00:10:00',
    status: 'downloading',
    trackedDownloadStatus: 'ok',
    trackedDownloadState: 'downloading',
    protocol: 'usenet',
    downloadClient: 'NZBGet',
    indexer: 'Example Indexer',
    movie: { title: 'Sample Movie', year: 2024, tmdbId: 550 },
  },
  {
    id: 12,
    movieId: 13,
    title: 'Broken.Movie.2023.2160p',
    size: 8000,
    sizeleft: 8000,
    status: 'failed',
    trackedDownloadStatus: 'error',
    trackedDownloadState: 'failed',
    errorMessage: 'Download failed: par repair failed',
    protocol: 'usenet',
    downloadClient: 'NZBGet',
    movie: { title: 'Broken Movie', year: 2023, tmdbId: 551 },
  },
];

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(checkUser);
  app.use(
    '/downloads',
    isAuthenticated(Permission.MANAGE_REQUESTS),
    downloadRoutes
  );
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
  handlers = {
    'radarr GET /queue': () => ({ records: queue }),
    'radarr DELETE /queue/12': () => ({}),
    'radarr POST /command': () => ({}),
  };
  clearDownloadsCache();
  getSettings().radarr = [radarr];
  getSettings().sonarr = [sonarr];
});

afterEach(() => {
  getSettings().radarr = [];
  getSettings().sonarr = [];
});

async function createUser(email: string, permissions: number) {
  const apiKey = generateUserApiKey();
  await getRepository(User).save(
    new User({
      email,
      username: email.split('@')[0],
      avatar: '',
      permissions,
      apiKeyHash: hashUserApiKey(apiKey),
    })
  );

  return apiKey;
}

const manager = () => createUser('admin@example.com', Permission.ADMIN);

describe('GET /downloads', () => {
  it('is only for admins', async () => {
    const apiKey = await createUser('viewer@example.com', Permission.REQUEST);
    const requestManager = await createUser(
      'manager@example.com',
      Permission.REQUEST | Permission.MANAGE_REQUESTS
    );

    for (const key of [apiKey, requestManager]) {
      for (const path of ['/downloads', '/downloads/count']) {
        const res = await request(app).get(path).set('X-Api-Key', key);
        assert.strictEqual(res.status, 403, path);
      }
    }

    const res = await request(app)
      .post('/downloads/radarr:0:12/remove')
      .set('X-Api-Key', apiKey)
      .send({});
    assert.strictEqual(res.status, 403);
    assert.deepStrictEqual(calls, []);
  });

  it('lists every download and the servers that did not answer', async () => {
    const apiKey = await manager();

    const res = await request(app).get('/downloads').set('X-Api-Key', apiKey);

    assert.strictEqual(res.status, 200, res.body.message);
    assert.deepStrictEqual(
      res.body.results.map((item: { id: string; status: string }) => [
        item.id,
        item.status,
      ]),
      [
        ['radarr:0:12', 'failed'],
        ['radarr:0:11', 'downloading'],
      ]
    );
    assert.strictEqual(res.body.results[1].progress, 0.75);
    assert.strictEqual(
      res.body.results[0].errorMessage,
      'Download failed: par repair failed'
    );
    assert.deepStrictEqual(res.body.totals, {
      total: 2,
      downloading: 1,
      queued: 0,
      attention: 1,
    });
    assert.deepStrictEqual(
      res.body.serverErrors.map((e: { serverName: string }) => e.serverName),
      ['Sonarr']
    );

    const queueCall = calls.find((call) => call.host === 'radarr');
    assert.strictEqual(queueCall?.params?.includeMovie, true);
  });

  it('answers the count from the same read of the queues', async () => {
    const apiKey = await manager();

    await request(app).get('/downloads').set('X-Api-Key', apiKey);
    const before = calls.length;
    const res = await request(app)
      .get('/downloads/count')
      .set('X-Api-Key', apiKey);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
      total: 2,
      attention: 1,
      seedingAtRisk: 0,
    });
    assert.strictEqual(calls.length, before);
  });
});

describe('POST /downloads/:downloadId/remove', () => {
  it('removes the download, blocklists it and searches again', async () => {
    const apiKey = await manager();

    const res = await request(app)
      .post('/downloads/radarr:0:12/remove')
      .set('X-Api-Key', apiKey)
      .send({ blocklist: true, search: true });

    assert.strictEqual(res.status, 200, res.body.message);
    assert.deepStrictEqual(res.body, {
      removed: true,
      blocklisted: true,
      searched: true,
    });

    const remove = calls.find((call) => call.method === 'DELETE');
    assert.deepStrictEqual(remove?.params, {
      removeFromClient: true,
      blocklist: true,
      skipRedownload: true,
    });
    const search = calls.find((call) => call.url === '/command');
    assert.deepStrictEqual(search?.data, {
      name: 'MoviesSearch',
      movieIds: [13],
    });
  });

  it('keeps the download in the client and the release allowed by default', async () => {
    const apiKey = await manager();

    const res = await request(app)
      .post('/downloads/radarr:0:12/remove')
      .set('X-Api-Key', apiKey)
      .send({ removeFromClient: false });

    assert.strictEqual(res.status, 200, res.body.message);
    assert.strictEqual(res.body.searched, false);
    const remove = calls.find((call) => call.method === 'DELETE');
    assert.deepStrictEqual(remove?.params, {
      removeFromClient: false,
      blocklist: false,
      skipRedownload: true,
    });
    assert.strictEqual(
      calls.some((call) => call.url === '/command'),
      false
    );
  });

  it('refuses ids that are not downloads and downloads that are gone', async () => {
    const apiKey = await manager();

    const invalid = await request(app)
      .post('/downloads/radarr:zero:12/remove')
      .set('X-Api-Key', apiKey)
      .send({});
    assert.strictEqual(invalid.status, 400);

    const gone = await request(app)
      .post('/downloads/radarr:0:99/remove')
      .set('X-Api-Key', apiKey)
      .send({});
    assert.strictEqual(gone.status, 404);

    const noServer = await request(app)
      .post('/downloads/lidarr:0:1/remove')
      .set('X-Api-Key', apiKey)
      .send({});
    assert.strictEqual(noServer.status, 404);
    assert.strictEqual(
      calls.some((call) => call.method === 'DELETE'),
      false
    );
  });
});

describe('POST /downloads/:downloadId/search', () => {
  it('searches again for the movie of the download', async () => {
    const apiKey = await manager();

    const res = await request(app)
      .post('/downloads/radarr:0:11/search')
      .set('X-Api-Key', apiKey);

    assert.strictEqual(res.status, 200, res.body.message);
    const search = calls.find((call) => call.url === '/command');
    assert.deepStrictEqual(search?.data, {
      name: 'MoviesSearch',
      movieIds: [12],
    });
  });
});
