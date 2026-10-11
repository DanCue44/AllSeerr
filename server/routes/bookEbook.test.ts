import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it, mock } from 'node:test';

import GoogleBooks from '@server/api/googlebooks';
import type { GoogleBooksVolume } from '@server/api/googlebooks/interfaces';
import OpenLibrary from '@server/api/openlibrary';
import type { OlSearchDoc, OlWork } from '@server/api/openlibrary/interfaces';
import { getRepository } from '@server/datasource';
import MetadataBookEbook from '@server/entity/MetadataBookEbook';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import { AxiosError, AxiosHeaders } from 'axios';
import type { Express } from 'express';
import express from 'express';
import request from 'supertest';
import bookRoutes from './book';

const WORK_ID = 'OL17930368W';
const OTHER_WORK_ID = 'OL45890W';

let searchCalls: Record<string, string>[] = [];
let searchImpl: (
  params: Record<string, string>
) => Promise<GoogleBooksVolume[]>;
let openLibraryCalls = 0;

// The volume search is the only call that leaves the server
mock.method(
  GoogleBooks.prototype as unknown as {
    searchVolumes: (
      params: Record<string, string>
    ) => Promise<GoogleBooksVolume[]>;
  },
  'searchVolumes',
  (params: Record<string, string>) => {
    searchCalls.push(params);
    return searchImpl(params);
  }
);
mock.method(
  OpenLibrary.prototype,
  'getWorkSummary',
  async (): Promise<OlSearchDoc> => {
    openLibraryCalls++;
    return {
      key: `/works/${WORK_ID}`,
      title: 'Atomic Habits',
      author_name: ['James Clear'],
    };
  }
);
mock.method(
  OpenLibrary.prototype,
  'getWork',
  async (): Promise<OlWork> => ({
    key: `/works/${WORK_ID}`,
    title: 'Atomic Habits',
    type: { key: '/type/work' },
  })
);

const ebookEdition: GoogleBooksVolume = {
  id: 'lFhbDwAAQBAJ',
  volumeInfo: {
    title: 'Atomic Habits',
    subtitle: 'An Easy & Proven Way to Build Good Habits & Break Bad Ones',
    authors: ['James Clear'],
    language: 'en',
  },
  saleInfo: { isEbook: true },
};

const quotaError = () =>
  new AxiosError(
    'Request failed with status code 429',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status: 429,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { error: { code: 429, errors: [{ reason: 'rateLimitExceeded' }] } },
    }
  );

const main = getSettings().main;
const originalKey = main.googleBooksApiKey;
let keyCount = 0;
let app: Express;

before(() => {
  app = express();
  app.use(express.json());
  app.use('/book', bookRoutes);
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
  searchCalls = [];
  openLibraryCalls = 0;
  searchImpl = async () => [ebookEdition];
  // A new key per test, so a quota pause never carries over
  main.googleBooksApiKey = `test-key-${++keyCount}`;
  cacheManager.getCache('googlebooks').flush();
});

describe('GET /book/:id/ebook', () => {
  it('reports the matched edition and saves the answer', async () => {
    const res = await request(app).get(`/book/${WORK_ID}/ebook`);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
      exists: true,
      volumeId: 'lFhbDwAAQBAJ',
    });
    assert.deepStrictEqual(searchCalls, [
      { q: 'Atomic Habits inauthor:clear', filter: 'ebooks' },
    ]);

    const row = await getRepository(MetadataBookEbook).findOneOrFail({
      where: { olId: WORK_ID },
    });
    assert.strictEqual(row.hasEbook, true);
    assert.strictEqual(row.volumeId, 'lFhbDwAAQBAJ');
    assert.strictEqual(row.region, 'US');
  });

  it('answers from the saved row without asking Google again', async () => {
    await request(app).get(`/book/${WORK_ID}/ebook`);
    cacheManager.getCache('googlebooks').flush();
    searchCalls = [];

    const res = await request(app).get(`/book/${WORK_ID}/ebook`);

    assert.strictEqual(res.body.exists, true);
    assert.deepStrictEqual(searchCalls, []);
  });

  it('asks Google again once a missing ebook is two weeks old', async () => {
    await getRepository(MetadataBookEbook).save(
      new MetadataBookEbook({
        olId: WORK_ID,
        region: 'US',
        hasEbook: false,
        volumeId: null,
        checkedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      })
    );

    const res = await request(app).get(`/book/${WORK_ID}/ebook`);

    assert.strictEqual(res.body.exists, true);
    assert.strictEqual(searchCalls.length, 1);
  });

  it('reports unknown without asking anything when no key is set', async () => {
    main.googleBooksApiKey = '';

    const res = await request(app).get(`/book/${WORK_ID}/ebook`);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { exists: null });
    assert.deepStrictEqual(searchCalls, []);
    assert.strictEqual(openLibraryCalls, 0);
  });

  it('rejects ids that are not OpenLibrary works', async () => {
    const res = await request(app).get('/book/OL1M/ebook');

    assert.strictEqual(res.status, 404);
  });
});

describe('POST /book/ebook-availability', () => {
  it('answers each valid book, keyed by work id', async () => {
    searchImpl = async (params) =>
      params.q.startsWith('Atomic Habits') ? [ebookEdition] : [];

    const res = await request(app)
      .post('/book/ebook-availability')
      .send({
        books: [
          { olId: WORK_ID, title: 'Atomic Habits', author: 'James Clear' },
          {
            olId: OTHER_WORK_ID,
            title: 'An Unlisted Pamphlet',
            author: 'James Clear',
          },
          { olId: 'not-a-work', title: 'Skipped' },
        ],
      });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
      [WORK_ID]: { exists: true, volumeId: 'lFhbDwAAQBAJ' },
      [OTHER_WORK_ID]: { exists: null },
    });

    // Books Google has no volume of are saved too, so they are not asked
    // about again on every page
    const unlisted = await getRepository(MetadataBookEbook).findOneOrFail({
      where: { olId: OTHER_WORK_ID },
    });
    assert.strictEqual(unlisted.hasEbook, null);
  });

  it('reports unknown for every book when no key is set', async () => {
    main.googleBooksApiKey = '';

    const res = await request(app)
      .post('/book/ebook-availability')
      .send({
        books: [
          { olId: WORK_ID, title: 'Atomic Habits', author: 'James Clear' },
        ],
      });

    assert.deepStrictEqual(res.body, { [WORK_ID]: { exists: null } });
    assert.deepStrictEqual(searchCalls, []);
  });

  it('stops asking once the quota is used up and saves nothing', async () => {
    searchImpl = async () => {
      throw quotaError();
    };

    const res = await request(app)
      .post('/book/ebook-availability')
      .send({
        books: [
          { olId: WORK_ID, title: 'Atomic Habits', author: 'James Clear' },
        ],
      });

    assert.deepStrictEqual(res.body, { [WORK_ID]: { exists: null } });
    assert.strictEqual(searchCalls.length, 1);
    assert.strictEqual(await getRepository(MetadataBookEbook).count(), 0);

    cacheManager.getCache('googlebooks').flush();
    const again = await request(app)
      .post('/book/ebook-availability')
      .send({
        books: [
          {
            olId: OTHER_WORK_ID,
            title: 'Atomic Habits',
            author: 'James Clear',
          },
        ],
      });

    assert.deepStrictEqual(again.body, { [OTHER_WORK_ID]: { exists: null } });
    assert.strictEqual(searchCalls.length, 1);
  });

  it('limits a call to fifty books', async () => {
    const res = await request(app)
      .post('/book/ebook-availability')
      .send({
        books: Array.from({ length: 51 }, () => ({
          olId: WORK_ID,
          title: 'Atomic Habits',
        })),
      });

    assert.strictEqual(res.status, 400);
  });
});
