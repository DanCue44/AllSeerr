import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';

import Audible, { mapAudiobookEdition } from '@server/api/audible';
import type { AudibleProduct } from '@server/api/audible/interfaces';
import OpenLibrary from '@server/api/openlibrary';
import type { OlSearchDoc, OlWork } from '@server/api/openlibrary/interfaces';
import { getRepository } from '@server/datasource';
import MetadataBookAudio from '@server/entity/MetadataBookAudio';
import cacheManager from '@server/lib/cache';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import request from 'supertest';
import bookRoutes from './book';

const WORK_ID = 'OL45804W';
const OTHER_WORK_ID = 'OL45890W';

let searchCalls: Record<string, string>[] = [];
let searchImpl: (params: Record<string, string>) => Promise<AudibleProduct[]>;

// The catalog search is the only call that leaves the server
mock.method(
  Audible.prototype as unknown as {
    searchProducts: (
      params: Record<string, string>
    ) => Promise<AudibleProduct[]>;
  },
  'searchProducts',
  (params: Record<string, string>) => {
    searchCalls.push(params);
    return searchImpl(params);
  }
);
mock.method(
  OpenLibrary.prototype,
  'getWorkSummary',
  async (): Promise<OlSearchDoc> => ({
    key: `/works/${WORK_ID}`,
    title: 'Fantastic Mr Fox',
    author_name: ['Roald Dahl'],
  })
);
mock.method(
  OpenLibrary.prototype,
  'getWork',
  async (): Promise<OlWork> => ({
    key: `/works/${WORK_ID}`,
    title: 'Fantastic Mr Fox',
    type: { key: '/type/work' },
  })
);

const foxEdition: AudibleProduct = {
  asin: 'B0BB3F6HKX',
  title: 'Fantastic Mr. Fox',
  authors: [{ name: 'Roald Dahl' }],
  narrators: [{ name: "Chris O'Dowd" }],
  runtime_length_min: 82,
  product_images: {
    '500': 'https://m.media-amazon.com/images/I/fox._SL500_.jpg',
  },
};

const foxAnswer = {
  exists: true,
  asin: 'B0BB3F6HKX',
  narrators: ["Chris O'Dowd"],
  runtimeMinutes: 82,
  coverUrl: 'https://m.media-amazon.com/images/I/fox._SL500_.jpg',
};

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

setupTestDb();

beforeEach(() => {
  searchCalls = [];
  searchImpl = async () => [foxEdition];
  cacheManager.getCache('audible').flush();
});

describe('GET /book/:id/audiobook', () => {
  it('reports the matched edition and saves the answer', async () => {
    const res = await request(app).get(`/book/${WORK_ID}/audiobook`);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, foxAnswer);
    assert.deepStrictEqual(searchCalls, [
      { title: 'Fantastic Mr Fox', author: 'Roald Dahl' },
    ]);

    const row = await getRepository(MetadataBookAudio).findOneOrFail({
      where: { olId: WORK_ID },
    });
    assert.strictEqual(row.hasAudiobook, true);
    assert.strictEqual(row.asin, 'B0BB3F6HKX');
    assert.strictEqual(row.region, 'us');
    assert.deepStrictEqual(row.narrators, ["Chris O'Dowd"]);
    assert.strictEqual(row.runtimeMinutes, 82);
    assert.strictEqual(row.coverUrl, foxAnswer.coverUrl);
  });

  it('answers from the saved row without asking Audible again', async () => {
    await request(app).get(`/book/${WORK_ID}/audiobook`);
    cacheManager.getCache('audible').flush();
    searchCalls = [];

    const res = await request(app).get(`/book/${WORK_ID}/audiobook`);

    assert.deepStrictEqual(res.body, foxAnswer);
    assert.deepStrictEqual(searchCalls, []);
  });

  it('looks editions saved before narrators were kept up once more', async () => {
    await getRepository(MetadataBookAudio).save(
      new MetadataBookAudio({
        olId: WORK_ID,
        region: 'us',
        hasAudiobook: true,
        asin: 'B0BB3F6HKX',
        narrators: null,
        checkedAt: new Date(),
      })
    );

    const res = await request(app).get(`/book/${WORK_ID}/audiobook`);

    assert.deepStrictEqual(res.body, foxAnswer);
    assert.strictEqual(searchCalls.length, 1);
  });

  it('keeps the older answer when the refresh fails', async () => {
    await getRepository(MetadataBookAudio).save(
      new MetadataBookAudio({
        olId: WORK_ID,
        region: 'us',
        hasAudiobook: true,
        asin: 'B0BB3F6HKX',
        narrators: null,
        checkedAt: new Date(),
      })
    );
    searchImpl = async () => {
      throw new Error('Request failed with status code 503');
    };

    const res = await request(app).get(`/book/${WORK_ID}/audiobook`);

    assert.deepStrictEqual(res.body, { exists: true, asin: 'B0BB3F6HKX' });
  });

  it('tries a keyword search before reporting no audiobook', async () => {
    searchImpl = async () => [
      {
        asin: 'X1',
        title: 'Fantastic Mr Fox',
        subtitle: 'A Summary and Analysis',
        authors: [{ name: 'Roald Dahl' }],
      },
    ];

    const res = await request(app).get(`/book/${WORK_ID}/audiobook`);

    assert.deepStrictEqual(res.body, { exists: false });
    assert.strictEqual(searchCalls.length, 2);
    assert.deepStrictEqual(searchCalls[1], {
      keywords: 'Fantastic Mr Fox Roald Dahl',
    });
  });

  it('reports unknown and saves nothing when Audible fails', async () => {
    searchImpl = async () => {
      throw new Error('Request failed with status code 429');
    };

    const res = await request(app).get(`/book/${WORK_ID}/audiobook`);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { exists: null });
    assert.strictEqual(await getRepository(MetadataBookAudio).count(), 0);
  });

  it('rejects ids that are not OpenLibrary works', async () => {
    const res = await request(app).get('/book/OL1M/audiobook');

    assert.strictEqual(res.status, 404);
  });
});

describe('POST /book/audiobook-availability', () => {
  it('answers each valid book, keyed by work id', async () => {
    searchImpl = async (params) =>
      (params.title ?? params.keywords ?? '').includes('Fox')
        ? [foxEdition]
        : [];

    const res = await request(app)
      .post('/book/audiobook-availability')
      .send({
        books: [
          { olId: WORK_ID, title: 'Fantastic Mr Fox', author: 'Roald Dahl' },
          {
            olId: OTHER_WORK_ID,
            title: 'An Unrecorded Pamphlet',
            author: 'Roald Dahl',
          },
          { olId: 'not-a-work', title: 'Skipped' },
        ],
      });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
      [WORK_ID]: foxAnswer,
      [OTHER_WORK_ID]: { exists: false },
    });
  });

  it('reports unknown for books without an author', async () => {
    const res = await request(app)
      .post('/book/audiobook-availability')
      .send({ books: [{ olId: WORK_ID, title: 'Fantastic Mr Fox' }] });

    assert.deepStrictEqual(res.body, { [WORK_ID]: { exists: null } });
    assert.deepStrictEqual(searchCalls, []);
  });

  it('limits a call to fifty books', async () => {
    const res = await request(app)
      .post('/book/audiobook-availability')
      .send({
        books: Array.from({ length: 51 }, () => ({
          olId: WORK_ID,
          title: 'Fantastic Mr Fox',
        })),
      });

    assert.strictEqual(res.status, 400);
  });
});

describe('mapAudiobookEdition', () => {
  it('keeps the narrators, length and cover of a catalog product', () => {
    // Trimmed from the Audible catalog answer for Steve Jobs
    const product: AudibleProduct = {
      asin: 'B005V0QI82',
      title: 'Steve Jobs',
      authors: [{ asin: 'B000APFLB8', name: 'Walter Isaacson' }],
      narrators: [{ name: 'Dylan Baker' }],
      runtime_length_min: 1518,
      product_images: {
        '500': 'https://m.media-amazon.com/images/I/51S2iJN3DYL._SL500_.jpg',
      },
    };

    assert.deepStrictEqual(mapAudiobookEdition(product), {
      asin: 'B005V0QI82',
      narrators: ['Dylan Baker'],
      runtimeMinutes: 1518,
      coverUrl: 'https://m.media-amazon.com/images/I/51S2iJN3DYL._SL500_.jpg',
    });
  });

  it('drops blank and repeated narrators and missing facts', () => {
    assert.deepStrictEqual(
      mapAudiobookEdition({
        asin: 'B1',
        narrators: [
          { name: ' Full Cast ' },
          { name: '' },
          { name: 'Full Cast' },
        ],
        runtime_length_min: 0,
        product_images: {},
      }),
      {
        asin: 'B1',
        narrators: ['Full Cast'],
        runtimeMinutes: undefined,
        coverUrl: undefined,
      }
    );
  });
});
