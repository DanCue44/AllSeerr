import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { AxiosInstance } from 'axios';

import SonarrAPI from '@server/api/servarr/sonarr';

function buildSonarr(): SonarrAPI {
  return new SonarrAPI({ url: 'http://localhost:8989/api/v3', apiKey: 'test' });
}

function getAxios(sonarr: SonarrAPI): AxiosInstance {
  return (sonarr as unknown as { axios: AxiosInstance }).axios;
}

describe('SonarrAPI removeSeries', () => {
  afterEach(() => mock.restoreAll());

  it('removes the series when it exists in the library', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
    }));
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await sonarr.removeSeries(1234);

    assert.strictEqual(del.mock.callCount(), 1);
    assert.strictEqual(del.mock.calls[0].arguments[0], '/series/9');
  });

  it('does nothing when the series is not in the library', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => ({
      data: [{ id: 0, title: 'Breaking Bad' }],
    }));
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await assert.doesNotReject(() => sonarr.removeSeries(1234));
    assert.strictEqual(del.mock.callCount(), 0);
  });

  it('rejects when the tvdbId is unknown to the lookup', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => ({ data: [] }));
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await assert.rejects(() => sonarr.removeSeries(1234), /Series not found/);
    assert.strictEqual(del.mock.callCount(), 0);
  });

  it('ignores a 404 when the series was already removed in Sonarr', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
    }));
    mock.method(getAxios(sonarr), 'delete', async () => {
      throw { response: { status: 404 } };
    });

    await assert.doesNotReject(() => sonarr.removeSeries(1234));
  });

  it('rethrows errors other than 404', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
    }));
    mock.method(getAxios(sonarr), 'delete', async () => {
      throw { response: { status: 500 } };
    });

    await assert.rejects(() => sonarr.removeSeries(1234));
  });

  it('rethrows a 404 from the lookup instead of treating it as removed', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => {
      throw { response: { status: 404 } };
    });
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await assert.rejects(
      () => sonarr.removeSeries(1234),
      (e: unknown) =>
        (e as { response?: { status?: number } }).response?.status === 404
    );
    assert.strictEqual(del.mock.callCount(), 0);
  });
});

describe('SonarrAPI getSeriesByTvdbId', () => {
  afterEach(() => mock.restoreAll());

  it('rethrows a 401 from the lookup with the status intact', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => {
      throw { response: { status: 401 } };
    });

    await assert.rejects(
      () => sonarr.getSeriesByTvdbId(1234),
      (e: unknown) =>
        (e as { response?: { status?: number } }).response?.status === 401
    );
  });

  it('throws "Series not found" when the lookup returns no results', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => ({ data: [] }));

    await assert.rejects(() => sonarr.getSeriesByTvdbId(1234), {
      message: 'Series not found',
    });
  });
});

describe('SonarrAPI addSeries with requested episodes', () => {
  afterEach(() => mock.restoreAll());

  const episodes = [
    { id: 102, seasonNumber: 2, episodeNumber: 2, monitored: false },
    { id: 103, seasonNumber: 2, episodeNumber: 3, monitored: false },
    { id: 105, seasonNumber: 2, episodeNumber: 5, monitored: false },
  ];

  const options = {
    tvdbid: 1234,
    title: 'Test Series',
    profileId: 1,
    seasons: [],
    episodes: [{ seasonNumber: 2, episodeNumbers: [3, 5] }],
    seasonFolder: true,
    rootFolderPath: '/tv',
    seriesType: 'standard' as const,
    monitored: true,
    searchNow: true,
  };

  it('monitors and searches only the requested episodes of an existing series', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
      tags: [],
      seasons: [{ seasonNumber: 2, monitored: false }],
    }));
    mock.method(SonarrAPI.prototype, 'getEpisodes', async () => episodes);
    const put = mock.method(getAxios(sonarr), 'put', async (url: string) => ({
      data: url === '/series' ? { id: 9, title: 'Test Series' } : {},
    }));
    const post = mock.method(getAxios(sonarr), 'post', async () => ({}));

    await sonarr.addSeries(options);

    const seriesUpdate = put.mock.calls.find(
      (call) => call.arguments[0] === '/series'
    );
    assert.deepStrictEqual(
      (seriesUpdate?.arguments[1] as { seasons: unknown }).seasons,
      [{ seasonNumber: 2, monitored: false }]
    );
    const monitor = put.mock.calls.find(
      (call) => call.arguments[0] === '/episode/monitor'
    );
    assert.deepStrictEqual(monitor?.arguments[1], {
      episodeIds: [103, 105],
      monitored: true,
    });
    assert.deepStrictEqual(
      post.mock.calls.map((call) => call.arguments[1]),
      [{ name: 'EpisodeSearch', episodeIds: [103, 105] }]
    );
  });

  it('waits for the episodes of a newly added series before monitoring them', async (t) => {
    const priorDelay = SonarrAPI.episodeLookupDelay;
    SonarrAPI.episodeLookupDelay = 0;
    t.after(() => {
      SonarrAPI.episodeLookupDelay = priorDelay;
    });

    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 0,
      title: 'Test Series',
      seasons: [
        { seasonNumber: 1, monitored: true },
        { seasonNumber: 2, monitored: true },
      ],
    }));
    let lookups = 0;
    mock.method(SonarrAPI.prototype, 'getEpisodes', async () =>
      lookups++ < 2 ? [] : episodes
    );
    const put = mock.method(getAxios(sonarr), 'put', async () => ({
      data: {},
    }));
    const post = mock.method(getAxios(sonarr), 'post', async (url: string) => ({
      data: url === '/series' ? { id: 9, title: 'Test Series' } : {},
    }));

    await sonarr.addSeries(options);

    const created = post.mock.calls[0].arguments[1] as {
      seasons: { seasonNumber: number; monitored: boolean }[];
      addOptions: { searchForMissingEpisodes: boolean };
    };
    assert.deepStrictEqual(
      created.seasons.map((season) => season.monitored),
      [false, false]
    );
    assert.strictEqual(created.addOptions.searchForMissingEpisodes, false);
    assert.strictEqual(lookups, 3);
    assert.deepStrictEqual(put.mock.calls[0].arguments, [
      '/episode/monitor',
      { episodeIds: [103, 105], monitored: true },
    ]);
    assert.deepStrictEqual(post.mock.calls[1].arguments[1], {
      name: 'EpisodeSearch',
      episodeIds: [103, 105],
    });
  });

  it('fails when none of the requested episodes exist in Sonarr', async (t) => {
    const priorAttempts = SonarrAPI.episodeLookupAttempts;
    SonarrAPI.episodeLookupAttempts = 1;
    t.after(() => {
      SonarrAPI.episodeLookupAttempts = priorAttempts;
    });

    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
      tags: [],
      seasons: [],
    }));
    mock.method(SonarrAPI.prototype, 'getEpisodes', async () => []);
    mock.method(getAxios(sonarr), 'put', async () => ({
      data: { id: 9, title: 'Test Series' },
    }));

    await assert.rejects(() => sonarr.addSeries(options), {
      message: 'Failed to add series',
    });
  });
});

describe('SonarrAPI addSeries for future episodes only', () => {
  afterEach(() => mock.restoreAll());

  const options = {
    tvdbid: 1234,
    title: 'Test Series',
    profileId: 1,
    seasons: [3],
    monitor: 'future' as const,
    seasonFolder: true,
    rootFolderPath: '/tv',
    seriesType: 'standard' as const,
    monitored: true,
    monitorNewItems: 'none' as const,
    searchNow: true,
  };

  it('adds a new series with future monitoring and no search', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 0,
      title: 'Test Series',
      seasons: [{ seasonNumber: 3, monitored: true }],
    }));
    const post = mock.method(getAxios(sonarr), 'post', async () => ({
      data: { id: 9, title: 'Test Series' },
    }));

    await sonarr.addSeries(options);

    assert.strictEqual(post.mock.callCount(), 1);
    const created = post.mock.calls[0].arguments[1] as {
      monitorNewItems: string;
      addOptions: Record<string, unknown>;
    };
    assert.strictEqual(created.monitorNewItems, 'all');
    assert.deepStrictEqual(created.addOptions, {
      monitor: 'future',
      ignoreEpisodesWithFiles: true,
      searchForMissingEpisodes: false,
    });
  });

  it('monitors only the unaired episodes of an existing series', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
      tags: [],
      monitorNewItems: 'none',
      seasons: [{ seasonNumber: 3, monitored: false }],
    }));
    mock.method(SonarrAPI.prototype, 'getEpisodes', async () => [
      {
        id: 301,
        seasonNumber: 3,
        episodeNumber: 1,
        monitored: false,
        airDateUtc: '2020-01-01T00:00:00Z',
      },
      {
        id: 302,
        seasonNumber: 3,
        episodeNumber: 2,
        monitored: false,
        airDateUtc: '2099-01-01T00:00:00Z',
      },
      { id: 303, seasonNumber: 3, episodeNumber: 3, monitored: false },
    ]);
    const put = mock.method(getAxios(sonarr), 'put', async (url: string) => ({
      data: url === '/series' ? { id: 9, title: 'Test Series' } : {},
    }));
    const post = mock.method(getAxios(sonarr), 'post', async () => ({}));

    await sonarr.addSeries(options);

    const seriesUpdate = put.mock.calls[0].arguments[1] as {
      monitorNewItems: string;
      seasons: { monitored: boolean }[];
    };
    assert.strictEqual(seriesUpdate.monitorNewItems, 'all');
    assert.deepStrictEqual(seriesUpdate.seasons, [
      { seasonNumber: 3, monitored: false },
    ]);
    assert.deepStrictEqual(put.mock.calls[1].arguments, [
      '/episode/monitor',
      { episodeIds: [302, 303], monitored: true },
    ]);
    assert.strictEqual(post.mock.callCount(), 0);
  });
});

describe('SonarrAPI current season helpers', () => {
  afterEach(() => mock.restoreAll());

  const options = {
    tvdbid: 1234,
    title: 'Test Series',
    profileId: 1,
    seasons: [5],
    seasonFolder: true,
    rootFolderPath: '/tv',
    seriesType: 'standard' as const,
    monitored: true,
    monitorNewItems: 'none' as const,
    monitorNewSeasons: true,
    searchNow: true,
  };

  it('adds a new series monitoring only the current season and new seasons', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 0,
      title: 'Test Series',
      seasons: [4, 5, 6].map((seasonNumber) => ({
        seasonNumber,
        monitored: true,
      })),
    }));
    const post = mock.method(getAxios(sonarr), 'post', async () => ({
      data: { id: 9 },
    }));

    await sonarr.addSeries(options);

    const body = post.mock.calls[0].arguments[1] as {
      seasons: { seasonNumber: number; monitored: boolean }[];
      monitorNewItems: string;
      addOptions: { searchForMissingEpisodes: boolean };
    };
    assert.deepStrictEqual(
      body.seasons.map((s) => [s.seasonNumber, s.monitored]),
      [
        [4, false],
        [5, true],
        [6, false],
      ]
    );
    assert.strictEqual(body.monitorNewItems, 'all');
    assert.strictEqual(body.addOptions.searchForMissingEpisodes, true);
  });

  it('turns on new season monitoring for a series Sonarr already has', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
      tags: [],
      monitorNewItems: 'none',
      seasons: [{ seasonNumber: 5, monitored: false }],
    }));
    mock.method(SonarrAPI.prototype, 'getEpisodes', async () => []);
    const put = mock.method(getAxios(sonarr), 'put', async (url: string) => ({
      data: url === '/series' ? { id: 9, title: 'Test Series' } : {},
    }));
    mock.method(getAxios(sonarr), 'post', async () => ({}));

    await sonarr.addSeries(options);

    const seriesUpdate = put.mock.calls.find(
      (call) => call.arguments[0] === '/series'
    )?.arguments[1] as {
      monitorNewItems: string;
      seasons: { seasonNumber: number; monitored: boolean }[];
    };
    assert.strictEqual(seriesUpdate.monitorNewItems, 'all');
    assert.deepStrictEqual(seriesUpdate.seasons, [
      { seasonNumber: 5, monitored: true },
    ]);
  });

  it('leaves new season monitoring alone for regular requests', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
      tags: [],
      monitorNewItems: 'none',
      seasons: [{ seasonNumber: 5, monitored: false }],
    }));
    mock.method(SonarrAPI.prototype, 'getEpisodes', async () => []);
    const put = mock.method(getAxios(sonarr), 'put', async (url: string) => ({
      data: url === '/series' ? { id: 9, title: 'Test Series' } : {},
    }));
    mock.method(getAxios(sonarr), 'post', async () => ({}));

    await sonarr.addSeries({ ...options, monitorNewSeasons: undefined });

    const seriesUpdate = put.mock.calls.find(
      (call) => call.arguments[0] === '/series'
    )?.arguments[1] as { monitorNewItems: string };
    assert.strictEqual(seriesUpdate.monitorNewItems, 'none');
  });

  it('deletes episode files in bulk', async () => {
    const sonarr = buildSonarr();
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await sonarr.deleteEpisodeFiles([11, 12]);

    assert.strictEqual(del.mock.callCount(), 1);
    assert.strictEqual(del.mock.calls[0].arguments[0], '/episodefile/bulk');
    assert.deepStrictEqual(del.mock.calls[0].arguments[1], {
      data: { episodeFileIds: [11, 12] },
    });
  });

  it('does not call Sonarr without episode files to delete', async () => {
    const sonarr = buildSonarr();
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await sonarr.deleteEpisodeFiles([]);

    assert.strictEqual(del.mock.callCount(), 0);
  });

  it('rejects when Sonarr fails to delete episode files', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'delete', async () => {
      throw new Error('boom');
    });

    await assert.rejects(() => sonarr.deleteEpisodeFiles([11]), {
      message: 'Failed to delete episode files',
    });
  });

  it('unmonitors episodes', async () => {
    const sonarr = buildSonarr();
    const put = mock.method(getAxios(sonarr), 'put', async () => ({}));

    await sonarr.unmonitorEpisodes([101, 102]);

    assert.deepStrictEqual(put.mock.calls[0].arguments, [
      '/episode/monitor',
      { episodeIds: [101, 102], monitored: false },
    ]);
  });

  it('updates season monitoring and leaves specials alone', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesById', async () => ({
      id: 9,
      monitorNewItems: 'none',
      seasons: [
        { seasonNumber: 0, monitored: true },
        { seasonNumber: 1, monitored: true },
        { seasonNumber: 2, monitored: false },
      ],
    }));
    const put = mock.method(getAxios(sonarr), 'put', async () => ({}));

    await sonarr.updateSeasonMonitoring(9, {
      monitor: [0, 2],
      unmonitor: [0, 1],
      monitorNewSeasons: true,
    });

    assert.strictEqual(put.mock.calls[0].arguments[0], '/series/9');
    const body = put.mock.calls[0].arguments[1] as {
      monitorNewItems: string;
      seasons: { seasonNumber: number; monitored: boolean }[];
    };
    assert.strictEqual(body.monitorNewItems, 'all');
    assert.deepStrictEqual(body.seasons, [
      { seasonNumber: 0, monitored: true },
      { seasonNumber: 1, monitored: false },
      { seasonNumber: 2, monitored: true },
    ]);
  });

  it('skips the update when season monitoring is already right', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesById', async () => ({
      id: 9,
      monitorNewItems: 'all',
      seasons: [
        { seasonNumber: 1, monitored: false },
        { seasonNumber: 2, monitored: true },
      ],
    }));
    const put = mock.method(getAxios(sonarr), 'put', async () => ({}));

    await sonarr.updateSeasonMonitoring(9, {
      monitor: [2],
      unmonitor: [1],
      monitorNewSeasons: true,
    });

    assert.strictEqual(put.mock.callCount(), 0);
  });
});
