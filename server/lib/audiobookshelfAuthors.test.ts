import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import type {
  AudiobookshelfAuthor,
  AudiobookshelfAuthorMatchQuery,
} from '@server/api/audiobookshelf';
import AudiobookshelfAPI from '@server/api/audiobookshelf';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import {
  AuthorMatchUnavailableError,
  getAuthorMatchTarget,
  matchAllAudiobookshelfAuthors,
  queueAuthorMatchForItems,
  resetAuthorMatchState,
} from '@server/lib/audiobookshelfAuthors';
import { rememberAudiobookshelfItemIds } from '@server/lib/audiobookshelfItem';
import { getSettings } from '@server/lib/settings';
import { settleTestBackgroundTasks, setupTestDb } from '@server/test/db';
import { AxiosError, AxiosHeaders } from 'axios';

const ABS_URL = 'http://192.168.1.20:13378';
const AUDIO_LIBRARY = 'lib_audio';
const EBOOK_LIBRARY = 'lib_ebook';
const DAY_MS = 24 * 60 * 60 * 1000;

// The fake Audiobookshelf: its authors, which items they wrote, and what
// Audnexus answers when an author is matched
let authors: Record<string, AudiobookshelfAuthor>;
let itemAuthors: Record<string, string[]>;
let libraryAuthors: Record<string, string[]>;
// Authors Audnexus has a photo for, and ones whose match fails
let audnexusPhotos: Set<string>;
let failingMatches: Set<string>;
let calls: {
  method: string;
  id: string;
  apiKey?: string;
  query?: AudiobookshelfAuthorMatchQuery;
}[];

type ClientThis = {
  axios: { defaults: { headers: Record<string, unknown> } };
};

const apiKeyOf = (client: ClientThis) =>
  String(client.axios.defaults.headers.Authorization ?? '').replace(
    'Bearer ',
    ''
  ) || undefined;

mock.method(
  AudiobookshelfAPI.prototype,
  'getItemAuthors',
  async function (this: ClientThis, itemId: string) {
    calls.push({ method: 'item', id: itemId, apiKey: apiKeyOf(this) });
    return (itemAuthors[itemId] ?? []).map((id) => ({
      id,
      name: authors[id].name,
    }));
  }
);
mock.method(
  AudiobookshelfAPI.prototype,
  'getAuthor',
  async function (this: ClientThis, authorId: string) {
    calls.push({ method: 'author', id: authorId, apiKey: apiKeyOf(this) });
    return { ...authors[authorId] };
  }
);
mock.method(
  AudiobookshelfAPI.prototype,
  'getLibraryAuthors',
  async function (this: ClientThis, libraryId: string) {
    calls.push({ method: 'library', id: libraryId, apiKey: apiKeyOf(this) });
    return (libraryAuthors[libraryId] ?? []).map((id) => ({ ...authors[id] }));
  }
);
mock.method(
  AudiobookshelfAPI.prototype,
  'matchAuthor',
  async function (
    this: ClientThis,
    authorId: string,
    query: AudiobookshelfAuthorMatchQuery
  ) {
    calls.push({
      method: 'match',
      id: authorId,
      apiKey: apiKeyOf(this),
      query,
    });

    if (failingMatches.has(authorId)) {
      throw new AxiosError(
        'refused',
        'ERR_BAD_RESPONSE',
        undefined,
        undefined,
        {
          status: 403,
          statusText: '',
          headers: {},
          config: { headers: new AxiosHeaders() },
          data: 'Forbidden',
        }
      );
    }

    if (!audnexusPhotos.has(authorId)) {
      return { ...authors[authorId] };
    }

    authors[authorId] = {
      ...authors[authorId],
      imagePath: `/metadata/authors/${authorId}.jpg`,
    };

    return { ...authors[authorId] };
  }
);

setupTestDb();

const matches = () =>
  calls.filter(({ method }) => method === 'match').map(({ id }) => id);

const enableMatching = (extra = {}) => {
  getSettings().audiobookshelf = {
    url: `${ABS_URL}/`,
    libraryId: AUDIO_LIBRARY,
    ebookLibraryId: EBOOK_LIBRARY,
    apiKey: 'read-only-key',
    adminApiKey: 'admin-key',
    authorMatchRegion: 'us',
    ...extra,
  };
};

beforeEach(() => {
  authors = {
    au_photo: {
      id: 'au_photo',
      name: 'Andy Weir',
      imagePath: '/metadata/authors/au_photo.jpg',
    },
    au_bare: { id: 'au_bare', name: 'Martha Wells', imagePath: null },
    au_asin: {
      id: 'au_asin',
      name: 'Becky Chambers',
      asin: 'B00EXAMPLE',
      imagePath: null,
    },
    au_unknown: { id: 'au_unknown', name: 'Nobody Known', imagePath: null },
  };
  itemAuthors = {
    li_one: ['au_photo', 'au_bare'],
    li_two: ['au_bare', 'au_asin'],
    li_three: ['au_unknown'],
  };
  libraryAuthors = {
    [AUDIO_LIBRARY]: ['au_photo', 'au_bare', 'au_unknown'],
    [EBOOK_LIBRARY]: ['au_bare', 'au_asin'],
  };
  audnexusPhotos = new Set(['au_bare', 'au_asin']);
  failingMatches = new Set();
  calls = [];
  resetAuthorMatchState({ delayMs: 0 });
  enableMatching();
});

describe('getAuthorMatchTarget', () => {
  it('needs an address and the admin API key, not the read only key', () => {
    assert.deepStrictEqual(getAuthorMatchTarget(), {
      url: ABS_URL,
      apiKey: 'admin-key',
      region: 'us',
    });

    enableMatching({ adminApiKey: '' });
    assert.strictEqual(getAuthorMatchTarget(), undefined);

    enableMatching({ url: '' });
    assert.strictEqual(getAuthorMatchTarget(), undefined);
  });

  it('falls back to the us region', () => {
    enableMatching({ authorMatchRegion: 'mars' });
    assert.strictEqual(getAuthorMatchTarget()?.region, 'us');

    enableMatching({ authorMatchRegion: 'uk' });
    assert.strictEqual(getAuthorMatchTarget()?.region, 'uk');
  });
});

describe('queueAuthorMatchForItems', () => {
  it('only matches the authors without a photo, with the admin key', async () => {
    enableMatching({ authorMatchRegion: 'uk' });
    queueAuthorMatchForItems(['li_one']);
    await settleTestBackgroundTasks();

    assert.deepStrictEqual(matches(), ['au_bare']);
    assert.deepStrictEqual(
      calls.find(({ method }) => method === 'match')?.query,
      { q: 'Martha Wells', region: 'uk' }
    );
    assert.ok(calls.every(({ apiKey }) => apiKey === 'admin-key'));
  });

  it('matches by ASIN when Audiobookshelf has one', async () => {
    queueAuthorMatchForItems(['li_two']);
    await settleTestBackgroundTasks();

    assert.deepStrictEqual(
      calls.find(({ id, method }) => method === 'match' && id === 'au_asin')
        ?.query,
      { asin: 'B00EXAMPLE', region: 'us' }
    );
  });

  it('matches an author once, however many items and calls bring it up', async () => {
    queueAuthorMatchForItems(['li_one', 'li_two', 'li_one', null, undefined]);
    queueAuthorMatchForItems(['li_two']);
    await settleTestBackgroundTasks();

    assert.deepStrictEqual(matches().sort(), ['au_asin', 'au_bare']);
    assert.strictEqual(
      calls.filter(({ method }) => method === 'item').length,
      2
    );
  });

  it('asks again about an author without a photo at most weekly', async () => {
    const now = Date.now();
    const clock = mock.method(Date, 'now', () => now);

    try {
      queueAuthorMatchForItems(['li_three']);
      await settleTestBackgroundTasks();
      assert.deepStrictEqual(matches(), ['au_unknown']);

      // A new item by the same author a day later is not matched again
      itemAuthors.li_four = ['au_unknown'];
      clock.mock.mockImplementation(() => now + DAY_MS);
      queueAuthorMatchForItems(['li_four']);
      await settleTestBackgroundTasks();
      assert.deepStrictEqual(matches(), ['au_unknown']);

      // Past a week, the same item is looked at and the author asked again
      clock.mock.mockImplementation(() => now + 8 * DAY_MS);
      queueAuthorMatchForItems(['li_three']);
      await settleTestBackgroundTasks();
      assert.deepStrictEqual(matches(), ['au_unknown', 'au_unknown']);
    } finally {
      clock.mock.restore();
    }
  });

  it('tries an author whose match failed again sooner', async () => {
    const now = Date.now();
    const clock = mock.method(Date, 'now', () => now);
    failingMatches.add('au_unknown');
    itemAuthors.li_four = ['au_unknown'];

    try {
      queueAuthorMatchForItems(['li_three']);
      await settleTestBackgroundTasks();

      clock.mock.mockImplementation(() => now + 2 * 60 * 60 * 1000);
      queueAuthorMatchForItems(['li_four']);
      await settleTestBackgroundTasks();

      assert.deepStrictEqual(matches(), ['au_unknown', 'au_unknown']);
    } finally {
      clock.mock.restore();
    }
  });

  it('does nothing without an admin API key', async () => {
    enableMatching({ adminApiKey: '' });
    queueAuthorMatchForItems(['li_one', 'li_two']);
    await settleTestBackgroundTasks();

    assert.deepStrictEqual(calls, []);
  });

  it('runs when AllSeerr learns the items of a book', async () => {
    const media = await getRepository(Media).save(
      new Media({
        olId: 'OL1234567W',
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
        statusAudio: MediaStatus.AVAILABLE,
      })
    );

    await rememberAudiobookshelfItemIds(media, {
      audiobook: 'li_two',
      ebook: null,
    });
    await settleTestBackgroundTasks();
    assert.deepStrictEqual(matches().sort(), ['au_asin', 'au_bare']);

    // Items it already knew do not start another round
    calls = [];
    await rememberAudiobookshelfItemIds(media, { audiobook: 'li_two' });
    await settleTestBackgroundTasks();
    assert.deepStrictEqual(calls, []);
  });
});

describe('matchAllAudiobookshelfAuthors', () => {
  it('matches every author without a photo in both libraries', async () => {
    failingMatches.add('au_asin');

    const result = await matchAllAudiobookshelfAuthors();

    assert.deepStrictEqual(result, {
      total: 4,
      matched: 1,
      noPhoto: 1,
      failed: 1,
      done: true,
    });
    assert.deepStrictEqual(matches().sort(), [
      'au_asin',
      'au_bare',
      'au_unknown',
    ]);
    assert.deepStrictEqual(
      calls.filter(({ method }) => method === 'library').map(({ id }) => id),
      [AUDIO_LIBRARY, EBOOK_LIBRARY]
    );
  });

  it('also matches authors checked recently', async () => {
    queueAuthorMatchForItems(['li_three']);
    await settleTestBackgroundTasks();

    const result = await matchAllAudiobookshelfAuthors();

    assert.strictEqual(result.noPhoto, 1);
    assert.deepStrictEqual(
      matches().filter((id) => id === 'au_unknown'),
      ['au_unknown', 'au_unknown']
    );
  });

  it('answers with the counts so far while a long run goes on', async () => {
    resetAuthorMatchState({ delayMs: 30, waitMs: 5 });

    const early = await matchAllAudiobookshelfAuthors();
    assert.strictEqual(early.done, false);

    // Asking again joins the run under way instead of starting another
    const again = await matchAllAudiobookshelfAuthors();
    assert.strictEqual(again.done, false);

    await settleTestBackgroundTasks();
    assert.deepStrictEqual(matches().sort(), [
      'au_asin',
      'au_bare',
      'au_unknown',
    ]);
  });

  it('refuses without an admin API key or a library', async () => {
    enableMatching({ adminApiKey: '' });
    await assert.rejects(
      matchAllAudiobookshelfAuthors(),
      AuthorMatchUnavailableError
    );

    enableMatching({ libraryId: '', ebookLibraryId: '' });
    await assert.rejects(
      matchAllAudiobookshelfAuthors(),
      AuthorMatchUnavailableError
    );
    assert.deepStrictEqual(calls, []);
  });
});
