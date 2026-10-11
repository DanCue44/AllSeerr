import {
  MediaRequestMonitorMode,
  MediaRequestStatus,
  MediaStatus,
} from '@server/constants/media';
import type {
  RolloverEpisode,
  RolloverMediaSeason,
  RolloverRequest,
  RolloverSonarrSeason,
} from '@server/lib/currentSeasonRollover';
import { planCurrentSeasonRollover } from '@server/lib/currentSeasonRollover';
import { getCurrentSeasonNumber } from '@server/lib/episodeRequests';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const NOW = new Date('2026-06-01T00:00:00Z');
const AIRED = '2026-01-01T00:00:00Z';
const UNAIRED = '2026-12-01T00:00:00Z';

const request = (
  overrides: Partial<RolloverRequest> = {}
): RolloverRequest => ({
  id: 1,
  is4k: false,
  status: MediaRequestStatus.APPROVED,
  monitorMode: MediaRequestMonitorMode.CURRENT,
  seasons: [{ seasonNumber: 1 }],
  ...overrides,
});

const episode = (
  seasonNumber: number,
  episodeNumber: number,
  {
    hasFile = false,
    monitored = true,
    airDateUtc = AIRED,
  }: { hasFile?: boolean; monitored?: boolean; airDateUtc?: string | null } = {}
): RolloverEpisode => ({
  id: seasonNumber * 100 + episodeNumber,
  seasonNumber,
  hasFile,
  episodeFileId: hasFile ? seasonNumber * 1000 + episodeNumber : 0,
  monitored,
  airDateUtc,
});

const sonarrSeasons = (
  monitored: Record<number, boolean>
): RolloverSonarrSeason[] =>
  Object.entries(monitored).map(([seasonNumber, isMonitored]) => ({
    seasonNumber: Number(seasonNumber),
    monitored: isMonitored,
  }));

const mediaSeason = (
  seasonNumber: number,
  status: MediaStatus,
  status4k = MediaStatus.UNKNOWN
): RolloverMediaSeason => ({ seasonNumber, status, status4k });

// Season 1 is fully downloaded, season 2 just started with one file
const rolledSeries = () => ({
  requests: [request()],
  episodes: [
    episode(0, 1, { hasFile: true }),
    episode(1, 1, { hasFile: true }),
    episode(1, 2, { hasFile: true }),
    episode(2, 1, { hasFile: true }),
    episode(2, 2, { monitored: false }),
    episode(2, 3, { monitored: false, airDateUtc: UNAIRED }),
  ],
  sonarrSeasons: sonarrSeasons({ 0: true, 1: true, 2: false }),
  mediaSeasons: [
    mediaSeason(0, MediaStatus.AVAILABLE),
    mediaSeason(1, MediaStatus.AVAILABLE),
    mediaSeason(2, MediaStatus.PARTIALLY_AVAILABLE),
  ],
  is4k: false,
});

describe('planCurrentSeasonRollover', () => {
  it('rolls off older seasons once the new season has an aired file', () => {
    const plan = planCurrentSeasonRollover(rolledSeries(), NOW);

    assert.strictEqual(plan.currentSeason, 2);
    assert.strictEqual(plan.skipReason, undefined);
    assert.deepStrictEqual(plan.rollOff, {
      seasons: [1],
      episodeIdsToUnmonitor: [101, 102],
      episodeFileIds: [1001, 1002],
      seasonsToMarkDeleted: [1],
      requestIdsToMove: [1],
    });
    assert.deepStrictEqual(plan.seasonsToUnmonitor, [1]);
  });

  it('monitors the new season and searches its aired episodes', () => {
    const plan = planCurrentSeasonRollover(rolledSeries(), NOW);

    assert.deepStrictEqual(plan.seasonsToMonitor, [2]);
    assert.deepStrictEqual(plan.episodeIdsToMonitor, [202, 203]);
    assert.deepStrictEqual(plan.episodeIdsToSearch, [202]);
  });

  it('never touches specials', () => {
    const plan = planCurrentSeasonRollover(rolledSeries(), NOW);

    assert.ok(!plan.rollOff?.seasons.includes(0));
    assert.ok(!plan.rollOff?.episodeFileIds.includes(1));
    assert.ok(!plan.rollOff?.episodeIdsToUnmonitor.includes(1));
    assert.ok(!plan.rollOff?.seasonsToMarkDeleted.includes(0));
    assert.ok(!plan.seasonsToUnmonitor.includes(0));
    assert.ok(!plan.seasonsToMonitor.includes(0));
  });

  it('deletes nothing when the new season has no aired episodes', () => {
    const series = rolledSeries();
    series.episodes = [
      episode(1, 1, { hasFile: true }),
      // Leaked early, it has a file but has not aired
      episode(2, 1, { hasFile: true, airDateUtc: UNAIRED }),
    ];

    const plan = planCurrentSeasonRollover(series, NOW);

    assert.strictEqual(plan.currentSeason, 1);
    assert.strictEqual(plan.rollOff, null);
    assert.deepStrictEqual(plan.seasonsToUnmonitor, []);
  });

  it('deletes nothing while the aired episodes of the new season have no file', () => {
    const series = rolledSeries();
    series.episodes = [
      episode(1, 1, { hasFile: true }),
      episode(2, 1),
      episode(2, 2, { airDateUtc: UNAIRED }),
    ];

    const plan = planCurrentSeasonRollover(series, NOW);

    assert.strictEqual(plan.currentSeason, 2);
    assert.strictEqual(plan.skipReason, 'no-aired-file');
    assert.strictEqual(plan.rollOff, null);
    assert.deepStrictEqual(plan.seasonsToUnmonitor, []);
    // It still makes sure Sonarr follows the new season
    assert.deepStrictEqual(plan.seasonsToMonitor, [2]);
  });

  it('ignores episodes without an air date when finding the current season', () => {
    const series = rolledSeries();
    series.episodes = [
      episode(1, 1, { hasFile: true }),
      episode(2, 1, { hasFile: true, airDateUtc: null }),
    ];

    const plan = planCurrentSeasonRollover(series, NOW);

    assert.strictEqual(plan.currentSeason, 1);
    assert.strictEqual(plan.rollOff, null);
  });

  it('never deletes the current or newest season', () => {
    const series = rolledSeries();
    series.requests = [request({ seasons: [{ seasonNumber: 2 }] })];
    series.episodes = [
      episode(1, 1, { hasFile: true }),
      episode(2, 1, { hasFile: true }),
      episode(3, 1, { hasFile: true }),
      episode(3, 2, { airDateUtc: UNAIRED }),
      episode(4, 1, { airDateUtc: UNAIRED }),
    ];
    series.sonarrSeasons = sonarrSeasons({
      1: true,
      2: true,
      3: true,
      4: true,
    });

    const plan = planCurrentSeasonRollover(series, NOW);

    assert.strictEqual(plan.currentSeason, 3);
    assert.deepStrictEqual(plan.rollOff?.seasons, [1, 2]);
    assert.deepStrictEqual(plan.rollOff?.episodeFileIds, [1001, 2001]);
    assert.deepStrictEqual(plan.seasonsToUnmonitor, [1, 2]);
  });

  it('does nothing for a series with only a single season', () => {
    const series = rolledSeries();
    series.episodes = [episode(1, 1, { hasFile: true }), episode(1, 2)];
    series.sonarrSeasons = sonarrSeasons({ 1: true });
    series.mediaSeasons = [mediaSeason(1, MediaStatus.PARTIALLY_AVAILABLE)];

    const plan = planCurrentSeasonRollover(series, NOW);

    assert.strictEqual(plan.currentSeason, 1);
    assert.strictEqual(plan.rollOff, null);
  });

  it('does nothing without a current season request', () => {
    const series = rolledSeries();
    series.requests = [request({ monitorMode: null })];

    const plan = planCurrentSeasonRollover(series, NOW);

    assert.strictEqual(plan.skipReason, 'no-current-request');
    assert.strictEqual(plan.currentSeason, null);
    assert.deepStrictEqual(plan.episodeIdsToMonitor, []);
    assert.strictEqual(plan.rollOff, null);
  });

  it('does nothing when the current season request is only pending', () => {
    const series = rolledSeries();
    series.requests = [request({ status: MediaRequestStatus.PENDING })];

    const plan = planCurrentSeasonRollover(series, NOW);

    assert.strictEqual(plan.skipReason, 'no-current-request');
    assert.strictEqual(plan.rollOff, null);
  });

  it('ignores declined and failed current season requests', () => {
    for (const status of [
      MediaRequestStatus.DECLINED,
      MediaRequestStatus.FAILED,
    ]) {
      const series = rolledSeries();
      series.requests = [request({ status })];

      const plan = planCurrentSeasonRollover(series, NOW);

      assert.strictEqual(plan.skipReason, 'no-current-request');
      assert.strictEqual(plan.rollOff, null);
    }
  });

  it('keeps older seasons when another active request exists', () => {
    for (const other of [
      request({ id: 2, monitorMode: null }),
      request({ id: 2, monitorMode: MediaRequestMonitorMode.SEASONS }),
      request({ id: 2, monitorMode: MediaRequestMonitorMode.FUTURE }),
      request({
        id: 2,
        monitorMode: null,
        status: MediaRequestStatus.PENDING,
      }),
      // A completed request still wants its seasons kept
      request({
        id: 2,
        monitorMode: null,
        status: MediaRequestStatus.COMPLETED,
      }),
    ]) {
      const series = rolledSeries();
      series.requests = [request(), other];

      const plan = planCurrentSeasonRollover(series, NOW);

      assert.strictEqual(plan.skipReason, 'other-requests');
      assert.strictEqual(plan.rollOff, null);
      assert.deepStrictEqual(plan.episodeIdsToMonitor, []);
    }
  });

  it('rolls when the other requests are declined, failed or current season ones', () => {
    const series = rolledSeries();
    series.requests = [
      request(),
      request({
        id: 2,
        monitorMode: null,
        status: MediaRequestStatus.DECLINED,
      }),
      request({ id: 3, monitorMode: null, status: MediaRequestStatus.FAILED }),
      request({ id: 4, status: MediaRequestStatus.COMPLETED }),
      request({
        id: 5,
        status: MediaRequestStatus.PENDING,
        seasons: [{ seasonNumber: 2 }],
      }),
    ];

    const plan = planCurrentSeasonRollover(series, NOW);

    assert.deepStrictEqual(plan.rollOff?.seasons, [1]);
    assert.deepStrictEqual(plan.rollOff?.requestIdsToMove, [1, 4]);
  });

  it('keeps 4K and non 4K requests apart', () => {
    const series = rolledSeries();
    // A 4K season request does not hold back the non 4K roll off
    series.requests = [
      request(),
      request({ id: 2, is4k: true, monitorMode: null }),
    ];

    const plan = planCurrentSeasonRollover(series, NOW);
    assert.deepStrictEqual(plan.rollOff?.seasons, [1]);
    assert.deepStrictEqual(plan.rollOff?.requestIdsToMove, [1]);

    // And a non 4K current season request does nothing on the 4K server
    const plan4k = planCurrentSeasonRollover({ ...series, is4k: true }, NOW);
    assert.strictEqual(plan4k.skipReason, 'no-current-request');
    assert.strictEqual(plan4k.rollOff, null);
  });

  it('marks the 4K season status on a 4K server', () => {
    const series = rolledSeries();
    series.requests = [request({ is4k: true })];
    series.mediaSeasons = [
      mediaSeason(1, MediaStatus.AVAILABLE, MediaStatus.UNKNOWN),
      mediaSeason(2, MediaStatus.UNKNOWN, MediaStatus.AVAILABLE),
    ];

    const noRows = planCurrentSeasonRollover({ ...series, is4k: true }, NOW);
    assert.deepStrictEqual(noRows.rollOff?.seasonsToMarkDeleted, []);

    series.mediaSeasons = [
      mediaSeason(1, MediaStatus.UNKNOWN, MediaStatus.PARTIALLY_AVAILABLE),
    ];
    const plan = planCurrentSeasonRollover({ ...series, is4k: true }, NOW);
    assert.deepStrictEqual(plan.rollOff?.seasonsToMarkDeleted, [1]);
  });

  it('only marks seasons that are still live in Seerr', () => {
    const series = rolledSeries();
    series.requests = [request({ seasons: [{ seasonNumber: 4 }] })];
    series.episodes = [episode(4, 1, { hasFile: true })];
    series.sonarrSeasons = sonarrSeasons({ 4: true });
    series.mediaSeasons = [
      mediaSeason(1, MediaStatus.UNKNOWN),
      mediaSeason(2, MediaStatus.DELETED),
      mediaSeason(3, MediaStatus.PROCESSING),
      mediaSeason(4, MediaStatus.PARTIALLY_AVAILABLE),
    ];

    const plan = planCurrentSeasonRollover(series, NOW);

    assert.deepStrictEqual(plan.rollOff?.seasons, []);
    assert.deepStrictEqual(plan.rollOff?.seasonsToMarkDeleted, [3]);
  });

  it('never moves a request back to an older season', () => {
    const series = rolledSeries();
    // The request already follows season 3, which Sonarr has not seen air
    series.requests = [request({ seasons: [{ seasonNumber: 3 }] })];
    series.episodes = [
      ...series.episodes,
      episode(3, 1, { airDateUtc: UNAIRED }),
    ];

    const plan = planCurrentSeasonRollover(series, NOW);

    assert.strictEqual(plan.currentSeason, 2);
    assert.strictEqual(plan.skipReason, 'behind-request');
    assert.strictEqual(plan.rollOff, null);
  });

  it('does nothing before any episode has aired', () => {
    const series = rolledSeries();
    series.episodes = [episode(1, 1, { airDateUtc: UNAIRED })];

    const plan = planCurrentSeasonRollover(series, NOW);

    assert.strictEqual(plan.skipReason, 'no-aired-episodes');
    assert.strictEqual(plan.rollOff, null);
    assert.deepStrictEqual(plan.episodeIdsToMonitor, []);
  });

  it('finds nothing left to do after a roll off', () => {
    const series = rolledSeries();
    series.requests = [request({ seasons: [{ seasonNumber: 2 }] })];
    series.episodes = [
      episode(1, 1, { monitored: false }),
      episode(1, 2, { monitored: false }),
      episode(2, 1, { hasFile: true }),
      episode(2, 2),
      episode(2, 3, { airDateUtc: UNAIRED }),
    ];
    series.sonarrSeasons = sonarrSeasons({ 1: false, 2: true });
    series.mediaSeasons = [
      mediaSeason(1, MediaStatus.DELETED),
      mediaSeason(2, MediaStatus.PARTIALLY_AVAILABLE),
    ];

    const plan = planCurrentSeasonRollover(series, NOW);

    assert.strictEqual(plan.currentSeason, 2);
    assert.strictEqual(plan.rollOff, null);
    assert.deepStrictEqual(plan.seasonsToMonitor, []);
    assert.deepStrictEqual(plan.seasonsToUnmonitor, []);
    assert.deepStrictEqual(plan.episodeIdsToMonitor, []);
    assert.deepStrictEqual(plan.episodeIdsToSearch, []);
  });

  it('moves a completed request to the new season', () => {
    const series = rolledSeries();
    series.requests = [request({ status: MediaRequestStatus.COMPLETED })];

    const plan = planCurrentSeasonRollover(series, NOW);

    assert.deepStrictEqual(plan.rollOff?.requestIdsToMove, [1]);
  });

  it('monitors announced seasons after the current one without searching', () => {
    const series = rolledSeries();
    series.requests = [request({ seasons: [{ seasonNumber: 2 }] })];
    series.episodes = [
      episode(2, 1, { hasFile: true }),
      episode(3, 1, { monitored: false, airDateUtc: UNAIRED }),
    ];
    series.sonarrSeasons = sonarrSeasons({ 2: true, 3: false });

    const plan = planCurrentSeasonRollover(series, NOW);

    assert.deepStrictEqual(plan.seasonsToMonitor, [3]);
    assert.deepStrictEqual(plan.episodeIdsToMonitor, [301]);
    assert.deepStrictEqual(plan.episodeIdsToSearch, []);
  });
});

describe('getCurrentSeasonNumber', () => {
  const seasons = [
    { seasonNumber: 0, airDate: '2019-01-01', episodeCount: 2 },
    { seasonNumber: 1, airDate: '2020-01-01', episodeCount: 8 },
    { seasonNumber: 2, airDate: '2021-01-01', episodeCount: 8 },
    { seasonNumber: 3, airDate: '2026-12-01', episodeCount: 8 },
  ];

  it('picks the season of the latest aired episode', () => {
    assert.strictEqual(
      getCurrentSeasonNumber(
        {
          seasons,
          lastEpisodeToAir: { seasonNumber: 2 },
          nextEpisodeToAir: { seasonNumber: 2 },
        },
        NOW
      ),
      2
    );
  });

  it('keeps the airing season while the next one is only announced', () => {
    assert.strictEqual(
      getCurrentSeasonNumber(
        {
          seasons,
          lastEpisodeToAir: { seasonNumber: 2 },
          nextEpisodeToAir: { seasonNumber: 3 },
        },
        NOW
      ),
      2
    );
  });

  it('picks the first season to air for a series that has not started', () => {
    assert.strictEqual(
      getCurrentSeasonNumber(
        { seasons, nextEpisodeToAir: { seasonNumber: 1 } },
        NOW
      ),
      1
    );
  });

  it('never picks specials', () => {
    assert.strictEqual(
      getCurrentSeasonNumber(
        {
          seasons,
          lastEpisodeToAir: { seasonNumber: 0 },
          nextEpisodeToAir: { seasonNumber: 0 },
        },
        NOW
      ),
      2
    );
  });

  it('falls back to the newest season that has aired', () => {
    assert.strictEqual(getCurrentSeasonNumber({ seasons }, NOW), 2);
  });

  it('returns null when nothing has aired or is scheduled', () => {
    assert.strictEqual(
      getCurrentSeasonNumber(
        { seasons: [{ seasonNumber: 1, airDate: null, episodeCount: 0 }] },
        NOW
      ),
      null
    );
  });
});
