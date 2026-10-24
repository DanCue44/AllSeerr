import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import type {
  TalearrComicDiscoverList,
  TalearrComicLookupResponse,
} from '@server/api/servarr/talearrComics';
import TalearrComicsAPI from '@server/api/servarr/talearrComics';
import { DiscoverSliderType } from '@server/constants/discover';
import { getRepository } from '@server/datasource';
import DiscoverSlider from '@server/entity/DiscoverSlider';
import MetadataComic from '@server/entity/MetadataComic';
import { User } from '@server/entity/User';
import { UserAccessProfile } from '@server/entity/UserAccessProfile';
import {
  interleaveComics,
  resetComicsDiscoverCache,
  resetComicsLibraryCache,
  resetComicsStatusCache,
} from '@server/lib/comics';
import { Permission } from '@server/lib/permissions';
import type { ChaptarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import authRoutes from '@server/routes/auth';
import comicRoutes from '@server/routes/comic';
import discoverRoutes from '@server/routes/discover';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { In } from 'typeorm';

// The real client, kept before the fake below replaces it
const realDiscover = TalearrComicsAPI.prototype.discover;

// What Talearr answers and what it was asked. Undefined answers as a
// Talearr without discover lists does.
let statusAnswer: { available: boolean };
let discoverAnswers: Partial<
  Record<TalearrComicDiscoverList, TalearrComicLookupResponse | undefined>
>;
let discoverCalls: { list: TalearrComicDiscoverList; page: number }[] = [];

const manga = (
  aniListId: number,
  title: string,
  extra: Partial<TalearrComicLookupResponse['results'][number]> = {}
): TalearrComicLookupResponse['results'][number] => ({
  aniListId,
  kind: 'manga',
  title,
  alternateTitles: [],
  ageRating: 'Teen',
  isAdult: false,
  coverUrl: `https://s4.anilist.co/file/${aniListId}.jpg`,
  ...extra,
});

const comic = (
  hardcoverSeriesId: number,
  title: string,
  extra: Partial<TalearrComicLookupResponse['results'][number]> = {}
): TalearrComicLookupResponse['results'][number] => ({
  hardcoverSeriesId,
  kind: 'comic',
  title,
  alternateTitles: [],
  ageRating: 'Teen',
  isAdult: false,
  ...extra,
});

const defaultAnswers = (): typeof discoverAnswers => ({
  trending: {
    results: [
      manga(118586, 'Frieren', { authors: 'Kanehito Yamada', volumes: 13 }),
      manga(30013, 'One Piece'),
      manga(5000, 'Grown-up Series', {
        ageRating: 'Adults Only 18+',
        isAdult: true,
      }),
      manga(5001, 'Mature Series', { ageRating: 'Mature 17+' }),
    ],
    notices: [],
  },
  popular: { results: [manga(30002, 'Berserk')], notices: [] },
  releasing: { results: [manga(118586, 'Frieren')], notices: [] },
  comics: {
    results: [
      comic(4521, 'Saga', { authors: 'Brian K. Vaughan' }),
      comic(77, 'Bone'),
    ],
    notices: ['Hardcover is slow'],
  },
});

mock.method(TalearrComicsAPI.prototype, 'getStatus', async () => ({
  ...statusAnswer,
  ageRatings: [],
}));
mock.method(
  TalearrComicsAPI.prototype,
  'discover',
  async (list: TalearrComicDiscoverList, page = 1) => {
    discoverCalls.push({ list, page });
    return discoverAnswers[list];
  }
);
mock.method(TalearrComicsAPI.prototype, 'getSeries', async () => []);

const talearrServer: ChaptarrSettings = {
  id: 0,
  name: 'Talearr',
  hostname: 'talearr',
  port: 8789,
  apiKey: 'test-key',
  useSsl: false,
  activeProfileId: 1,
  activeProfileName: 'E-Book',
  activeDirectory: '/ebooks',
  activeMetadataProfileId: 2,
  activeMetadataProfileName: 'Ebook Default',
  tags: [],
  is4k: false,
  isDefault: true,
  syncEnabled: true,
  preventSearch: false,
  tagRequests: false,
  overrideRule: [],
};

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/comic', comicRoutes);
  app.use('/discover', discoverRoutes);
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
}

async function loginAs(email: string) {
  const settings = getSettings();
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

async function setAgeLimit(email: string) {
  const user = await getRepository(User).findOneOrFail({ where: { email } });
  await getRepository(UserAccessProfile).save(
    new UserAccessProfile({ user, ageLimit: 'teen' })
  );
}

const ids = (res: { body: { results: { id: string }[] } }) =>
  res.body.results.map((result) => result.id);

before(() => {
  app = createApp();
});

setupTestDb();

beforeEach(async () => {
  statusAnswer = { available: true };
  discoverAnswers = defaultAnswers();
  discoverCalls = [];
  resetComicsStatusCache();
  resetComicsLibraryCache();
  resetComicsDiscoverCache();
  const settings = getSettings();
  settings.chaptarr = [{ ...talearrServer }];
  settings.main.bookService = 'talearr';
  const repository = getRepository(User);
  const demo = await repository.findOneOrFail({
    where: { email: 'demo@seerr.dev' },
  });
  demo.permissions = Permission.REQUEST_BOOK;
  await repository.save(demo);
});

afterEach(() => {
  getSettings().chaptarr = [];
  getSettings().main.bookService = undefined;
  resetComicsStatusCache();
  resetComicsDiscoverCache();
});

describe('GET /discover/comics/trending', () => {
  it('maps trending manga and saves them so their pages work', async () => {
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/discover/comics/trending');

    assert.strictEqual(res.status, 200, res.body.message);
    assert.deepEqual(ids(res), ['al-118586', 'al-30013', 'al-5000', 'al-5001']);
    assert.deepEqual(discoverCalls, [{ list: 'trending', page: 1 }]);
    assert.strictEqual(res.body.page, 1);
    assert.strictEqual(res.body.totalPages, 2);
    assert.deepEqual(res.body.results[0], {
      id: 'al-118586',
      mediaType: 'comic',
      kind: 'manga',
      title: 'Frieren',
      authors: 'Kanehito Yamada',
      volumes: 13,
      ageRating: 'Teen',
      isAdult: false,
      posterPath: 'https://s4.anilist.co/file/118586.jpg',
    });

    const saved = await getRepository(MetadataComic).find({
      where: { comicId: In(['al-118586', 'al-30013']) },
    });
    assert.strictEqual(saved.length, 2);

    const detail = await agent.get('/comic/al-118586');
    assert.strictEqual(detail.status, 200, detail.body.message);
    assert.strictEqual(detail.body.title, 'Frieren');
  });

  it('passes the page on', async () => {
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/discover/comics/trending').query({ page: 3 });

    assert.strictEqual(res.status, 200, res.body.message);
    assert.strictEqual(res.body.page, 3);
    assert.deepEqual(discoverCalls, [{ list: 'trending', page: 3 }]);
  });

  it('leaves out series above the age limit of the person', async () => {
    await setAgeLimit('demo@seerr.dev');
    const agent = await loginAs('demo@seerr.dev');

    const res = await agent.get('/discover/comics/trending');

    assert.strictEqual(res.status, 200, res.body.message);
    assert.deepEqual(ids(res), ['al-118586', 'al-30013']);
  });

  it('keeps an hour of answers, so Talearr is asked once', async () => {
    const agent = await loginAs('admin@seerr.dev');

    await agent.get('/discover/comics/trending');
    const res = await agent.get('/discover/comics/trending');

    assert.strictEqual(res.status, 200, res.body.message);
    assert.strictEqual(res.body.results.length, 4);
    assert.strictEqual(discoverCalls.length, 1);
  });

  it('answers no series from a Talearr without discover lists', async () => {
    discoverAnswers = {};
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/discover/comics/trending');

    assert.strictEqual(res.status, 200, res.body.message);
    assert.deepEqual(res.body.results, []);
    assert.strictEqual(res.body.totalPages, 1);
  });

  it('is not found while comics are off', async () => {
    statusAnswer = { available: false };
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/discover/comics/trending');

    assert.strictEqual(res.status, 404);
    assert.deepEqual(discoverCalls, []);
  });
});

describe('the other comic lists', () => {
  it('serves popular and releasing manga', async () => {
    const agent = await loginAs('admin@seerr.dev');

    const popular = await agent.get('/discover/comics/popular');
    const releasing = await agent.get('/discover/comics/releasing');

    assert.deepEqual(ids(popular), ['al-30002']);
    assert.deepEqual(ids(releasing), ['al-118586']);
  });

  it('serves popular Western comics from the comics list', async () => {
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/discover/comics/western');

    assert.strictEqual(res.status, 200, res.body.message);
    assert.deepEqual(ids(res), ['hc-4521', 'hc-77']);
    assert.deepEqual(res.body.notices, ['Hardcover is slow']);
    assert.deepEqual(discoverCalls, [{ list: 'comics', page: 1 }]);
    assert.strictEqual(res.body.results[0].kind, 'comic');
  });

  it('mixes trending manga and popular comics, taking turns', async () => {
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/discover/comics');

    assert.strictEqual(res.status, 200, res.body.message);
    assert.deepEqual(ids(res), [
      'al-118586',
      'hc-4521',
      'al-30013',
      'hc-77',
      'al-5000',
      'al-5001',
    ]);
  });

  it('shows the rows of the lists Talearr has', async () => {
    discoverAnswers = { comics: defaultAnswers().comics };
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/discover/comics');

    assert.strictEqual(res.status, 200, res.body.message);
    assert.deepEqual(ids(res), ['hc-4521', 'hc-77']);
  });
});

describe('interleaveComics', () => {
  it('takes turns and keeps a series once', () => {
    const row = (comicId: string) => new MetadataComic({ comicId });

    assert.deepEqual(
      interleaveComics([
        [row('al-1'), row('al-2'), row('al-3')],
        [row('hc-1'), row('al-2')],
      ]).map((each) => each.comicId),
      ['al-1', 'hc-1', 'al-2', 'al-3']
    );
  });
});

describe('TalearrComicsAPI.discover', () => {
  const clientAnswering = (status: number, data: unknown) => {
    const api = new TalearrComicsAPI({
      url: 'http://talearr:8789/api/v1',
      apiKey: 'test-key',
    });
    const asked: unknown[] = [];
    (
      api as unknown as {
        axios: { get: (url: string, config: unknown) => Promise<unknown> };
      }
    ).axios.get = async (url, config) => {
      asked.push({ url, config });
      return { status, data };
    };
    return { api, asked };
  };

  it('answers undefined from a Talearr without discover lists', async () => {
    const { api } = clientAnswering(404, { message: 'Not Found' });

    assert.strictEqual(await realDiscover.call(api, 'trending', 1), undefined);
  });

  it('reads the series of a list', async () => {
    const { api, asked } = clientAnswering(200, {
      results: [manga(30013, 'One Piece'), { title: 'No ids' }],
      notices: ['AniList is slow'],
    });

    const answer = await realDiscover.call(api, 'popular', 2);

    assert.deepEqual(
      answer?.results.map((result) => result.aniListId),
      [30013]
    );
    assert.deepEqual(answer?.notices, ['AniList is slow']);
    assert.strictEqual(asked.length, 1);
    const { url, config } = asked[0] as {
      url: string;
      config: { params: unknown };
    };
    assert.strictEqual(url, '/talearr/comics/discover');
    assert.deepEqual(config.params, { list: 'popular', page: 2 });
  });
});

describe('comic Discover sliders', () => {
  it('are added to an install that has the other sliders already', async () => {
    const repository = getRepository(DiscoverSlider);
    const comicTypes = [
      DiscoverSliderType.TRENDING_COMICS,
      DiscoverSliderType.POPULAR_MANGA,
      DiscoverSliderType.NEW_MANGA,
      DiscoverSliderType.POPULAR_COMICS,
    ];

    await DiscoverSlider.bootstrapSliders();
    await repository.delete({ type: In(comicTypes) });
    const before = await repository.count();

    await DiscoverSlider.bootstrapSliders();

    const added = await repository.find({
      where: { type: In(comicTypes) },
      order: { order: 'ASC' },
    });
    assert.deepEqual(
      added.map((slider) => [slider.type, slider.isBuiltIn, slider.enabled]),
      comicTypes.map((type) => [type, true, true])
    );
    assert.strictEqual(await repository.count(), before + comicTypes.length);
  });
});
