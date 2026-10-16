import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DownloadItem } from '@server/interfaces/api/downloadInterfaces';
import {
  episodeLabel,
  filterDownloads,
  splitDuration,
} from './downloadFilters';

const item = (overrides: Partial<DownloadItem>): DownloadItem => ({
  id: 'radarr:0:1',
  service: 'radarr',
  serverId: 0,
  serverName: 'Radarr',
  is4k: false,
  mediaType: 'movie',
  title: 'Sample',
  releaseTitle: 'Sample.2024',
  protocol: 'usenet',
  size: 100,
  sizeLeft: 50,
  progress: 0.5,
  status: 'downloading',
  statusMessages: [],
  needsAttention: false,
  canSearch: true,
  ...overrides,
});

describe('filterDownloads', () => {
  const items = [
    item({ id: 'a' }),
    item({ id: 'b', mediaType: 'audiobook', status: 'stalled' }),
    item({ id: 'c', mediaType: 'ebook', status: 'paused' }),
    item({ id: 'd', mediaType: 'tv', status: 'importPending' }),
  ];
  const ids = (list: DownloadItem[]) => list.map((i) => i.id);

  it('puts ebooks and audiobooks under Books', () => {
    assert.deepStrictEqual(ids(filterDownloads(items, 'book', 'all')), [
      'b',
      'c',
    ]);
  });

  it('groups the statuses', () => {
    assert.deepStrictEqual(ids(filterDownloads(items, 'all', 'attention')), [
      'b',
    ]);
    assert.deepStrictEqual(ids(filterDownloads(items, 'all', 'queued')), ['c']);
    assert.deepStrictEqual(ids(filterDownloads(items, 'all', 'importing')), [
      'd',
    ]);
    assert.deepStrictEqual(ids(filterDownloads(items, 'book', 'queued')), [
      'c',
    ]);
  });
});

describe('splitDuration', () => {
  it('keeps the two largest units and drops seconds past a minute', () => {
    assert.deepStrictEqual(splitDuration(45), [{ unit: 'second', value: 45 }]);
    assert.deepStrictEqual(splitDuration(125), [{ unit: 'minute', value: 2 }]);
    assert.deepStrictEqual(splitDuration(2 * 3600 + 5 * 60), [
      { unit: 'hour', value: 2 },
      { unit: 'minute', value: 5 },
    ]);
    assert.deepStrictEqual(splitDuration(86_400 + 30), [
      { unit: 'day', value: 1 },
    ]);
    assert.deepStrictEqual(splitDuration(0), [{ unit: 'second', value: 0 }]);
  });
});

describe('episodeLabel', () => {
  it('words single episodes, runs and scattered episodes', () => {
    assert.strictEqual(episodeLabel(1, [2]), 'S01E02');
    assert.strictEqual(episodeLabel(2, [1, 2, 3]), 'S02E01-E03');
    assert.strictEqual(episodeLabel(2, [1, 4]), 'S02 E01, E04');
    assert.strictEqual(episodeLabel(3, []), 'S03');
    assert.strictEqual(episodeLabel(undefined, [1]), undefined);
  });
});
