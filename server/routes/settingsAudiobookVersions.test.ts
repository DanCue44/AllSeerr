import assert from 'node:assert/strict';
import { after, before, describe, it, mock } from 'node:test';

import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import settingsRoutes from './settings';

// Settings routes save to the settings file, which tests leave alone
mock.method(getSettings(), 'save', async () => undefined);

const settings = getSettings();
const prior = {
  audiobookVersions: settings.main.audiobookVersions,
  bookService: settings.main.bookService,
  chaptarr: settings.chaptarr,
};
let app: Express;

async function login(email: string) {
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent
      .post('/auth/local')
      .send({ email, password: 'test1234' });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

before(() => {
  app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/settings', settingsRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  );
});

after(() => {
  settings.main.audiobookVersions = prior.audiobookVersions;
  settings.main.bookService = prior.bookService;
  settings.chaptarr = prior.chaptarr;
});

setupTestDb();

const useTalearr = () => {
  settings.chaptarr = [
    {
      id: 0,
      name: 'Talearr',
      hostname: 'talearr',
      port: 8789,
      apiKey: 'key',
      useSsl: false,
      activeProfileId: 1,
      activeProfileName: 'E-Book',
      activeDirectory: '/ebooks',
      activeMetadataProfileId: 2,
      activeMetadataProfileName: 'Ebook',
      tags: [],
      is4k: false,
      isDefault: true,
      syncEnabled: true,
      preventSearch: false,
      tagRequests: false,
      overrideRule: [],
    },
  ];
  settings.main.bookService = 'talearr';
};

describe('Audiobook Versions setting', () => {
  it('is saved and refused when unknown', async () => {
    const admin = await login('admin@seerr.dev');

    const saved = await admin
      .post('/settings/main')
      .send({ audiobookVersions: 'requester' });
    assert.strictEqual(saved.status, 200, saved.body.message);
    assert.strictEqual(settings.main.audiobookVersions, 'requester');

    const refused = await admin
      .post('/settings/main')
      .send({ audiobookVersions: 'sometimes' });
    assert.strictEqual(refused.status, 400);
    assert.strictEqual(settings.main.audiobookVersions, 'requester');
  });

  it('is public with Talearr only, both when not set', () => {
    useTalearr();
    settings.main.audiobookVersions = undefined;
    assert.strictEqual(settings.fullPublicSettings.audiobookVersions, 'both');

    settings.main.audiobookVersions = 'abridged';
    assert.strictEqual(
      settings.fullPublicSettings.audiobookVersions,
      'abridged'
    );

    settings.main.bookService = 'chaptarr';
    assert.strictEqual(
      settings.fullPublicSettings.audiobookVersions,
      undefined
    );
  });
});
