import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import GoogleBooks from '@server/api/googlebooks';
import type { GoogleBooksVolume } from '@server/api/googlebooks/interfaces';
import OpenLibrary from '@server/api/openlibrary';
import type { OlSearchResponse } from '@server/api/openlibrary/interfaces';
import { FollowType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import {
  getDateRange,
  getUpcomingBooks,
  selectBookReleases,
} from '@server/lib/bookReleases';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';

const TODAY = new Date('2026-10-10T12:00:00Z');
const AUTHOR = { olId: 'OL23919A', name: 'Brandon Sanderson' };

const volume = (
  id: string,
  title: string,
  publishedDate: string,
  extra: GoogleBooksVolume['volumeInfo'] = {}
): GoogleBooksVolume => ({
  id,
  volumeInfo: {
    title,
    publishedDate,
    authors: ['Brandon Sanderson'],
    language: 'en',
    imageLinks: {
      thumbnail: `http://books.google.com/books/content?id=${id}&img=1&edge=curl`,
    },
    ...extra,
  },
});

describe('getDateRange', () => {
  it('spans the whole month or year for partial dates', () => {
    assert.deepEqual(getDateRange('2026-02'), {
      first: '2026-02-01',
      last: '2026-02-28',
    });
    assert.deepEqual(getDateRange('2027'), {
      first: '2027-01-01',
      last: '2027-12-31',
    });
    assert.deepEqual(getDateRange('2026-11-04'), {
      first: '2026-11-04',
      last: '2026-11-04',
    });
    assert.equal(getDateRange('soon'), undefined);
  });
});

describe('selectBookReleases', () => {
  it('splits books to come from books out in the last 60 days', () => {
    const { comingSoon, newReleases } = selectBookReleases(
      [
        volume('v1', 'Wind and Truth Part Two', '2026-12-02'),
        volume('v2', 'Isles of the Emberdark', '2026-09-01'),
        volume('v3', 'Tress of the Emerald Sea', '2023-01-01'),
        volume('v4', 'Next Year Book', '2027'),
        volume('v5', 'This Month', '2026-10'),
      ],
      AUTHOR,
      { today: TODAY }
    );

    assert.deepEqual(
      comingSoon.map((release) => release.id),
      ['v1', 'v4']
    );
    assert.deepEqual(
      newReleases.map((release) => release.id),
      ['v2', 'v5']
    );
    assert.equal(comingSoon[0].authorId, AUTHOR.olId);
    assert.equal(
      comingSoon[0].posterUrl,
      'https://books.google.com/books/content?id=v1&img=1'
    );
  });

  it('skips reissues of books that came out before', () => {
    const { comingSoon } = selectBookReleases(
      [
        volume('new', 'Mistborn: The Final Empire', '2026-11-11'),
        volume('old', 'Mistborn', '2006-07-17'),
      ],
      AUTHOR,
      { today: TODAY }
    );

    assert.deepEqual(comingSoon, []);
  });

  it('lists a title once, with its earliest edition', () => {
    const { comingSoon } = selectBookReleases(
      [
        volume('paperback', 'The Sunlit Man', '2027-03-01'),
        volume('hardcover', 'The Sunlit Man', '2026-11-01'),
      ],
      AUTHOR,
      { today: TODAY }
    );

    assert.deepEqual(
      comingSoon.map((release) => [release.id, release.date]),
      [['hardcover', '2026-11-01']]
    );
  });

  it('skips other authors, other languages and vague dates', () => {
    const { comingSoon, newReleases } = selectBookReleases(
      [
        volume('other', 'Someone Else', '2026-12-01', {
          authors: ['Robert Jordan'],
        }),
        volume('german', 'Der Weg der Könige', '2026-12-01', {
          language: 'de',
        }),
        volume('year', 'Sometime This Year', '2026'),
      ],
      AUTHOR,
      { today: TODAY, language: 'en' }
    );

    assert.deepEqual([...comingSoon, ...newReleases], []);
  });
});

describe('getUpcomingBooks', () => {
  let newest: GoogleBooksVolume[] | undefined = [];
  let works: OlSearchResponse['docs'] = [];
  const googleCalls = mock.method(
    GoogleBooks.prototype,
    'getNewestByAuthor',
    async () => newest
  ).mock;
  mock.method(
    OpenLibrary.prototype,
    'searchBooks',
    async (): Promise<OlSearchResponse> => ({
      numFound: works.length,
      start: 0,
      docs: works,
    })
  );

  setupTestDb();

  const getDemo = () =>
    getRepository(User).findOneOrFail({
      where: { email: 'demo@seerr.dev' },
      relations: { settings: true },
    });

  beforeEach(async () => {
    cacheManager.getCache('googlebooks').flush();
    googleCalls.resetCalls();
    getSettings().main.googleBooksApiKey = 'key';
    newest = [volume('v1', 'Coming Book', '2026-12-02')];
    works = [];
  });

  it('shows nothing without followed authors', async () => {
    const result = await getUpcomingBooks(await getDemo(), TODAY);

    assert.equal(result.followedAuthors, 0);
    assert.deepEqual(result.comingSoon, []);
    assert.equal(googleCalls.callCount(), 0);
  });

  it('asks Google Books for each followed author and caches the page', async () => {
    const demo = await getDemo();
    await getRepository(Watchlist).save(
      new Watchlist({
        title: AUTHOR.name,
        mediaType: FollowType.AUTHOR,
        olId: AUTHOR.olId,
        requestedBy: demo,
      })
    );

    const first = await getUpcomingBooks(demo, TODAY);
    const second = await getUpcomingBooks(demo, TODAY);

    assert.equal(first.source, 'googlebooks');
    assert.equal(first.followedAuthors, 1);
    assert.deepEqual(
      first.comingSoon.map((release) => release.title),
      ['Coming Book']
    );
    assert.deepEqual(second, first);
    assert.equal(googleCalls.callCount(), 1);
  });

  it('does not keep a page Google Books could not fully answer', async () => {
    const demo = await getDemo();
    await getRepository(Watchlist).save(
      new Watchlist({
        title: AUTHOR.name,
        mediaType: FollowType.AUTHOR,
        olId: AUTHOR.olId,
        requestedBy: demo,
      })
    );
    newest = undefined;

    await getUpcomingBooks(demo, TODAY);
    await getUpcomingBooks(demo, TODAY);

    assert.equal(googleCalls.callCount(), 2);
  });

  it("falls back to this year's books from OpenLibrary without a key", async () => {
    getSettings().main.googleBooksApiKey = '';
    const demo = await getDemo();
    await getRepository(Watchlist).save(
      new Watchlist({
        title: AUTHOR.name,
        mediaType: FollowType.AUTHOR,
        olId: AUTHOR.olId,
        requestedBy: demo,
      })
    );
    works = [
      { key: '/works/OL1W', title: 'New Work', cover_i: 12 },
      { key: '/works/OL2W', title: 'New work' },
    ];

    const result = await getUpcomingBooks(demo, TODAY);

    assert.equal(result.source, 'openlibrary');
    assert.deepEqual(result.comingSoon, []);
    assert.deepEqual(result.newReleases, [
      {
        id: 'OL1W',
        olId: 'OL1W',
        title: 'New Work',
        authorName: AUTHOR.name,
        authorId: AUTHOR.olId,
        date: '2026',
        posterUrl: 'https://covers.openlibrary.org/b/id/12-M.jpg',
      },
    ]);
    assert.equal(googleCalls.callCount(), 0);
  });
});
