import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { ChaptarrBook } from '@server/api/servarr/chaptarr';
import ChaptarrAPI, { isMonitoredFor } from '@server/api/servarr/chaptarr';

type Call = {
  method: string;
  url: string;
  data?: unknown;
  params?: unknown;
};

const lookupResult: ChaptarrBook = {
  id: 7,
  localBookId: '7',
  title: 'Pride and Prejudice',
  foreignBookId: 'gr:3060926',
  monitored: false,
  mediaType: 'audiobook',
  author: { authorName: 'Jane Austen', foreignAuthorId: 'gr:1265' },
  editions: [{ foreignEditionId: 'gr:1', monitored: false }],
  addOptions: { addType: 'automatic', searchForNewBook: false },
};

/**
 * A client whose HTTP calls are recorded and answered by the given handler
 */
const createApi = (
  appName: string,
  respond: (call: Call) => { status?: number; data: unknown } = () => ({
    data: {},
  })
) => {
  const chaptarr = new ChaptarrAPI({
    url: 'http://localhost:8789/api/v1',
    apiKey: 'test-key',
  });
  const calls: Call[] = [];
  const http = (chaptarr as unknown as { axios: Record<string, unknown> })
    .axios;
  const record =
    (method: string) =>
    async (
      url: string,
      dataOrConfig?: unknown,
      config?: { params?: unknown }
    ) => {
      if (url === '/system/status') {
        return { status: 200, data: { appName, version: '1.0' } };
      }

      const call =
        method === 'get' || method === 'delete'
          ? {
              method,
              url,
              params: (dataOrConfig as { params?: unknown })?.params,
              data: (dataOrConfig as { data?: unknown })?.data,
            }
          : { method, url, data: dataOrConfig, params: config?.params };
      calls.push(call);
      const response = respond(call);
      return { status: response.status ?? 200, data: response.data };
    };

  http.get = record('get');
  http.post = record('post');
  http.put = record('put');
  http.delete = record('delete');

  return { chaptarr, calls };
};

const addOptions = {
  mediaType: 'ebook' as const,
  qualityProfileId: 1,
  metadataProfileId: 2,
  rootFolderPath: '/ebooks',
  tags: [3],
  searchForNewBook: true,
};

describe('ChaptarrAPI.addBook', () => {
  it('adds one format with only that book of its author monitored', async () => {
    const { chaptarr, calls } = createApi('Chaptarr', () => ({
      status: 201,
      data: { ...lookupResult, id: 12, mediaType: 'ebook' },
    }));

    const result = await chaptarr.addBook(lookupResult, addOptions);

    assert.strictEqual(result.status, 'added');
    assert.strictEqual(calls.length, 1);
    const [call] = calls;
    assert.strictEqual(call.url, '/book');
    assert.deepStrictEqual(call.params, { mediaType: 'ebook' });

    const payload = call.data as Record<string, unknown> & {
      author: Record<string, unknown>;
    };
    assert.strictEqual(payload.id, 0);
    assert.strictEqual(payload.localBookId, null);
    assert.strictEqual(payload.mediaType, 'ebook');
    assert.strictEqual(payload.monitored, true);
    assert.strictEqual(payload.ebookMonitored, true);
    assert.strictEqual(payload.audiobookMonitored, false);
    assert.deepStrictEqual(payload.addOptions, {
      addType: 'automatic',
      searchForNewBook: true,
    });
    // The first edition is monitored when none is
    assert.deepStrictEqual(payload.editions, [
      { foreignEditionId: 'gr:1', monitored: true },
    ]);
    assert.strictEqual(payload.author.ebookQualityProfileId, 1);
    assert.strictEqual(payload.author.ebookMetadataProfileId, 2);
    assert.strictEqual(payload.author.ebookRootFolderPath, '/ebooks');
    assert.strictEqual(payload.author.ebookMonitorNewItems, 'none');
    assert.deepStrictEqual(payload.author.ebookTags, [3]);
    assert.strictEqual(payload.author.audiobookQualityProfileId, undefined);
    assert.deepStrictEqual(payload.author.addOptions, {
      monitor: 'specificBook',
      booksToMonitor: ['gr:3060926'],
      searchForMissingBooks: false,
    });
  });

  it('returns the pending author import Chaptarr accepted the book with', async () => {
    const { chaptarr } = createApi('Chaptarr', () => ({
      status: 202,
      data: { pendingId: 4, message: 'Author is being prepared' },
    }));

    const result = await chaptarr.addBook(lookupResult, addOptions);

    assert.deepStrictEqual(result, {
      status: 'pending',
      pendingId: 4,
      message: 'Author is being prepared',
    });
  });

  it('adds a book to another Readarr compatible server without format fields', async () => {
    const { chaptarr, calls } = createApi('Readarr', () => ({
      status: 201,
      data: { ...lookupResult, id: 12 },
    }));

    await chaptarr.addBook(lookupResult, addOptions);

    const payload = calls[0].data as Record<string, unknown> & {
      author: Record<string, unknown>;
    };
    assert.strictEqual(calls[0].params, undefined);
    assert.strictEqual(payload.mediaType, 'audiobook');
    assert.strictEqual(payload.ebookMonitored, undefined);
    assert.strictEqual(payload.author.qualityProfileId, 1);
    assert.strictEqual(payload.author.rootFolderPath, '/ebooks');
    assert.strictEqual(payload.author.ebookQualityProfileId, undefined);
    assert.deepStrictEqual(payload.author.addOptions, {
      monitor: 'none',
      searchForMissingBooks: false,
    });
  });
});

describe('ChaptarrAPI library', () => {
  it('reads the library a page at a time', async () => {
    const { chaptarr, calls } = createApi('Chaptarr', ({ params }) => {
      const { offset } = params as { offset: number };
      const records = Array.from(
        { length: offset === 0 ? 500 : 20 },
        (_, index) => ({ id: offset + index + 1 })
      );
      return { data: { records, totalCount: 520 } };
    });

    const books = await chaptarr.getAllBooks();

    assert.strictEqual(books.length, 520);
    assert.deepStrictEqual(
      calls.map((call) => call.params),
      [
        { offset: 0, pageSize: 500, includeUnmonitored: true },
        { offset: 500, pageSize: 500, includeUnmonitored: true },
      ]
    );
  });

  it('only scopes lookups to a format on Chaptarr', async () => {
    const chaptarrApi = createApi('Chaptarr', () => ({ data: [] }));
    const readarrApi = createApi('Readarr', () => ({ data: [] }));

    await chaptarrApi.chaptarr.lookupBooks('gr:3060926', 'ebook');
    await readarrApi.chaptarr.lookupBooks('gr:3060926', 'ebook');

    assert.deepStrictEqual(chaptarrApi.calls[0].params, {
      term: 'gr:3060926',
      mediaType: 'ebook',
    });
    assert.deepStrictEqual(readarrApi.calls[0].params, {
      term: 'gr:3060926',
    });
  });

  it('runs a search for books', async () => {
    const { chaptarr, calls } = createApi('Chaptarr');

    await chaptarr.searchBooks([12]);

    assert.deepStrictEqual(calls, [
      {
        method: 'post',
        url: '/command',
        data: { name: 'BookSearch', bookIds: [12] },
        params: undefined,
      },
    ]);
  });
});

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(path.join(__dirname, 'fixtures/chaptarr', name), 'utf8')
  );

describe('ChaptarrAPI.getBookQueue', () => {
  it('reads the queue with the book of each download', async () => {
    const { chaptarr, calls } = createApi('Chaptarr', () => ({
      data: fixture('queue.json'),
    }));

    const queue = await chaptarr.getBookQueue();

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, '/queue');
    assert.deepStrictEqual(calls[0].params, {
      page: 1,
      pageSize: 200,
      includeBook: true,
      includeAuthor: false,
      includeUnknownAuthorItems: false,
    });
    assert.strictEqual(queue.length, 3);
    assert.strictEqual(queue[0].bookId, 3091);
    assert.strictEqual(queue[0].book?.mediaType, 'ebook');
    assert.strictEqual(queue[1].book?.mediaType, 'audiobook');
  });

  it('returns no downloads for an empty queue', async () => {
    const { chaptarr } = createApi('Chaptarr', () => ({
      data: fixture('queue-empty.json'),
    }));

    assert.deepStrictEqual(await chaptarr.getBookQueue(), []);
  });

  it('fails when Chaptarr cannot be reached', async () => {
    const { chaptarr } = createApi('Chaptarr', () => {
      throw new Error('connect ECONNREFUSED');
    });

    await assert.rejects(chaptarr.getBookQueue(), /Failed to retrieve queue/);
  });
});

describe('ChaptarrAPI.waitForPendingImport', () => {
  it('waits until the import succeeds', async () => {
    const statuses = ['Pending', 'InProgress', 'Succeeded'];
    const { chaptarr } = createApi('Chaptarr', () => ({
      data: { id: 4, overallStatus: statuses.shift() },
    }));

    assert.strictEqual(
      await chaptarr.waitForPendingImport(4, { intervalMs: 1 }),
      'succeeded'
    );
    assert.deepStrictEqual(statuses, []);
  });

  it('treats an import that is gone as finished', async () => {
    const { chaptarr } = createApi('Chaptarr', () => {
      throw Object.assign(new Error('Not found'), {
        response: { status: 404 },
      });
    });

    assert.strictEqual(await chaptarr.waitForPendingImport(4), 'succeeded');
  });

  it('gives up after the timeout', async () => {
    const { chaptarr } = createApi('Chaptarr', () => ({
      data: { id: 4, overallStatus: 'Retrying' },
    }));

    assert.strictEqual(
      await chaptarr.waitForPendingImport(4, { timeoutMs: 5, intervalMs: 2 }),
      'timeout'
    );
  });

  it('reports a failed import', async () => {
    const { chaptarr } = createApi('Chaptarr', () => ({
      data: { id: 4, overallStatus: 'Failed' },
    }));

    assert.strictEqual(await chaptarr.waitForPendingImport(4), 'failed');
  });
});

describe('isMonitoredFor', () => {
  it('reads the monitoring of the format, then the monitored flag', () => {
    assert.strictEqual(
      isMonitoredFor({ ...lookupResult, ebookMonitored: true }, 'ebook'),
      true
    );
    assert.strictEqual(
      isMonitoredFor(
        { ...lookupResult, monitored: true, audiobookMonitored: false },
        'audiobook'
      ),
      false
    );
    assert.strictEqual(
      isMonitoredFor(
        {
          title: 'Emma',
          foreignBookId: 'gr:6969',
          monitored: true,
        },
        'audiobook'
      ),
      true
    );
  });
});

describe('ChaptarrAPI language calls', () => {
  it('saves an author whole without moving its files', async () => {
    const { chaptarr, calls } = createApi('Chaptarr');
    const author = {
      id: 4,
      authorName: 'Jo Nesbo',
      foreignAuthorId: 'gr:4',
      ebookTags: [1],
      audiobookTags: [],
      tags: [1],
    };

    await chaptarr.updateAuthor(author);

    assert.deepStrictEqual(calls, [
      {
        method: 'put',
        url: '/author/4',
        data: author,
        params: { moveFiles: false },
      },
    ]);
  });

  it('creates and updates release profiles', async () => {
    const { chaptarr, calls } = createApi('Chaptarr', (call) => ({
      data: call.method === 'post' ? { ...(call.data as object), id: 2 } : [],
    }));
    const profile = {
      enabled: true,
      required: [],
      ignored: ['/\\b(dansk)\\b/i'],
      indexerId: 0,
      tags: [1],
    };

    const created = await chaptarr.createReleaseProfile(profile);
    await chaptarr.updateReleaseProfile(created);

    assert.strictEqual(created.id, 2);
    assert.deepStrictEqual(
      calls.map((call) => [call.method, call.url]),
      [
        ['post', '/releaseprofile'],
        ['put', '/releaseprofile/2'],
      ]
    );
  });
});
