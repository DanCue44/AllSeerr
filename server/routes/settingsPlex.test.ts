import assert from 'node:assert/strict';
import dns from 'node:dns';
import { before, beforeEach, describe, it, mock } from 'node:test';

import PlexAPI from '@server/api/plexapi';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import request from 'supertest';
import settingsRoutes from './settings';

// Settings routes save to the settings file, which tests leave alone
const save = mock.method(getSettings(), 'save', async () => undefined);

// The host sits behind Cloudflare, which drops port 32400
mock.method(dns.promises, 'lookup', async () => [
  { address: '104.21.32.1', family: 4 },
]);

let working: string[] = [];
const tried: string[] = [];

mock.method(PlexAPI.prototype, 'getStatus', async function (this: PlexAPI) {
  const baseURL = (
    this as unknown as { axios: { defaults: { baseURL: string } } }
  ).axios.defaults.baseURL;
  tried.push(baseURL);

  if (working.includes(baseURL)) {
    return {
      MediaContainer: { machineIdentifier: 'abc123', friendlyName: 'Home' },
    };
  }

  throw Object.assign(new Error(''), {
    code: 'ETIMEDOUT',
    config: { baseURL, url: '/' },
  });
});

let app: Express;

before(() => {
  app = express();
  app.use(express.json());
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

setupTestDb();

beforeEach(() => {
  working = [];
  tried.length = 0;
  save.mock.resetCalls();
  Object.assign(getSettings().plex, {
    ip: '192.168.1.5',
    port: 32400,
    useSsl: false,
  });
});

describe('POST /settings/plex', () => {
  it('splits a pasted URL into host, port and SSL', async () => {
    working = ['https://plex.example.com:443'];

    const res = await request(app)
      .post('/settings/plex')
      .send({ ip: 'https://plex.example.com', port: 32400, useSsl: false });

    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.ip, 'plex.example.com');
    assert.equal(res.body.port, 443);
    assert.equal(res.body.useSsl, true);
    assert.equal(res.body.machineId, 'abc123');
    assert.equal(save.mock.callCount(), 1);
  });

  it('suggests https on 443 and saves nothing when 32400 fails', async () => {
    working = ['https://plex.example.com:443'];

    const res = await request(app)
      .post('/settings/plex')
      .send({ ip: 'plex.example.com', port: 32400, useSsl: false });

    assert.equal(res.status, 500);
    assert.equal(res.body.reason, 'cloudflare-port');
    assert.equal(
      res.body.message,
      'Could not reach Plex at http://plex.example.com:32400 (timed out)'
    );
    assert.match(res.body.explanation, /goes through Cloudflare/);
    assert.deepEqual(res.body.suggestion, {
      ip: 'plex.example.com',
      port: 443,
      useSsl: true,
    });
    assert.deepEqual(tried, [
      'http://plex.example.com:32400',
      'https://plex.example.com:443',
    ]);

    // Neither saved nor changed in memory
    assert.equal(save.mock.callCount(), 0);
    assert.equal(getSettings().plex.ip, '192.168.1.5');
    assert.equal(getSettings().plex.port, 32400);
  });

  it('rejects a URL with a sub path', async () => {
    const res = await request(app)
      .post('/settings/plex')
      .send({ ip: 'https://example.com/plex', port: 443 });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /sub path/);
    assert.deepEqual(tried, []);
  });
});
