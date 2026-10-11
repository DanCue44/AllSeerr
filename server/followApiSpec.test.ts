import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import path from 'path';
import request from 'supertest';

const API_SPEC_PATH = path.join(__dirname, '../seerr-api.yml');

// Artists and authors are followed through the watchlist routes, which the
// request validator checks against seerr-api.yml
describe('seerr-api.yml (followed artists and authors)', () => {
  it('accepts artists and authors on the watchlist routes', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      OpenApiValidator.middleware({
        apiSpec: API_SPEC_PATH,
        validateRequests: true,
        validateSecurity: false,
      })
    );
    app.post('/api/v1/watchlist', (_req, res) => {
      res.status(201).json({});
    });
    app.delete('/api/v1/watchlist/:tmdbId', (_req, res) => {
      res.status(204).send();
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

    const artist = await request(app).post('/api/v1/watchlist').send({
      mbId: 'a74b1b7f-71a5-4011-9441-d0b5e4122711',
      mediaType: 'artist',
      title: 'Radiohead',
    });
    assert.strictEqual(artist.status, 201, artist.body.message);

    const author = await request(app)
      .post('/api/v1/watchlist')
      .send({ olId: 'OL34184A', mediaType: 'author' });
    assert.strictEqual(author.status, 201, author.body.message);

    const unknown = await request(app)
      .post('/api/v1/watchlist')
      .send({ olId: 'OL34184A', mediaType: 'publisher' });
    assert.strictEqual(unknown.status, 400);

    const unfollowArtist = await request(app).delete(
      '/api/v1/watchlist/a74b1b7f-71a5-4011-9441-d0b5e4122711?mediaType=artist'
    );
    assert.strictEqual(
      unfollowArtist.status,
      204,
      unfollowArtist.body?.message
    );

    const unfollowAuthor = await request(app).delete(
      '/api/v1/watchlist/OL34184A?mediaType=author'
    );
    assert.strictEqual(
      unfollowAuthor.status,
      204,
      unfollowAuthor.body?.message
    );
  });
});
