import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, it, mock } from 'node:test';

import type {
  AudiobookshelfBookItem,
  AudiobookshelfSearchResponse,
} from '@server/api/audiobookshelf';
import AudiobookshelfAPI, { mapSearchBooks } from '@server/api/audiobookshelf';
import OpenLibrary from '@server/api/openlibrary';
import { MediaStatus, MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import type { AudiobookshelfBook } from '@server/lib/audiobookshelfItem';
import {
  findAudiobookshelfItem,
  getAudiobookshelfItemId,
  getAudiobookshelfLinks,
  getItemTitles,
  getSearchQueries,
  lookupAudiobookshelfItem,
} from '@server/lib/audiobookshelfItem';
import cacheManager from '@server/lib/cache';
import type { AudiobookshelfSettings } from '@server/lib/settings';

const AUDIOBOOK_LIBRARY = '3f2b8c1e-6a4d-4e9b-8c7a-1d2e3f4a5b6c';
const EBOOK_LIBRARY = '9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c6b';
const AUDIOBOOK_ITEM = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const EBOOK_ITEM = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

// Trimmed library searches for "Steve Jobs" from a real server
const loadFixture = (name: string): AudiobookshelfSearchResponse =>
  JSON.parse(
    readFileSync(
      join(__dirname, '..', 'test', 'fixtures', `${name}.json`),
      'utf8'
    )
  );
const audiobookSearch = loadFixture('audiobookshelf-search-audiobooks');
const ebookSearch = loadFixture('audiobookshelf-search-ebooks');

const item = (
  title: string,
  authors: string[],
  extra: Partial<AudiobookshelfBookItem> = {}
): AudiobookshelfBookItem => ({
  id: `item-${title}`,
  title,
  authors,
  series: [],
  ...extra,
});

const book = (
  title: string,
  authors: string[],
  extra: Partial<AudiobookshelfBook> = {}
): AudiobookshelfBook => ({ olId: 'OL1W', title, authors, ...extra });

const settings: AudiobookshelfSettings = {
  url: 'https://books.example.com/',
  libraryId: AUDIOBOOK_LIBRARY,
  ebookLibraryId: EBOOK_LIBRARY,
  apiKey: 'secret',
};

const steveJobs = book('Steve Jobs', ['Walter Isaacson'], { olId: 'OL16W' });

let searchCalls: { libraryId: string; query: string }[] = [];
let searchImpl: (
  libraryId: string,
  query: string
) => Promise<AudiobookshelfBookItem[]>;
let isbnCalls = 0;
let isbns: string[] = [];

// The library search is the only call that leaves the server
mock.method(
  AudiobookshelfAPI.prototype,
  'searchBooks',
  (libraryId: string, query: string) => {
    searchCalls.push({ libraryId, query });
    return searchImpl(libraryId, query);
  }
);
mock.method(OpenLibrary.prototype, 'getWorkIsbns', async () => {
  isbnCalls++;
  return isbns;
});

beforeEach(() => {
  searchCalls = [];
  isbnCalls = 0;
  isbns = [];
  searchImpl = async (libraryId) =>
    mapSearchBooks(libraryId === EBOOK_LIBRARY ? ebookSearch : audiobookSearch);
  cacheManager.getCache('audiobookshelf').flush();
});

describe('mapSearchBooks', () => {
  it('maps the books of a library search', () => {
    assert.deepStrictEqual(mapSearchBooks(ebookSearch), [
      {
        id: EBOOK_ITEM,
        title: 'Steve Jobs',
        subtitle: undefined,
        authors: ['Walter Isaacson'],
        series: [],
        isbn: '9781451648553',
        asin: undefined,
      },
    ]);
  });

  it('skips items missing on disk or without a title', () => {
    assert.deepStrictEqual(
      mapSearchBooks({
        book: [
          {
            libraryItem: {
              id: 'gone',
              isMissing: true,
              media: { metadata: { title: 'Dune' } },
            },
          },
          { libraryItem: { id: 'untitled', media: { metadata: {} } } },
          {
            libraryItem: {
              id: 'dune',
              media: {
                metadata: { title: 'Dune', authorName: 'Frank Herbert' },
              },
            },
          },
        ],
      }).map((found) => [found.id, found.authors]),
      [['dune', ['Frank Herbert']]]
    );
  });
});

describe('getItemTitles', () => {
  it('adds the title without a series prefix or alternative title', () => {
    assert.ok(
      getItemTitles(item('The Expanse 01 - Leviathan Wakes', [])).includes(
        'Leviathan Wakes'
      )
    );
    assert.ok(
      getItemTitles(
        item('Discworld 3: Equal Rites', [], { series: ['Discworld'] })
      ).includes('Equal Rites')
    );
    assert.ok(
      getItemTitles(item('Book 2 - The Two Towers', [])).includes(
        'The Two Towers'
      )
    );
    assert.ok(
      getItemTitles(item('The Hobbit, or There and Back Again', [])).includes(
        'The Hobbit'
      )
    );
  });
});

describe('findAudiobookshelfItem', () => {
  it('matches the real Steve Jobs items in both libraries', () => {
    assert.strictEqual(
      findAudiobookshelfItem(steveJobs, mapSearchBooks(audiobookSearch))?.id,
      AUDIOBOOK_ITEM
    );
    assert.strictEqual(
      findAudiobookshelfItem(steveJobs, mapSearchBooks(ebookSearch))?.id,
      EBOOK_ITEM
    );
  });

  it('ignores case, punctuation, a leading article and subtitles', () => {
    const cases: [string, string][] = [
      ['Fantastic Mr Fox', 'Fantastic Mr. Fox'],
      ["Ender's Game", 'Enders Game'],
      ['Pride and Prejudice', 'Pride & Prejudice'],
      ['The Hobbit', 'Hobbit'],
      ['Sapiens: A Brief History of Humankind', 'Sapiens'],
      ['Dune', 'Dune (Unabridged)'],
      ['Les Misérables', 'Les Miserables'],
    ];

    for (const [title, itemTitle] of cases) {
      assert.ok(
        findAudiobookshelfItem(book(title, ['Some Author']), [
          item(itemTitle, ['Some Author']),
        ]),
        `${title} should match ${itemTitle}`
      );
    }
  });

  it('sees through series prefixes', () => {
    assert.ok(
      findAudiobookshelfItem(book('Leviathan Wakes', ['James S. A. Corey']), [
        item('The Expanse 01 - Leviathan Wakes', ['James S. A. Corey']),
      ])
    );
    assert.ok(
      findAudiobookshelfItem(book('Equal Rites', ['Terry Pratchett']), [
        item('Discworld 3: Equal Rites', ['Terry Pratchett'], {
          series: ['Discworld'],
        }),
      ])
    );
  });

  it('never matches sequels, companions or other authors', () => {
    assert.strictEqual(
      findAudiobookshelfItem(book('Dune', ['Frank Herbert']), [
        item('Dune Messiah', ['Frank Herbert']),
        item('Dune', ['Brian Herbertson']),
        item('Dune: Summary and Analysis', ['Frank Herbert']),
      ]),
      undefined
    );
  });

  it('prefers an exact title over one that only contains it', () => {
    const match = findAudiobookshelfItem(
      book("Harry Potter and the Sorcerer's Stone", ['J. K. Rowling']),
      [
        item("Harry Potter and the Sorcerer's Stone, Book 1", [
          'J. K. Rowling',
        ]),
        item("Harry Potter and the Sorcerer's Stone", ['J.K. Rowling'], {
          id: 'exact',
        }),
      ]
    );

    assert.strictEqual(match?.id, 'exact');
  });

  it('matches by ASIN or ISBN whatever the title', () => {
    assert.strictEqual(
      findAudiobookshelfItem(
        book('Steve Jobs', ['Walter Isaacson'], { asin: 'b005v0qi82' }),
        [
          item('Steve Jobs (Biography)', ['W. Isaacson'], {
            asin: 'B005V0QI82',
          }),
        ]
      )?.asin,
      'B005V0QI82'
    );
    assert.ok(
      findAudiobookshelfItem(
        steveJobs,
        [item('Jobs', [], { isbn: '978-1-4516-4855-3' })],
        ['9781451648553']
      )
    );
  });

  it('trusts only an exact title when authors are unknown', () => {
    assert.ok(
      findAudiobookshelfItem(book('Beowulf', []), [item('Beowulf', [])])
    );
    assert.strictEqual(
      findAudiobookshelfItem(book('Beowulf', []), [
        item('Beowulf: A New Translation', ['Seamus Heaney']),
        item('Beowulf and Grendel', []),
      ])?.id,
      'item-Beowulf: A New Translation'
    );
  });
});

describe('getSearchQueries', () => {
  it('searches by ASIN, main title, without the article and a long word', () => {
    assert.deepStrictEqual(
      getSearchQueries(
        book('The Fantastic Mr. Fox: A Story', ['Roald Dahl'], { asin: 'B1' })
      ),
      ['B1', 'The Fantastic Mr. Fox', 'Fantastic Mr. Fox', 'Fantastic']
    );
    assert.deepStrictEqual(getSearchQueries(book('Dune', [])), ['Dune']);
  });
});

describe('lookupAudiobookshelfItem', () => {
  it('remembers matches without asking again', async () => {
    assert.strictEqual(
      await lookupAudiobookshelfItem(settings, AUDIOBOOK_LIBRARY, steveJobs),
      AUDIOBOOK_ITEM
    );
    assert.strictEqual(
      await lookupAudiobookshelfItem(settings, AUDIOBOOK_LIBRARY, steveJobs),
      AUDIOBOOK_ITEM
    );
    assert.deepStrictEqual(searchCalls, [
      { libraryId: AUDIOBOOK_LIBRARY, query: 'Steve Jobs' },
    ]);
  });

  it('tries each search, then the ISBNs, before remembering a miss', async () => {
    searchImpl = async () => [
      item('Jobs: A Life', ['Someone Else'], { isbn: '9780000000000' }),
    ];

    assert.strictEqual(
      await lookupAudiobookshelfItem(
        settings,
        AUDIOBOOK_LIBRARY,
        book('The Fantastic Mr Fox', ['Roald Dahl'])
      ),
      null
    );
    assert.deepStrictEqual(
      searchCalls.map((call) => call.query),
      ['The Fantastic Mr Fox', 'Fantastic Mr Fox', 'Fantastic']
    );
    assert.strictEqual(isbnCalls, 1);

    searchCalls = [];
    assert.strictEqual(
      await lookupAudiobookshelfItem(
        settings,
        AUDIOBOOK_LIBRARY,
        book('The Fantastic Mr Fox', ['Roald Dahl'])
      ),
      null
    );
    assert.deepStrictEqual(searchCalls, []);
  });

  it('finds an item by ISBN when the titles differ', async () => {
    isbns = ['9781451648553'];
    searchImpl = async () => [
      item('Steve Jobs: Die autorisierte Biografie', ['W. Isaacson'], {
        isbn: '9781451648553',
      }),
    ];

    assert.strictEqual(
      await lookupAudiobookshelfItem(
        settings,
        EBOOK_LIBRARY,
        book('Steve Jobs', ['Someone Else'])
      ),
      'item-Steve Jobs: Die autorisierte Biografie'
    );
  });

  it('reports unknown when the server fails, and waits before retrying', async () => {
    searchImpl = async () => {
      throw new Error('connect ECONNREFUSED');
    };

    assert.strictEqual(
      await lookupAudiobookshelfItem(settings, AUDIOBOOK_LIBRARY, steveJobs),
      undefined
    );
    assert.strictEqual(
      await lookupAudiobookshelfItem(settings, AUDIOBOOK_LIBRARY, steveJobs),
      undefined
    );
    assert.strictEqual(searchCalls.length, 1);
  });

  it('shares one lookup between concurrent page loads', async () => {
    await Promise.all([
      lookupAudiobookshelfItem(settings, AUDIOBOOK_LIBRARY, steveJobs),
      lookupAudiobookshelfItem(settings, AUDIOBOOK_LIBRARY, steveJobs),
    ]);

    assert.strictEqual(searchCalls.length, 1);
  });
});

describe('getAudiobookshelfItemId', () => {
  it('stops waiting after the budget and remembers the late answer', async () => {
    let finish: (items: AudiobookshelfBookItem[]) => void = () => undefined;
    searchImpl = () =>
      new Promise((resolve) => {
        finish = resolve;
      });

    assert.strictEqual(
      await getAudiobookshelfItemId(settings, AUDIOBOOK_LIBRARY, steveJobs, 5),
      undefined
    );

    finish(mapSearchBooks(audiobookSearch));
    await new Promise((resolve) => setImmediate(resolve));

    assert.strictEqual(
      await getAudiobookshelfItemId(settings, AUDIOBOOK_LIBRARY, steveJobs, 5),
      AUDIOBOOK_ITEM
    );
    assert.strictEqual(searchCalls.length, 1);
  });
});

describe('getAudiobookshelfLinks', () => {
  const bothAvailable = new Media({
    olId: 'OL16W',
    mediaType: MediaType.BOOK,
    status: MediaStatus.AVAILABLE,
    statusAudio: MediaStatus.AVAILABLE,
  });

  it('links each format to its item in its library', async () => {
    assert.deepStrictEqual(
      await getAudiobookshelfLinks(settings, steveJobs, bothAvailable),
      {
        audiobookshelfUrl: `https://books.example.com/item/${AUDIOBOOK_ITEM}`,
        audiobookshelfEbookUrl: `https://books.example.com/item/${EBOOK_ITEM}`,
        audiobookshelfAudiobookUrl: `https://books.example.com/item/${AUDIOBOOK_ITEM}`,
        audiobookshelfEbookItemId: EBOOK_ITEM,
        audiobookshelfAudiobookItemId: AUDIOBOOK_ITEM,
        nobookendsEbookUrl: `https://nobookends.com/open/item/${EBOOK_ITEM}?server=https%3A%2F%2Fbooks.example.com&format=ebook`,
        nobookendsAudiobookUrl: `https://nobookends.com/open/item/${AUDIOBOOK_ITEM}?server=https%3A%2F%2Fbooks.example.com&format=audiobook`,
      }
    );
  });

  it('leaves NoBookEnds out when an admin hides it', async () => {
    const links = await getAudiobookshelfLinks(
      { ...settings, showNoBookEnds: false },
      steveJobs,
      bothAvailable
    );

    assert.strictEqual(links.nobookendsEbookUrl, null);
    assert.strictEqual(links.nobookendsAudiobookUrl, null);
    assert.strictEqual(links.audiobookshelfAudiobookItemId, AUDIOBOOK_ITEM);
  });

  it('keeps the title search without an API key', async () => {
    const links = await getAudiobookshelfLinks(
      { ...settings, apiKey: '' },
      steveJobs,
      bothAvailable
    );

    assert.strictEqual(
      links.audiobookshelfEbookUrl,
      `https://books.example.com/library/${EBOOK_LIBRARY}/search?q=Steve%20Jobs`
    );
    assert.deepStrictEqual(searchCalls, []);
    assert.strictEqual(links.audiobookshelfEbookItemId, null);
    assert.strictEqual(links.nobookendsEbookUrl, null);
  });

  it('falls back to the title search when the book is not found', async () => {
    searchImpl = async () => [];

    const links = await getAudiobookshelfLinks(
      settings,
      steveJobs,
      bothAvailable
    );

    assert.strictEqual(
      links.audiobookshelfAudiobookUrl,
      `https://books.example.com/library/${AUDIOBOOK_LIBRARY}/search?q=Steve%20Jobs`
    );
    assert.strictEqual(links.nobookendsAudiobookUrl, null);
  });

  it('asks nothing for formats that are not available', async () => {
    const links = await getAudiobookshelfLinks(
      settings,
      steveJobs,
      new Media({
        olId: 'OL16W',
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
        statusAudio: MediaStatus.PROCESSING,
      })
    );

    assert.strictEqual(links.audiobookshelfAudiobookUrl, null);
    assert.strictEqual(
      links.audiobookshelfUrl,
      `https://books.example.com/item/${EBOOK_ITEM}`
    );
    assert.deepStrictEqual(
      searchCalls.map((call) => call.libraryId),
      [EBOOK_LIBRARY]
    );
  });
});
