import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';

import LazyLibrarianAPI, {
  getLazyLibrarianState,
  isLazyLibrarianConfigured,
  mapLazyLibrarianBook,
} from '@server/api/lazylibrarian';

// A stand-in for LazyLibrarian that answers each command with a canned body
let responses: Record<string, unknown> = {};
let calls: URLSearchParams[] = [];
let server: Server;
let port: number;

before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname !== '/request/api') {
      res.statusCode = 404;
      res.end();
      return;
    }

    calls.push(url.searchParams);
    const body = responses[url.searchParams.get('cmd') ?? ''];
    res.setHeader('Content-Type', 'text/html');
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  responses = {};
  calls = [];
});

const createClient = () =>
  new LazyLibrarianAPI({
    hostname: '127.0.0.1',
    port,
    urlBase: '/request/',
    apiKey: 'a'.repeat(32),
  });

describe('LazyLibrarianAPI', () => {
  it('builds urls with the web root', () => {
    assert.strictEqual(
      LazyLibrarianAPI.buildUrl({
        hostname: 'LazyLibrarian',
        port: 5299,
        urlBase: 'request',
      }),
      'http://LazyLibrarian:5299/request'
    );
    assert.strictEqual(
      LazyLibrarianAPI.buildUrl(
        { hostname: 'books.example.com', useSsl: true },
        '/edit_book?bookid=OL1W'
      ),
      'https://books.example.com:5299/edit_book?bookid=OL1W'
    );
  });

  it('is configured only with a hostname and an api key', () => {
    assert.strictEqual(isLazyLibrarianConfigured({}), false);
    assert.strictEqual(
      isLazyLibrarianConfigured({ hostname: 'LazyLibrarian' }),
      false
    );
    assert.strictEqual(
      isLazyLibrarianConfigured({ hostname: 'LazyLibrarian', apiKey: 'key' }),
      true
    );
  });

  it('reads the version and sends the api key and command', async () => {
    responses.getVersion = {
      Success: true,
      install_type: 'docker',
      current_version: '1.2.3',
    };

    const version = await createClient().getVersion();

    assert.strictEqual(version, '1.2.3');
    assert.strictEqual(calls[0].get('apikey'), 'a'.repeat(32));
    assert.strictEqual(calls[0].get('cmd'), 'getVersion');
  });

  it('throws the message of an error object', async () => {
    responses.getVersion = {
      Success: false,
      Data: '',
      Error: { Code: 401, Message: 'Incorrect API key' },
    };

    await assert.rejects(createClient().getVersion(), /Incorrect API key/);
  });

  it('normalizes the mixed case columns of getAllBooks', async () => {
    responses.getAllBooks = [
      {
        AuthorID: 'OL34184A',
        AuthorName: 'Roald Dahl',
        BookName: 'Fantastic Mr Fox',
        BookID: 'OL45804W',
        BookIsbn: '',
        Status: 'Open',
        audiostatus: 'Wanted',
        booklibrary: '2026-10-01T10:00:00Z',
        audiolibrary: null,
      },
      { BookName: 'No id' },
    ];

    const books = await createClient().getAllBooks();

    assert.deepStrictEqual(books, [
      {
        bookId: 'OL45804W',
        title: 'Fantastic Mr Fox',
        authorId: 'OL34184A',
        authorName: 'Roald Dahl',
        status: 'Open',
        audioStatus: 'Wanted',
        bookLibrary: '2026-10-01T10:00:00Z',
        audioLibrary: undefined,
        isbn: undefined,
        image: undefined,
        date: undefined,
      },
    ]);
  });

  it('maps search results with their match score', async () => {
    responses.findBook = [
      {
        authorname: 'Roald Dahl',
        bookid: 'OL45804W',
        authorid: 'OL34184A',
        bookname: 'Fantastic Mr Fox',
        bookpub: 1970,
        highest_fuzz: 96.5,
        source: 'OpenLibrary',
      },
    ];

    const results = await createClient().findBook('Fantastic Mr Fox');

    assert.strictEqual(calls[0].get('name'), 'Fantastic Mr Fox');
    assert.deepStrictEqual(results, [
      {
        bookId: 'OL45804W',
        title: 'Fantastic Mr Fox',
        authorId: 'OL34184A',
        authorName: 'Roald Dahl',
        isbn: undefined,
        year: '1970',
        score: 96.5,
        source: 'OpenLibrary',
      },
    ]);
  });

  it('adds a book and waits for it', async () => {
    responses.addBook = 'OK';

    await createClient().addBook('OL45804W', { source: 'OpenLibrary' });

    assert.strictEqual(calls[0].get('id'), 'OL45804W');
    assert.strictEqual(calls[0].get('wait'), '1');
    assert.strictEqual(calls[0].get('source'), 'OpenLibrary');
  });

  it('queues and searches one format', async () => {
    responses.queueBook = 'OK';
    responses.searchBook = 'OK';

    const client = createClient();
    await client.queueBook('OL45804W', 'AudioBook');
    await client.searchBook('OL45804W', 'AudioBook');

    assert.deepStrictEqual(
      calls.map((call) => [call.get('cmd'), call.get('id'), call.get('type')]),
      [
        ['queueBook', 'OL45804W', 'AudioBook'],
        ['searchBook', 'OL45804W', 'AudioBook'],
      ]
    );
  });

  it('unqueues one format', async () => {
    responses.unqueueBook = 'OK';

    const client = createClient();
    await client.unqueueBook('OL45804W', 'eBook');

    assert.deepStrictEqual(
      calls.map((call) => [call.get('cmd'), call.get('id'), call.get('type')]),
      [['unqueueBook', 'OL45804W', 'eBook']]
    );

    responses.unqueueBook = 'Invalid id: OL1W';
    await assert.rejects(client.unqueueBook('OL1W', 'AudioBook'), /Invalid id/);
  });

  it('treats a plain text answer other than OK as an error', async () => {
    responses.queueBook = 'Invalid id: OL1W';
    responses.searchBook = 'No search methods set, check config';

    const client = createClient();

    await assert.rejects(client.queueBook('OL1W', 'eBook'), /Invalid id/);
    await assert.rejects(
      client.searchBook('OL1W', 'eBook'),
      /No search methods set/
    );
  });
});

describe('LazyLibrarian statuses', () => {
  it('maps book statuses to availability', () => {
    assert.strictEqual(getLazyLibrarianState('Open'), 'available');
    assert.strictEqual(getLazyLibrarianState('Have'), 'available');
    assert.strictEqual(getLazyLibrarianState('Wanted'), 'processing');
    assert.strictEqual(getLazyLibrarianState('Snatched'), 'processing');
    assert.strictEqual(getLazyLibrarianState('Skipped'), 'skip');
    assert.strictEqual(getLazyLibrarianState('Ignored'), 'skip');
    assert.strictEqual(getLazyLibrarianState(undefined), 'skip');
  });

  it('defaults missing statuses to Skipped', () => {
    const book = mapLazyLibrarianBook({ BookID: 'OL1W', BookName: 'A Book' });

    assert.strictEqual(book.status, 'Skipped');
    assert.strictEqual(book.audioStatus, 'Skipped');
  });
});
