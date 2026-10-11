import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarItem } from '@server/interfaces/api/calendarInterfaces';
import {
  getCalendarItemHref,
  getCalendarItemMediaType,
  groupByDate,
  selectUpcomingItems,
} from './upcoming';

const item = (overrides: Partial<CalendarItem>): CalendarItem => ({
  id: 'movie-1',
  type: 'movie',
  date: '2026-10-10',
  releaseType: 'digital',
  title: 'A Movie',
  hasFile: false,
  requestedByMe: false,
  ...overrides,
});

const items: CalendarItem[] = [
  item({ id: 'ep-3', type: 'episode', tmdbId: 7, date: '2026-10-12' }),
  item({ id: 'movie-2', tmdbId: 2, date: '2026-10-11' }),
  item({ id: 'ep-1', type: 'episode', tmdbId: 7, date: '2026-10-10' }),
  item({ id: 'ep-2', type: 'episode', tmdbId: 7, date: '2026-10-10' }),
  item({ id: 'album-abc', type: 'album', date: '2026-10-09' }),
];

describe('selectUpcomingItems', () => {
  it('sorts by date', () => {
    assert.deepEqual(
      selectUpcomingItems(items).map((entry) => entry.id),
      ['album-abc', 'ep-1', 'ep-2', 'movie-2', 'ep-3']
    );
  });

  it('narrows to a media type and a first day', () => {
    assert.deepEqual(
      selectUpcomingItems(items, { mediaType: 'tv' }).map((entry) => entry.id),
      ['ep-1', 'ep-2', 'ep-3']
    );
    assert.deepEqual(
      selectUpcomingItems(items, { from: '2026-10-11' }).map(
        (entry) => entry.id
      ),
      ['movie-2', 'ep-3']
    );
  });

  it('keeps the next episode of each series for a row', () => {
    assert.deepEqual(
      selectUpcomingItems(items, { onePerTitle: true }).map(
        (entry) => entry.id
      ),
      ['album-abc', 'ep-1', 'movie-2']
    );
  });

  it('limits the number of entries', () => {
    assert.equal(selectUpcomingItems(items, { limit: 2 }).length, 2);
  });
});

describe('getCalendarItemHref', () => {
  it('links movies, series and albums', () => {
    assert.equal(
      getCalendarItemHref({ id: 'movie-1', type: 'movie', tmdbId: 5 }),
      '/movie/5'
    );
    assert.equal(
      getCalendarItemHref({ id: 'ep-1', type: 'episode', tmdbId: 9 }),
      '/tv/9'
    );
    assert.equal(
      getCalendarItemHref({ id: 'album-0f1e', type: 'album' }),
      '/music/0f1e'
    );
  });

  it('has no link without an id to go on', () => {
    assert.equal(
      getCalendarItemHref({ id: 'movie-1', type: 'movie' }),
      undefined
    );
    assert.equal(getCalendarItemHref({ id: 'odd', type: 'album' }), undefined);
  });
});

describe('getCalendarItemMediaType', () => {
  it('maps calendar entries to media types', () => {
    assert.equal(getCalendarItemMediaType({ type: 'movie' }), 'movie');
    assert.equal(getCalendarItemMediaType({ type: 'episode' }), 'tv');
    assert.equal(getCalendarItemMediaType({ type: 'album' }), 'music');
  });
});

describe('groupByDate', () => {
  it('groups consecutive entries of a day', () => {
    const groups = groupByDate(selectUpcomingItems(items));
    assert.deepEqual(
      groups.map((group) => [group.date, group.items.length]),
      [
        ['2026-10-09', 1],
        ['2026-10-10', 2],
        ['2026-10-11', 1],
        ['2026-10-12', 1],
      ]
    );
  });
});
