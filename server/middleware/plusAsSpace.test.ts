import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import plusAsSpace, { encodePlusInQuery } from '@server/middleware/plusAsSpace';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import path from 'path';
import request from 'supertest';

const API_SPEC_PATH = path.join(__dirname, '../../seerr-api.yml');

const createApp = () => {
  const app = express();
  app.use('/api', plusAsSpace);
  app.use(
    OpenApiValidator.middleware({
      apiSpec: API_SPEC_PATH,
      validateRequests: true,
      validateSecurity: false,
    })
  );
  app.get('/api/v1/search', (req, res) => {
    res.status(200).json({ query: req.query.query, page: req.query.page });
  });
  app.get('/api/v1/media', (req, res) => {
    res.status(200).json({ filter: req.query.filter });
  });
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
  return app;
};

describe('encodePlusInQuery', () => {
  it('encodes a plus in the query string only', () => {
    assert.strictEqual(
      encodePlusInQuery('/api/v1/search?query=the+hobbit&page=1'),
      '/api/v1/search?query=the%20hobbit&page=1'
    );
    assert.strictEqual(
      encodePlusInQuery('/api/v1/a+b?q=c+d#e+f'),
      '/api/v1/a+b?q=c%20d#e+f'
    );
  });

  it('leaves urls without a plus in the query alone', () => {
    for (const url of [
      '/api/v1/search',
      '/api/v1/a+b',
      '/api/v1/search?query=the%20hobbit',
      '/api/v1/search?query=c%2B%2B',
    ]) {
      assert.strictEqual(encodePlusInQuery(url), url);
    }
  });
});

describe('plusAsSpace', () => {
  it('lets a form encoded search through the validator', async () => {
    const res = await request(createApp()).get(
      '/api/v1/search?query=the+hobbit&page=2'
    );

    assert.strictEqual(res.status, 200, res.body.message);
    assert.strictEqual(res.body.query, 'the hobbit');
  });

  it('keeps percent encoded spaces and plus signs', async () => {
    const app = createApp();

    const spaces = await request(app).get('/api/v1/search?query=the%20hobbit');
    assert.strictEqual(spaces.status, 200, spaces.body.message);
    assert.strictEqual(spaces.body.query, 'the hobbit');

    const plus = await request(app).get('/api/v1/search?query=c%2B%2B+primer');
    assert.strictEqual(plus.status, 200, plus.body.message);
    assert.strictEqual(plus.body.query, 'c++ primer');
  });

  it('still turns other reserved characters away', async () => {
    const res = await request(createApp()).get('/api/v1/search?query=a@b');

    assert.strictEqual(res.status, 400);
  });

  it('applies to other query parameters as well', async () => {
    const res = await request(createApp()).get(
      '/api/v1/media?filter=allavailable+'
    );

    // The space is decoded, then the enum check rejects the value as usual
    assert.strictEqual(res.status, 400);
    assert.doesNotMatch(res.body.message, /reserved characters/);
  });
});
