import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { getSettings } from '@server/lib/settings';
import { AxiosError, AxiosHeaders } from 'axios';
import GoogleBooks, {
  getGoogleBooks,
  getGoogleBooksCountry,
  getNextQuotaReset,
  isQuotaError,
} from '.';
import type { GoogleBooksVolume } from './interfaces';

const googleError = (status: number, reason: string) =>
  new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        error: {
          code: status,
          message: 'Quota exceeded',
          errors: [{ reason, message: 'Quota exceeded' }],
        },
      },
    }
  );

const ebookEdition: GoogleBooksVolume = {
  id: 'lFhbDwAAQBAJ',
  volumeInfo: {
    title: 'Atomic Habits',
    authors: ['James Clear'],
    language: 'en',
  },
  saleInfo: { isEbook: true },
};

const printEdition: GoogleBooksVolume = {
  id: '-a5puQEACAAJ',
  volumeInfo: {
    title: 'Atomic Habits',
    authors: ['James Clear'],
    language: 'en',
  },
  saleInfo: { isEbook: false },
};

let searchCalls: Record<string, string>[] = [];
let searchImpl: (
  params: Record<string, string>
) => Promise<GoogleBooksVolume[]>;

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

let keyCount = 0;
// Each client gets its own key, so quota pauses never leak between tests
const newClient = () => new GoogleBooks(`test-key-${++keyCount}`, 'us');

beforeEach(() => {
  searchCalls = [];
  searchImpl = async () => [];
});

describe('getNextQuotaReset', () => {
  it('returns the next midnight in Pacific time', () => {
    // 21:17 on October 9 in Los Angeles, daylight saving time
    assert.equal(
      getNextQuotaReset(new Date('2026-10-10T04:17:00Z')).toISOString(),
      '2026-10-10T07:00:00.000Z'
    );
    // 08:00 on January 15 in Los Angeles, standard time
    assert.equal(
      getNextQuotaReset(new Date('2026-01-15T16:00:00Z')).toISOString(),
      '2026-01-16T08:00:00.000Z'
    );
  });
});

describe('isQuotaError', () => {
  it('recognizes the quota responses of Google', () => {
    assert.equal(isQuotaError(googleError(429, 'rateLimitExceeded')), true);
    assert.equal(isQuotaError(googleError(403, 'rateLimitExceeded')), true);
    assert.equal(isQuotaError(googleError(403, 'dailyLimitExceeded')), true);
  });

  it('leaves other failures alone', () => {
    assert.equal(isQuotaError(googleError(403, 'forbidden')), false);
    assert.equal(isQuotaError(googleError(400, 'badRequest')), false);
    assert.equal(isQuotaError(new Error('socket hang up')), false);
  });
});

describe('getGoogleBooksCountry', () => {
  it('uses the discover region, the US otherwise', () => {
    assert.equal(getGoogleBooksCountry('gb'), 'GB');
    assert.equal(getGoogleBooksCountry(''), 'US');
    assert.equal(getGoogleBooksCountry(undefined), 'US');
    assert.equal(getGoogleBooksCountry('Europe'), 'US');
  });
});

describe('GoogleBooks.findEbook', () => {
  it('stops after the ebook search when it finds an edition', async () => {
    searchImpl = async () => [ebookEdition];

    const result = await newClient().findEbook(
      'Atomic Habits: An Easy and Proven Way',
      ['James Clear'],
      'en'
    );

    assert.deepEqual(result, { exists: true, volumeId: 'lFhbDwAAQBAJ' });
    assert.deepEqual(searchCalls, [
      { q: 'Atomic Habits inauthor:clear', filter: 'ebooks' },
    ]);
  });

  it('searches every volume before reporting no ebook', async () => {
    searchImpl = async (params) => (params.filter ? [] : [printEdition]);

    const result = await newClient().findEbook('Atomic Habits', [
      'James Clear',
    ]);

    assert.deepEqual(result, { exists: false });
    assert.deepEqual(searchCalls, [
      { q: 'Atomic Habits inauthor:clear', filter: 'ebooks' },
      { q: 'Atomic Habits inauthor:clear' },
    ]);
  });

  it('asks nothing for books without an author', async () => {
    const result = await newClient().findEbook('Atomic Habits', []);

    assert.deepEqual(result, { exists: null, failed: true });
    assert.deepEqual(searchCalls, []);
  });

  it('pauses lookups for the rest of the day once the quota is used up', async () => {
    searchImpl = async () => {
      throw googleError(429, 'rateLimitExceeded');
    };
    const client = newClient();

    assert.deepEqual(await client.findEbook('Atomic Habits', ['James Clear']), {
      exists: null,
      failed: true,
    });
    assert.equal(searchCalls.length, 1);
    assert.equal(client.isQuotaExhausted(), true);

    searchImpl = async () => [ebookEdition];

    assert.deepEqual(await client.findEbook('Atomic Habits', ['James Clear']), {
      exists: null,
      failed: true,
    });
    assert.equal(searchCalls.length, 1);
  });

  it('keeps asking after failures that are not about the quota', async () => {
    searchImpl = async () => {
      throw googleError(403, 'forbidden');
    };
    const client = newClient();

    assert.deepEqual(await client.findEbook('Atomic Habits', ['James Clear']), {
      exists: null,
      failed: true,
    });
    assert.equal(client.isQuotaExhausted(), false);
  });
});

describe('getGoogleBooks', () => {
  const main = getSettings().main;
  const original = {
    googleBooksApiKey: main.googleBooksApiKey,
    discoverRegion: main.discoverRegion,
  };

  afterEach(() => {
    Object.assign(main, original);
  });

  it('returns no client without a key', () => {
    main.googleBooksApiKey = '';
    assert.equal(getGoogleBooks(), undefined);

    main.googleBooksApiKey = '   ';
    assert.equal(getGoogleBooks(), undefined);
  });

  it('shares a client until the key or region changes', () => {
    main.googleBooksApiKey = 'key-a';
    main.discoverRegion = 'GB';
    const client = getGoogleBooks();

    assert.ok(client);
    assert.equal(client.country, 'GB');
    assert.equal(getGoogleBooks(), client);

    main.googleBooksApiKey = 'key-b';
    assert.notEqual(getGoogleBooks(), client);
  });
});

describe('GoogleBooks.getNewestByAuthor', () => {
  type Get = (
    endpoint: string,
    config: { params: Record<string, string> },
    ttl: number
  ) => Promise<unknown>;

  const mockGet = (client: GoogleBooks, impl: Get) =>
    mock.method(client as unknown as { get: Get }, 'get', impl).mock;

  it("asks for the author's newest books and keeps them a day", async () => {
    const client = newClient();
    const calls = mockGet(client, async () => ({ items: [printEdition] }));

    assert.deepEqual(await client.getNewestByAuthor('James "J" Clear'), [
      printEdition,
    ]);
    const [endpoint, config, ttl] = calls.calls[0].arguments;
    assert.equal(endpoint, '/volumes');
    assert.equal(config.params.q, 'inauthor:"James J Clear"');
    assert.equal(config.params.orderBy, 'newest');
    assert.equal(ttl, 86400);
  });

  it('answers undefined and pauses once the quota is used up', async () => {
    const client = newClient();
    const calls = mockGet(client, async () => {
      throw googleError(429, 'rateLimitExceeded');
    });

    assert.equal(await client.getNewestByAuthor('James Clear'), undefined);
    assert.equal(await client.getNewestByAuthor('James Clear'), undefined);
    assert.equal(calls.callCount(), 1);
  });
});
