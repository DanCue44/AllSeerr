import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it, mock } from 'node:test';

import GoogleBooks from '@server/api/googlebooks';
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

let testedKeys: string[] = [];
let testImpl: () => Promise<void>;

// The key test is the only call that leaves the server
mock.method(GoogleBooks, 'testApiKey', async (apiKey: string) => {
  testedKeys.push(apiKey);
  return testImpl();
});

const main = getSettings().main;
const originalKey = main.googleBooksApiKey;
let app: Express;

async function login(email: string) {
  const priorLocalLogin = main.localLogin;
  main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent
      .post('/auth/local')
      .send({ email, password: 'test1234' });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    main.localLogin = priorLocalLogin;
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
  main.googleBooksApiKey = originalKey;
});

setupTestDb();

beforeEach(() => {
  testedKeys = [];
  testImpl = async () => undefined;
  main.googleBooksApiKey = 'saved-key';
});

describe('Google Books API key', () => {
  it('is returned to admins only', async () => {
    const admin = await login('admin@seerr.dev');
    const adminRes = await admin.get('/settings/main');

    assert.strictEqual(adminRes.body.googleBooksApiKey, 'saved-key');

    const user = await login('demo@seerr.dev');
    const userRes = await user.get('/settings/main');

    assert.strictEqual(userRes.status, 200);
    assert.strictEqual('googleBooksApiKey' in userRes.body, false);
    assert.strictEqual('apiKey' in userRes.body, false);
  });

  it('is not part of the public settings', () => {
    const publicSettings = getSettings().fullPublicSettings;

    assert.strictEqual('googleBooksApiKey' in publicSettings, false);
    assert.strictEqual(
      JSON.stringify(publicSettings).includes('saved-key'),
      false
    );
  });

  it('tests the given key, or the saved one', async () => {
    const agent = await login('admin@seerr.dev');

    const given = await agent
      .post('/settings/googlebooks/test')
      .send({ apiKey: ' new-key ' });
    const saved = await agent.post('/settings/googlebooks/test').send({});

    assert.strictEqual(given.status, 200);
    assert.strictEqual(saved.status, 200);
    assert.deepStrictEqual(testedKeys, ['new-key', 'saved-key']);
  });

  it('reports a key Google rejects', async () => {
    testImpl = async () => {
      throw new Error('API key not valid. Please pass a valid API key.');
    };

    const agent = await login('admin@seerr.dev');
    const res = await agent
      .post('/settings/googlebooks/test')
      .send({ apiKey: 'bad-key' });

    assert.strictEqual(res.status, 500);
  });

  it('refuses to test without any key', async () => {
    main.googleBooksApiKey = '';

    const agent = await login('admin@seerr.dev');
    const res = await agent.post('/settings/googlebooks/test').send({});

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(testedKeys, []);
  });
});
