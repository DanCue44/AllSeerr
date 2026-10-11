import {
  MediaRequestMonitorMode,
  MediaRequestStatus,
  MediaStatus,
  SeasonRolloverStatus,
} from '@server/constants/media';
import type {
  RollOff,
  RolloverEpisode,
} from '@server/lib/currentSeasonRollover';
import type { RolloverRecord } from '@server/lib/seasonRollover';
import {
  decideRolloverAction,
  getAvailableSeasonNumbers,
  getHeldSeasons,
  getPreexistingSeasons,
  getRollOffSeasons,
  getRolloverMessage,
  getStatusAfterRollOff,
  limitRollOff,
  splitRolloverSeasons,
} from '@server/lib/seasonRollover';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const NOW = new Date('2026-10-08T12:00:00Z');
const LATER = new Date('2026-10-11T12:00:00Z');
const EARLIER = new Date('2026-10-05T12:00:00Z');

const record = (overrides: Partial<RolloverRecord> = {}): RolloverRecord => ({
  status: SeasonRolloverStatus.PENDING,
  seasons: [3, 4],
  preexistingSeasons: [1, 2],
  deletePreexisting: false,
  deleteAfter: LATER,
  ...overrides,
});

const episode = (
  id: number,
  seasonNumber: number,
  episodeFileId?: number
): RolloverEpisode => ({
  id,
  seasonNumber,
  hasFile: !!episodeFileId,
  episodeFileId,
  monitored: false,
});

// Seasons 1 to 4 have files 11, 21, 31 and 41, season 5 is current
const EPISODES = [
  episode(1, 1, 11),
  episode(2, 2, 21),
  episode(3, 3, 31),
  episode(4, 4, 41),
  episode(5, 5, 51),
];

const rollOff = (overrides: Partial<RollOff> = {}): RollOff => ({
  seasons: [1, 2, 3, 4],
  episodeIdsToUnmonitor: [1, 2, 3, 4],
  episodeFileIds: [11, 21, 31, 41],
  seasonsToMarkDeleted: [1, 2, 3, 4],
  requestIdsToMove: [7],
  ...overrides,
});

describe('decideRolloverAction', () => {
  it('notifies first when there is something to delete', () => {
    assert.deepEqual(
      decideRolloverAction({ existing: null, now: NOW, seasons: [1, 2] }),
      { action: 'notify', deleteSeasons: [] }
    );
  });

  it('moves requests without a notice when nothing would be deleted', () => {
    assert.deepEqual(
      decideRolloverAction({ existing: null, now: NOW, seasons: [] }),
      { action: 'execute', deleteSeasons: [] }
    );
  });

  it('waits until the notice period is over', () => {
    assert.deepEqual(
      decideRolloverAction({
        existing: record(),
        now: NOW,
        seasons: [1, 2, 3, 4],
      }),
      { action: 'wait', deleteSeasons: [] }
    );
  });

  it('deletes the seasons the request brought in after the delay and holds the preexisting ones', () => {
    assert.deepEqual(
      decideRolloverAction({
        existing: record({ deleteAfter: EARLIER }),
        now: NOW,
        seasons: [1, 2, 3, 4],
      }),
      { action: 'execute', deleteSeasons: [3, 4] }
    );
  });

  it('goes ahead right away with a notice period of zero days', () => {
    assert.deepEqual(
      decideRolloverAction({
        existing: record({ deleteAfter: NOW }),
        now: NOW,
        seasons: [3, 4],
      }),
      { action: 'execute', deleteSeasons: [3, 4] }
    );
  });

  it('deletes every older season once an admin approves deleting all', () => {
    assert.deepEqual(
      decideRolloverAction({
        existing: record({ deletePreexisting: true, deleteAfter: NOW }),
        now: NOW,
        seasons: [1, 2, 3, 4],
      }),
      { action: 'execute', deleteSeasons: [1, 2, 3, 4] }
    );
  });

  it('never deletes anything once the seasons are kept', () => {
    for (const deleteAfter of [EARLIER, LATER]) {
      assert.deepEqual(
        decideRolloverAction({
          existing: record({
            status: SeasonRolloverStatus.KEPT,
            deletePreexisting: true,
            deleteAfter,
          }),
          now: NOW,
          seasons: [1, 2, 3, 4],
        }),
        { action: 'keep', deleteSeasons: [] }
      );
    }
  });

  it('keeps holding the preexisting seasons while they await review', () => {
    assert.deepEqual(
      decideRolloverAction({
        existing: record({ status: SeasonRolloverStatus.REVIEW }),
        now: NOW,
        seasons: [1, 2],
      }),
      { action: 'execute', deleteSeasons: [] }
    );
  });

  it('only deletes seasons the record covers', () => {
    assert.deepEqual(
      decideRolloverAction({
        existing: record({ seasons: [4], deleteAfter: EARLIER }),
        now: NOW,
        seasons: [3, 4],
      }),
      { action: 'execute', deleteSeasons: [4] }
    );
  });
});

describe('getStatusAfterRollOff', () => {
  it('stays open for review while preexisting seasons are held', () => {
    assert.equal(getStatusAfterRollOff(record()), SeasonRolloverStatus.REVIEW);
  });

  it('completes when nothing is held', () => {
    assert.equal(
      getStatusAfterRollOff(record({ preexistingSeasons: [] })),
      SeasonRolloverStatus.COMPLETED
    );
    assert.equal(
      getStatusAfterRollOff(record({ deletePreexisting: true })),
      SeasonRolloverStatus.COMPLETED
    );
  });
});

describe('getPreexistingSeasons', () => {
  const current = {
    is4k: false,
    status: MediaRequestStatus.APPROVED,
    monitorMode: MediaRequestMonitorMode.CURRENT,
    preexistingSeasons: [1, 2],
  };

  it('combines the seasons of every current season request', () => {
    assert.deepEqual(
      getPreexistingSeasons(
        [current, { ...current, preexistingSeasons: [2, 3] }],
        false
      ),
      [1, 2, 3]
    );
  });

  it('treats a request that never recorded them as holding everything', () => {
    assert.equal(
      getPreexistingSeasons(
        [current, { ...current, preexistingSeasons: null }],
        false
      ),
      null
    );
  });

  it('ignores other qualities and inactive requests', () => {
    assert.deepEqual(
      getPreexistingSeasons(
        [
          current,
          { ...current, is4k: true, preexistingSeasons: null },
          {
            ...current,
            status: MediaRequestStatus.DECLINED,
            preexistingSeasons: null,
          },
        ],
        false
      ),
      [1, 2]
    );
  });
});

describe('getHeldSeasons', () => {
  it('adds seasons kept on an earlier roll off', () => {
    assert.deepEqual(
      getHeldSeasons([1], [record({ seasons: [3], preexistingSeasons: [2] })]),
      [1, 2, 3]
    );
  });

  it('holds everything when the preexisting seasons are unknown', () => {
    assert.equal(getHeldSeasons(null, []), null);
  });
});

describe('splitRolloverSeasons', () => {
  it('holds the preexisting seasons and schedules the rest', () => {
    assert.deepEqual(splitRolloverSeasons([1, 2, 3, 4], [1, 2]), {
      seasons: [3, 4],
      preexistingSeasons: [1, 2],
    });
  });

  it('holds every season when the preexisting seasons are unknown', () => {
    assert.deepEqual(splitRolloverSeasons([1, 2, 3], null), {
      seasons: [],
      preexistingSeasons: [1, 2, 3],
    });
  });
});

describe('getRollOffSeasons', () => {
  it('lists seasons with files to delete or rows to mark deleted', () => {
    assert.deepEqual(
      getRollOffSeasons(
        rollOff({ episodeFileIds: [11, 31], seasonsToMarkDeleted: [2] }),
        EPISODES
      ),
      [1, 2, 3]
    );
  });

  it('skips seasons that only have monitored episodes', () => {
    assert.deepEqual(
      getRollOffSeasons(
        rollOff({ episodeFileIds: [], seasonsToMarkDeleted: [] }),
        EPISODES
      ),
      []
    );
  });
});

describe('limitRollOff', () => {
  it('keeps only the files and rows of approved seasons', () => {
    assert.deepEqual(limitRollOff(rollOff(), EPISODES, [3, 4]), {
      seasons: [3, 4],
      episodeIdsToUnmonitor: [1, 2, 3, 4],
      episodeFileIds: [31, 41],
      seasonsToMarkDeleted: [3, 4],
      requestIdsToMove: [7],
    });
  });

  it('deletes nothing when no season is approved', () => {
    const limited = limitRollOff(rollOff(), EPISODES, []);

    assert.deepEqual(limited.episodeFileIds, []);
    assert.deepEqual(limited.seasonsToMarkDeleted, []);
    assert.deepEqual(limited.requestIdsToMove, [7]);
  });
});

describe('getAvailableSeasonNumbers', () => {
  it('lists available seasons of the quality, specials aside', () => {
    const seasons = [
      {
        seasonNumber: 0,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
      },
      {
        seasonNumber: 1,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
      },
      {
        seasonNumber: 2,
        status: MediaStatus.PARTIALLY_AVAILABLE,
        status4k: MediaStatus.AVAILABLE,
      },
      {
        seasonNumber: 3,
        status: MediaStatus.PROCESSING,
        status4k: MediaStatus.UNKNOWN,
      },
    ];

    assert.deepEqual(getAvailableSeasonNumbers(seasons, false), [1, 2]);
    assert.deepEqual(getAvailableSeasonNumbers(seasons, true), [2]);
  });
});

describe('getRolloverMessage', () => {
  it('mentions the scheduled and the held seasons', () => {
    assert.equal(
      getRolloverMessage({
        title: 'The Daily Show',
        currentSeason: 5,
        seasons: [3, 4],
        preexistingSeasons: [1, 2],
        deleteAfter: new Date(2026, 9, 11, 12),
      }),
      'Season 5 of The Daily Show has started. Seasons 3, 4 will be deleted on Oct 11, 2026 unless you keep them. Seasons 1, 2 were already here and are kept unless you approve deleting them.'
    );
  });

  it('uses the singular for one season', () => {
    assert.equal(
      getRolloverMessage({
        title: 'The Daily Show',
        currentSeason: 5,
        seasons: [],
        preexistingSeasons: [4],
        deleteAfter: new Date(2026, 9, 11, 12),
      }),
      'Season 5 of The Daily Show has started. Season 4 was already here and is kept unless you approve deleting it.'
    );
  });
});
