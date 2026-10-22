import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { clearDownloadsCache } from '@server/lib/downloads';
import { Permission } from '@server/lib/permissions';
import type { ChaptarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { clearSeedingCache, getSeeding } from '@server/lib/talearrSeeding';
import { generateUserApiKey, hashUserApiKey } from '@server/lib/userApiKey';
import { checkUser } from '@server/middleware/auth';
import downloadRoutes from '@server/routes/downloads';
import { setupTestDb } from '@server/test/db';
import axios from 'axios';
import type { Express } from 'express';
import express from 'express';
import request from 'supertest';

/**
 * Talearr is replaced by a fake axios instance that answers from the
 * handlers below with a status, as the seeding route reads it. Nothing
 * reaches the network.
 */
interface Call {
  host: string;
  url: string;
}

let calls: Call[] = [];
let handlers: Record<string, () => { status: number; data?: unknown }> = {};

mock.method(axios, 'create', (config?: { baseURL?: string }) => {
  const host = new URL(config?.baseURL ?? 'http://unknown').hostname;

  return {
    get: async (
      url: string,
      options?: { validateStatus?: (status: number) => boolean }
    ) => {
      calls.push({ host, url });
      const handler = handlers[`${host} GET ${url}`];

      if (!handler) {
        throw Object.assign(new Error(`connect ECONNREFUSED ${host}`), {
          response: undefined,
        });
      }

      const response = handler();
      const valid = options?.validateStatus
        ? options.validateStatus(response.status)
        : response.status < 300;

      if (!valid) {
        throw Object.assign(
          new Error(`Request failed with status code ${response.status}`),
          { response }
        );
      }

      return response;
    },
    interceptors: {
      request: { use: () => 0 },
      response: { use: () => 0 },
    },
    defaults: { headers: {} },
  };
});

const talearr = {
  id: 0,
  name: 'Talearr',
  hostname: 'talearr',
  port: 8790,
  apiKey: 'test-key',
  useSsl: false,
  isDefault: true,
} as unknown as ChaptarrSettings;

const torrent = (overrides: Record<string, unknown> = {}) => ({
  downloadId: 'abc123',
  title: 'Ali Hazelwood - Deep End.m4b',
  bookId: 3757,
  bookTitle: 'Deep End',
  authorName: 'Ali Hazelwood',
  mediaType: 'audiobook',
  indexer: 'Example Tracker',
  isPrivateTracker: true,
  downloadClient: 'qBittorrent (VPN)',
  state: 'seeding',
  size: 803000000,
  uploaded: 120000000,
  ratio: 0.15,
  seedingSeconds: 3600,
  requiredSeedingSeconds: 259200,
  seedGoalSeconds: 2592000,
  requirementMet: false,
  atRisk: false,
  riskReason: null,
  addedAt: '2026-10-17T19:50:00Z',
  completedAt: '2026-10-17T19:51:00Z',
  ...overrides,
});

const payload = {
  generatedAt: '2026-10-17T20:00:00Z',
  torrents: [
    torrent(),
    torrent({
      downloadId: 'def456',
      title: 'Unknown.Release.epub',
      bookId: null,
      bookTitle: null,
      authorName: null,
      mediaType: null,
      state: 'paused',
      atRisk: true,
      riskReason: 'Paused before 72 h of seeding',
    }),
  ],
  summary: { total: 2, seeding: 1, atRisk: 1, privateUnsatisfied: 2 },
  mam: {
    userClass: 'User',
    isVip: false,
    unsatisfied: 10,
    unsatisfiedLimit: 20,
    wedges: 5,
    bonusPoints: 7300,
    checkedAt: '2026-10-17T19:55:00Z',
  },
};

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(checkUser);
  app.use('/downloads', downloadRoutes);
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
    'talearr GET /talearr/seeding': () => ({ status: 200, data: payload }),
    'talearr GET /queue': () => ({ status: 200, data: { records: [] } }),
  };
  clearSeedingCache();
  clearDownloadsCache();
  const settings = getSettings();
  settings.main.bookService = 'talearr';
  settings.chaptarr = [talearr];
  settings.radarr = [];
  settings.sonarr = [];
  settings.lidarr = [];
});

afterEach(() => {
  const settings = getSettings();
  settings.main.bookService = undefined;
  settings.chaptarr = [];
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

const admin = () => createUser('admin@example.com', Permission.ADMIN);

describe('GET /downloads/seeding', () => {
  it('is only for admins', async () => {
    const manager = await createUser(
      'manager@example.com',
      Permission.REQUEST | Permission.MANAGE_REQUESTS
    );

    const res = await request(app)
      .get('/downloads/seeding')
      .set('X-Api-Key', manager);

    assert.strictEqual(res.status, 403);
    assert.deepStrictEqual(calls, []);
  });

  it("passes Talearr's seeding answer through with the books in Allseerr", async () => {
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.BOOK,
        olId: 'OL900001W',
        status: MediaStatus.UNKNOWN,
        statusAudio: MediaStatus.AVAILABLE,
        serviceId: 0,
        externalServiceIdAudio: 3757,
      })
    );
    const apiKey = await admin();

    const res = await request(app)
      .get('/downloads/seeding')
      .set('X-Api-Key', apiKey);

    assert.strictEqual(res.status, 200, res.body.message);
    assert.strictEqual(res.body.supported, true);
    assert.strictEqual(res.body.generatedAt, payload.generatedAt);
    assert.deepStrictEqual(res.body.summary, payload.summary);
    assert.deepStrictEqual(res.body.trackerAccount, payload.mam);
    assert.deepStrictEqual(res.body.torrents[0], {
      ...payload.torrents[0],
      mediaId: media.id,
      olId: 'OL900001W',
    });
    assert.deepStrictEqual(res.body.torrents[1], payload.torrents[1]);
  });

  it("adds each book's cover from Talearr", async () => {
    handlers['talearr GET /book?bookIds=3757'] = () => ({
      status: 200,
      data: [
        {
          id: 3757,
          images: [
            {
              coverType: 'cover',
              remoteUrl: 'https://covers.example/3757.jpg',
            },
          ],
        },
      ],
    });
    const apiKey = await admin();

    const res = await request(app)
      .get('/downloads/seeding')
      .set('X-Api-Key', apiKey);

    assert.strictEqual(res.status, 200, res.body.message);
    assert.strictEqual(
      res.body.torrents[0].posterUrl,
      'https://covers.example/3757.jpg'
    );
    assert.strictEqual(res.body.torrents[1].posterUrl, undefined);
  });

  it('shows the torrents without covers when Talearr cannot list the books', async () => {
    const apiKey = await admin();

    const res = await request(app)
      .get('/downloads/seeding')
      .set('X-Api-Key', apiKey);

    assert.strictEqual(res.status, 200, res.body.message);
    assert.strictEqual(res.body.torrents.length, 2);
    assert.strictEqual(res.body.torrents[0].posterUrl, undefined);
  });

  it('answers from a 30 second cache', async () => {
    const apiKey = await admin();

    await request(app).get('/downloads/seeding').set('X-Api-Key', apiKey);
    await request(app).get('/downloads/seeding').set('X-Api-Key', apiKey);

    assert.strictEqual(
      calls.filter((call) => call.url === '/talearr/seeding').length,
      1
    );

    await getSeeding({ now: Date.now() + 31_000 });
    assert.strictEqual(
      calls.filter((call) => call.url === '/talearr/seeding').length,
      2
    );
  });

  it('is unsupported with stock Chaptarr or LazyLibrarian', async () => {
    const apiKey = await admin();

    for (const service of ['chaptarr', 'lazylibrarian'] as const) {
      clearSeedingCache();
      getSettings().main.bookService = service;

      const res = await request(app)
        .get('/downloads/seeding')
        .set('X-Api-Key', apiKey);

      assert.strictEqual(res.status, 200, res.body.message);
      assert.deepStrictEqual(res.body, { supported: false }, service);
    }

    assert.deepStrictEqual(calls, []);
  });

  it('is unsupported when Talearr has no seeding route', async () => {
    handlers['talearr GET /talearr/seeding'] = () => ({ status: 404 });
    const apiKey = await admin();

    const res = await request(app)
      .get('/downloads/seeding')
      .set('X-Api-Key', apiKey);

    assert.strictEqual(res.status, 200, res.body.message);
    assert.deepStrictEqual(res.body, { supported: false });
  });

  it('answers 502 when Talearr fails or sends something else', async () => {
    const apiKey = await admin();

    for (const answer of [
      () => {
        throw new Error('connect ECONNREFUSED talearr');
      },
      () => ({ status: 500, data: { message: 'boom' } }),
      () => ({ status: 200, data: '<html>' }),
    ]) {
      clearSeedingCache();
      handlers['talearr GET /talearr/seeding'] = answer;

      const res = await request(app)
        .get('/downloads/seeding')
        .set('X-Api-Key', apiKey);

      assert.strictEqual(res.status, 502);
      assert.ok(res.body.message);
    }
  });
});

describe('GET /downloads/count', () => {
  it('counts the seeding torrents at risk', async () => {
    const apiKey = await admin();

    const res = await request(app)
      .get('/downloads/count')
      .set('X-Api-Key', apiKey);

    assert.strictEqual(res.status, 200, res.body.message);
    assert.deepStrictEqual(res.body, {
      total: 0,
      attention: 0,
      seedingAtRisk: 1,
    });
  });

  it('counts none when Talearr does not answer', async () => {
    delete handlers['talearr GET /talearr/seeding'];
    const apiKey = await admin();

    const res = await request(app)
      .get('/downloads/count')
      .set('X-Api-Key', apiKey);

    assert.strictEqual(res.status, 200, res.body.message);
    assert.strictEqual(res.body.seedingAtRisk, 0);
  });
});
