import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';

import { MediaType, SeasonRolloverStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import SeasonRollover from '@server/entity/SeasonRollover';
import { Permission } from '@server/lib/permissions';
import { sonarrScanner } from '@server/lib/scanners/sonarr';
import { getSettings } from '@server/lib/settings';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import rolloverRoutes from './rollover';

const runMock = mock.method(sonarrScanner, 'run', async () => undefined).mock;

let app: Express;

before(() => {
  app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use(
    '/rollover',
    isAuthenticated(Permission.MANAGE_REQUESTS),
    rolloverRoutes
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
});

setupTestDb();

async function loginAs(email: string) {
  getSettings().main.localLogin = true;
  const agent = request.agent(app);
  const res = await agent
    .post('/auth/local')
    .send({ email, password: 'test1234' });
  assert.strictEqual(res.status, 200);
  return agent;
}

const LATER = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

async function seedRollover(
  overrides: Partial<SeasonRollover> = {}
): Promise<SeasonRollover> {
  const media = await getRepository(Media).save(
    new Media({ tmdbId: 1100, tvdbId: 1200, mediaType: MediaType.TV })
  );

  return getRepository(SeasonRollover).save(
    new SeasonRollover({
      media,
      is4k: false,
      currentSeason: 5,
      seasons: [3, 4],
      preexistingSeasons: [1, 2],
      deletePreexisting: false,
      deleteAfter: LATER,
      status: SeasonRolloverStatus.PENDING,
      ...overrides,
    })
  );
}

describe('/rollover', () => {
  beforeEach(() => {
    runMock.resetCalls();
  });

  it('lists pending rollovers of a series', async () => {
    const rollover = await seedRollover();
    await getRepository(SeasonRollover).save(
      new SeasonRollover({
        media: rollover.media,
        is4k: false,
        currentSeason: 4,
        seasons: [1],
        preexistingSeasons: [],
        deleteAfter: LATER,
        status: SeasonRolloverStatus.COMPLETED,
      })
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(
      `/rollover?status=pending&mediaId=${rollover.media.id}`
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].id, rollover.id);
    assert.deepStrictEqual(res.body[0].seasons, [3, 4]);
    assert.deepStrictEqual(res.body[0].preexistingSeasons, [1, 2]);
  });

  it('is only for users who manage requests', async () => {
    await seedRollover();
    const agent = await loginAs('demo@seerr.dev');

    const res = await agent.get('/rollover');

    assert.strictEqual(res.status, 403);
  });

  it('keeps the seasons', async () => {
    const rollover = await seedRollover();
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.post(`/rollover/${rollover.id}/keep`);

    assert.strictEqual(res.status, 200);
    const saved = await getRepository(SeasonRollover).findOneOrFail({
      where: { id: rollover.id },
    });
    assert.strictEqual(saved.status, SeasonRolloverStatus.KEPT);
    assert.strictEqual(saved.modifiedBy?.email, 'admin@seerr.dev');
    assert.strictEqual(runMock.callCount(), 0);
  });

  it('ends the notice period and runs the Sonarr scan', async () => {
    const rollover = await seedRollover();
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.post(`/rollover/${rollover.id}/delete-now`);

    assert.strictEqual(res.status, 200);
    const saved = await getRepository(SeasonRollover).findOneOrFail({
      where: { id: rollover.id },
    });
    assert.ok(saved.deleteAfter <= new Date());
    assert.strictEqual(saved.deletePreexisting, false);
    assert.strictEqual(runMock.callCount(), 1);
  });

  it('approves deleting the preexisting seasons of one awaiting review', async () => {
    const rollover = await seedRollover({
      status: SeasonRolloverStatus.REVIEW,
    });
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.post(`/rollover/${rollover.id}/delete-all`);

    assert.strictEqual(res.status, 200);
    const saved = await getRepository(SeasonRollover).findOneOrFail({
      where: { id: rollover.id },
    });
    assert.strictEqual(saved.status, SeasonRolloverStatus.PENDING);
    assert.strictEqual(saved.deletePreexisting, true);
    assert.ok(saved.deleteAfter <= new Date());
  });

  it('refuses to change a rollover that is done', async () => {
    const rollover = await seedRollover({
      status: SeasonRolloverStatus.COMPLETED,
    });
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.post(`/rollover/${rollover.id}/keep`);

    assert.strictEqual(res.status, 409);
  });

  it('refuses an unknown action', async () => {
    const rollover = await seedRollover();
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.post(`/rollover/${rollover.id}/delete-everything`);

    assert.strictEqual(res.status, 400);
  });
});
