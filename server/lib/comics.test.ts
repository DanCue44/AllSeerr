import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  TalearrComicRootFolder,
  TalearrComicSeriesSummary,
} from '@server/api/servarr/talearrComics';
import TalearrComicsAPI, {
  TalearrComicsError,
  parseComicLookupResponse,
} from '@server/api/servarr/talearrComics';
import { MediaStatus } from '@server/constants/media';
import {
  comicIdOf,
  comicPlainText,
  dropHardcoverDuplicates,
  findLibrarySeries,
  getLibraryStatus,
  isComicId,
  parseComicId,
  pickComicRootFolder,
} from '@server/lib/comics';
import { canRequestComic } from '@server/lib/userAccess/ageLimits';

const summary = (
  fields: Partial<TalearrComicSeriesSummary> & {
    aniListId?: number;
    hardcoverSeriesId?: number;
  } = {}
): TalearrComicSeriesSummary => ({
  series: {
    id: 12,
    kind: 'manga',
    title: 'Frieren',
    aniListId: fields.aniListId ?? null,
    hardcoverSeriesId: fields.hardcoverSeriesId ?? null,
    monitored: true,
  },
  volumeCount: 13,
  downloadedCount: 0,
  missingCount: 13,
  downloadingCount: 0,
  ...fields,
});

const folder = (
  fields: Partial<TalearrComicRootFolder>
): TalearrComicRootFolder => ({
  id: 1,
  path: '/manga',
  kind: 'manga',
  isKids: false,
  ...fields,
});

describe('comic ids', () => {
  it('keys series AniList knows on AniList, the rest on Hardcover', () => {
    assert.strictEqual(
      comicIdOf({ aniListId: 118586, hardcoverSeriesId: 4521 }),
      'al-118586'
    );
    assert.strictEqual(comicIdOf({ hardcoverSeriesId: 4521 }), 'hc-4521');
    assert.strictEqual(comicIdOf({}), undefined);
  });

  it('reads the ids back and refuses anything else', () => {
    assert.deepStrictEqual(parseComicId('al-118586'), { aniListId: 118586 });
    assert.deepStrictEqual(parseComicId('hc-4521'), {
      hardcoverSeriesId: 4521,
    });
    assert.strictEqual(parseComicId('OL45804W'), undefined);
    assert.strictEqual(isComicId('al-0'), false);
    assert.strictEqual(isComicId('hc-12; drop'), false);
    assert.strictEqual(isComicId('hc-12'), true);
  });

  it('finds a series in the library on the id it was added with', () => {
    const saga = summary({ hardcoverSeriesId: 4521 });
    saga.series.id = 13;
    const library = [summary({ aniListId: 118586 }), saga];

    assert.strictEqual(findLibrarySeries(library, 'al-118586')?.series.id, 12);
    assert.strictEqual(findLibrarySeries(library, 'hc-4521')?.series.id, 13);
    assert.strictEqual(findLibrarySeries(library, 'al-1'), undefined);
  });
});

describe('getLibraryStatus', () => {
  it('follows the volumes Talearr has', () => {
    assert.strictEqual(
      getLibraryStatus(summary({ downloadedCount: 0 })),
      MediaStatus.PROCESSING
    );
    assert.strictEqual(
      getLibraryStatus(summary({ downloadedCount: 4 })),
      MediaStatus.PARTIALLY_AVAILABLE
    );
    assert.strictEqual(
      getLibraryStatus(summary({ downloadedCount: 13 })),
      MediaStatus.AVAILABLE
    );
    // A series without a volume list is never complete
    assert.strictEqual(
      getLibraryStatus(summary({ volumeCount: 0, downloadedCount: 0 })),
      MediaStatus.PROCESSING
    );
  });
});

describe('pickComicRootFolder', () => {
  const folders = [
    folder({ id: 1, path: '/comics', kind: 'any' }),
    folder({ id: 2, path: '/manga', kind: 'manga' }),
    folder({ id: 3, path: '/kids-manga', kind: 'manga', isKids: true }),
  ];

  it('prefers a folder of the series kind over one for any kind', () => {
    assert.strictEqual(pickComicRootFolder(folders, 'manga')?.id, 2);
    assert.strictEqual(pickComicRootFolder(folders, 'comic')?.id, 1);
  });

  it('files series asked for by a person with an age limit in the kids library', () => {
    assert.strictEqual(
      pickComicRootFolder(folders, 'manga', { preferKids: true })?.id,
      3
    );
    // No kids folder for comics, so the main one
    assert.strictEqual(
      pickComicRootFolder(folders, 'comic', { preferKids: true })?.id,
      1
    );
  });

  it('answers nothing when no folder takes the kind', () => {
    assert.strictEqual(
      pickComicRootFolder([folder({ kind: 'manga' })], 'comic'),
      undefined
    );
  });
});

describe('canRequestComic', () => {
  it('leaves people without an age limit alone', () => {
    assert.strictEqual(
      canRequestComic('none', { ageRating: 'Adults Only 18+', isAdult: true }),
      true
    );
    assert.strictEqual(canRequestComic(null, { isAdult: true }), true);
  });

  it('refuses adult series and series rated above the limit', () => {
    assert.strictEqual(canRequestComic('teen', { isAdult: true }), false);
    assert.strictEqual(
      canRequestComic('teen', { ageRating: 'Mature 17+' }),
      false
    );
    assert.strictEqual(canRequestComic('teen', { ageRating: 'Teen' }), true);
    assert.strictEqual(canRequestComic('tween', { ageRating: 'Teen' }), false);
    assert.strictEqual(
      canRequestComic('kids', { ageRating: 'Everyone 10+' }),
      false
    );
    assert.strictEqual(
      canRequestComic('kids', { ageRating: 'Everyone' }),
      true
    );
  });

  it('lets unrated series through, to wait for approval', () => {
    assert.strictEqual(canRequestComic('kids', { ageRating: 'Unknown' }), true);
    assert.strictEqual(canRequestComic('kids', {}), true);
  });
});

describe('parseComicLookupResponse', () => {
  it('keeps the series Talearr could add and its notices', () => {
    const parsed = parseComicLookupResponse({
      results: [
        {
          aniListId: 118586,
          hardcoverSeriesId: 4521,
          kind: 'manga',
          title: 'Frieren: Beyond Journey’s End',
          alternateTitles: ['Sousou no Frieren', 7],
          year: 2020,
          volumes: 13,
          ageRating: 'Teen',
          isAdult: false,
        },
        // No id to add it by
        { kind: 'comic', title: 'Saga' },
        { hardcoverSeriesId: 77, kind: 'weird', title: 'Saga' },
        null,
      ],
      notices: ['AniList could not be searched', 3],
    });

    assert.strictEqual(parsed.results.length, 2);
    assert.deepStrictEqual(parsed.results[0].alternateTitles, [
      'Sousou no Frieren',
    ]);
    // An unknown kind is read as manga, as Talearr itself does
    assert.strictEqual(parsed.results[1].kind, 'manga');
    assert.strictEqual(parsed.results[1].isAdult, false);
    assert.deepStrictEqual(parsed.notices, ['AniList could not be searched']);
  });

  it('reads an empty answer', () => {
    assert.deepStrictEqual(parseComicLookupResponse(undefined), {
      results: [],
      notices: [],
    });
  });
});

describe('comicPlainText', () => {
  it('drops AniList markup', () => {
    assert.strictEqual(
      comicPlainText('An <i>elf</i> mage.<br><br>(Source: Kodansha)'),
      'An elf mage.\n\n(Source: Kodansha)'
    );
  });
});

describe('TalearrComicsAPI', () => {
  const stub = (
    answers: Record<string, { status: number; data?: unknown }>,
    calls: { method: string; url: string; data?: unknown }[] = []
  ) => {
    const api = new TalearrComicsAPI({
      url: 'http://talearr:8789/api/v1',
      apiKey: 'key',
    });
    const http = (api as unknown as { axios: Record<string, unknown> }).axios;
    const answer = (method: string) => async (url: string, data?: unknown) => {
      calls.push({ method, url, data });
      const found = answers[`${method} ${url}`];
      if (!found) {
        throw new Error(`Unexpected ${method} ${url}`);
      }
      return found;
    };
    http.get = answer('get');
    http.post = answer('post');
    http.put = answer('put');
    return api;
  };

  it('reports a server without comics routes as unavailable', async () => {
    const api = stub({ 'get /talearr/comics/status': { status: 404 } });

    const status = await api.getStatus();

    assert.strictEqual(status.available, false);
    assert.ok(status.reason);
  });

  it('reads the status Talearr reports', async () => {
    const api = stub({
      'get /talearr/comics/status': {
        status: 200,
        data: { available: false, reason: 'database is locked' },
      },
    });

    assert.deepStrictEqual(await api.getStatus(), {
      available: false,
      reason: 'database is locked',
      ageRatings: [],
    });
  });

  it('monitors the series and every volume it has not got', async () => {
    const calls: { method: string; url: string; data?: unknown }[] = [];
    const api = stub(
      {
        'put /talearr/comics/series/9': { status: 200 },
        'get /talearr/comics/series/9': {
          status: 200,
          data: {
            volumes: [
              { id: 1, monitored: true, state: 'downloaded' },
              { id: 2, monitored: false, state: 'unmonitored' },
              { id: 3, monitored: false, state: 'unreleased' },
              { id: 4, monitored: false, state: 'downloaded' },
              { id: 5, monitored: true, state: 'missing' },
            ],
          },
        },
        'put /talearr/comics/volumes/monitor': { status: 200 },
      },
      calls
    );

    assert.strictEqual(await api.monitorMissingVolumes(9), 2);
    assert.deepStrictEqual(calls[0].data, {
      monitored: true,
      monitorNewVolumes: true,
    });
    assert.deepStrictEqual(calls[2].data, {
      volumeIds: [2, 3],
      monitored: true,
    });
  });

  it("passes Talearr's refusal of a series on", async () => {
    const api = stub({
      'post /talearr/comics/series': {
        status: 400,
        data: {
          message: 'Frieren is rated Teen, above this kids library limit',
          needsAgeRating: true,
        },
      },
    });

    await assert.rejects(
      api.addSeries({
        aniListId: 118586,
        kind: 'manga',
        rootFolderId: 3,
        monitor: 'all',
      }),
      (error: unknown) =>
        error instanceof TalearrComicsError &&
        error.needsAgeRating &&
        error.message.startsWith('Frieren is rated Teen')
    );
  });
});

describe('dropHardcoverDuplicates', () => {
  const base = { alternateTitles: [], isAdult: false };

  it('keeps one series when AniList and Hardcover both find it', () => {
    const results = dropHardcoverDuplicates([
      {
        ...base,
        aniListId: 98263,
        kind: 'manga',
        title: 'Witch Hat Atelier',
        authors: 'Kamome Shirahama',
        coverUrl: 'https://s4.anilist.co/witch.jpg',
      },
      {
        ...base,
        hardcoverSeriesId: 62928,
        kind: 'comic',
        title: 'Witch Hat Atelier',
        authors: 'Kamome Shirahama',
      },
      // Same title, someone else: another series
      {
        ...base,
        hardcoverSeriesId: 5,
        kind: 'comic',
        title: 'Witch Hat Atelier',
        authors: 'Somebody Different',
      },
      { ...base, hardcoverSeriesId: 6, kind: 'comic', title: 'Saga' },
    ]);

    assert.deepStrictEqual(
      results.map((result) => result.aniListId ?? result.hardcoverSeriesId),
      [98263, 5, 6]
    );
    assert.strictEqual(results[0].hardcoverSeriesId, 62928);
    assert.strictEqual(results[0].coverUrl, 'https://s4.anilist.co/witch.jpg');
  });
});
