import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import TheMovieDb from '@server/api/themoviedb';
import type { TmdbTvDetails } from '@server/api/themoviedb/interfaces';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import Season from '@server/entity/Season';
import SeasonRequest from '@server/entity/SeasonRequest';
import { User } from '@server/entity/User';
import {
  formatNewEpisodes,
  getEpisodesToNotify,
  getNewEpisodeRecipients,
  getNewEpisodes,
  isFirstEpisodeArrival,
  mergeEpisodeNumbers,
  normalizeEpisodeNumbers,
  shouldNotifyNewEpisodes,
} from '@server/lib/episodeNotifications';
import notificationManager, { Notification } from '@server/lib/notifications';
import type { NotificationPayload } from '@server/lib/notifications/agents/agent';
import type { ProcessableSeason } from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import { setupTestDb } from '@server/test/db';

Object.defineProperty(TheMovieDb.prototype, 'getTvShow', {
  get() {
    return async ({ tvId }: { tvId: number }) =>
      ({
        id: tvId,
        name: 'Test Show',
        first_air_date: '2024-01-01',
        overview: 'A show that is still airing.',
        poster_path: '/poster.jpg',
      }) as TmdbTvDetails;
  },
  set() {},
  configurable: true,
});

const sendNotificationMock = mock.method(
  notificationManager,
  'sendNotification',
  () => undefined
).mock;

const episodeNotifications = () =>
  sendNotificationMock.calls
    .filter(
      (call) => call.arguments[0] === Notification.MEDIA_EPISODES_AVAILABLE
    )
    .map((call) => call.arguments[1] as NotificationPayload);

class TestScanner extends BaseScanner<unknown> {
  constructor() {
    super('Test Scanner');
  }

  public scanShow(tmdbId: number, seasons: ProcessableSeason[]) {
    return this.processShow(tmdbId, 1, seasons, { title: 'Test Show' });
  }
}

const scanner = new TestScanner();

setupTestDb();

beforeEach(() => {
  sendNotificationMock.resetCalls();
});

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const getUsers = async () => {
  const userRepo = getRepository(User);
  const admin = await userRepo.findOneOrFail({
    where: { email: 'admin@seerr.dev' },
  });
  const demo = await userRepo.findOneOrFail({
    where: { email: 'demo@seerr.dev' },
  });

  return { admin, demo };
};

const seedShow = (seasons: Season[]) =>
  getRepository(Media).save(
    new Media({
      mediaType: MediaType.TV,
      tmdbId: 1399,
      tvdbId: 1,
      status: MediaStatus.PARTIALLY_AVAILABLE,
      status4k: MediaStatus.UNKNOWN,
      seasons,
    })
  );

const seedRequest = (
  media: Media,
  user: User,
  seasonNumbers: number[],
  {
    status = MediaRequestStatus.COMPLETED,
    is4k = false,
  }: { status?: MediaRequestStatus; is4k?: boolean } = {}
) =>
  getRepository(MediaRequest).save(
    new MediaRequest({
      type: MediaType.TV,
      status,
      media,
      requestedBy: user,
      is4k,
      seasons: seasonNumbers.map(
        (seasonNumber) => new SeasonRequest({ seasonNumber, status })
      ),
    })
  );

const getSeason = async (seasonNumber: number) => {
  const media = await getRepository(Media).findOneOrFail({
    where: { tmdbId: 1399, mediaType: MediaType.TV },
  });

  return media.seasons.find((season) => season.seasonNumber === seasonNumber);
};

describe('normalizeEpisodeNumbers', () => {
  it('sorts, de-duplicates and drops missing numbers', () => {
    assert.deepEqual(
      normalizeEpisodeNumbers([3, 1, undefined, 3, null, 2]),
      [1, 2, 3]
    );
  });
});

describe('getNewEpisodes', () => {
  it('returns nothing without a previous scan', () => {
    assert.deepEqual(getNewEpisodes(null, [1, 2, 3]), []);
    assert.deepEqual(getNewEpisodes(undefined, [1, 2, 3]), []);
  });

  it('returns episodes that were not seen before', () => {
    assert.deepEqual(getNewEpisodes([1, 2, 4], [1, 2, 3, 4, 5]), [3, 5]);
  });

  it('ignores episodes that disappeared', () => {
    assert.deepEqual(getNewEpisodes([1, 2, 3], [1, 2]), []);
  });
});

describe('mergeEpisodeNumbers', () => {
  it('keeps episodes that are missing from the current scan', () => {
    assert.deepEqual(mergeEpisodeNumbers([1, 2, 3], [4, 2]), [1, 2, 3, 4]);
    assert.deepEqual(mergeEpisodeNumbers(null, [2, 1]), [1, 2]);
  });
});

describe('shouldNotifyNewEpisodes', () => {
  it('notifies for a season that stays partially available', () => {
    assert.equal(
      shouldNotifyNewEpisodes(
        MediaStatus.PARTIALLY_AVAILABLE,
        MediaStatus.PARTIALLY_AVAILABLE
      ),
      true
    );
  });

  it('notifies for a season that was already available', () => {
    assert.equal(
      shouldNotifyNewEpisodes(MediaStatus.AVAILABLE, MediaStatus.AVAILABLE),
      true
    );
  });

  it('skips a season that just became fully available', () => {
    assert.equal(
      shouldNotifyNewEpisodes(
        MediaStatus.PARTIALLY_AVAILABLE,
        MediaStatus.AVAILABLE
      ),
      false
    );
  });

  it('skips a season that had nothing available before', () => {
    assert.equal(
      shouldNotifyNewEpisodes(
        MediaStatus.PROCESSING,
        MediaStatus.PARTIALLY_AVAILABLE
      ),
      false
    );
    assert.equal(
      shouldNotifyNewEpisodes(undefined, MediaStatus.PARTIALLY_AVAILABLE),
      false
    );
  });
});

describe('isFirstEpisodeArrival', () => {
  it('is true when a season without episodes becomes partially available', () => {
    for (const previous of [
      undefined,
      MediaStatus.UNKNOWN,
      MediaStatus.PENDING,
      MediaStatus.PROCESSING,
    ]) {
      assert.equal(
        isFirstEpisodeArrival(previous, MediaStatus.PARTIALLY_AVAILABLE),
        true
      );
    }
  });

  it('is false when the season becomes fully available at once', () => {
    assert.equal(
      isFirstEpisodeArrival(MediaStatus.PROCESSING, MediaStatus.AVAILABLE),
      false
    );
  });
});

describe('getEpisodesToNotify', () => {
  it('reports the first episodes without an earlier episode list', () => {
    assert.deepEqual(
      getEpisodesToNotify(
        null,
        [1],
        MediaStatus.PROCESSING,
        MediaStatus.PARTIALLY_AVAILABLE
      ),
      [1]
    );
  });

  it('needs an earlier episode list for an already partial season', () => {
    assert.deepEqual(
      getEpisodesToNotify(
        null,
        [1, 2, 3],
        MediaStatus.PARTIALLY_AVAILABLE,
        MediaStatus.PARTIALLY_AVAILABLE
      ),
      []
    );
    assert.deepEqual(
      getEpisodesToNotify(
        [1, 2],
        [1, 2, 3],
        MediaStatus.PARTIALLY_AVAILABLE,
        MediaStatus.PARTIALLY_AVAILABLE
      ),
      [3]
    );
  });
});

describe('formatNewEpisodes', () => {
  it('lists episodes in season order', () => {
    assert.equal(
      formatNewEpisodes([
        { seasonNumber: 12, episodes: [1] },
        { seasonNumber: 2, episodes: [5, 6] },
      ]),
      'S02E05, S02E06, S12E01'
    );
  });
});

describe('getNewEpisodeRecipients', () => {
  it('only includes users who requested a season with new episodes', async () => {
    const { admin, demo } = await getUsers();
    const media = await seedShow([]);
    await seedRequest(media, admin, [1]);
    await seedRequest(media, demo, [2]);

    const recipients = await getNewEpisodeRecipients(
      media,
      [{ seasonNumber: 2, episodes: [5] }],
      false
    );

    assert.deepEqual(
      recipients.map((recipient) => recipient.user.id),
      [demo.id]
    );
  });

  it('lists a user once across several requests', async () => {
    const { demo } = await getUsers();
    const media = await seedShow([]);
    await seedRequest(media, demo, [1]);
    await seedRequest(media, demo, [2]);

    const recipients = await getNewEpisodeRecipients(
      media,
      [
        { seasonNumber: 1, episodes: [9] },
        { seasonNumber: 2, episodes: [1] },
      ],
      false
    );

    assert.equal(recipients.length, 1);
    assert.deepEqual(
      recipients[0].seasons.map((season) => season.seasonNumber).sort(),
      [1, 2]
    );
  });

  it('leaves out declined, pending and other quality requests', async () => {
    const { admin, demo } = await getUsers();
    const media = await seedShow([]);
    await seedRequest(media, admin, [1], {
      status: MediaRequestStatus.DECLINED,
    });
    await seedRequest(media, demo, [1], {
      status: MediaRequestStatus.COMPLETED,
      is4k: true,
    });
    await seedRequest(media, admin, [1], {
      status: MediaRequestStatus.PENDING,
    });

    assert.deepEqual(
      await getNewEpisodeRecipients(
        media,
        [{ seasonNumber: 1, episodes: [5] }],
        false
      ),
      []
    );
  });
});

describe('processShow new episode notifications', () => {
  it('notifies requesters once with every new episode', async () => {
    const { admin, demo } = await getUsers();
    const media = await seedShow([
      new Season({
        seasonNumber: 1,
        status: MediaStatus.AVAILABLE,
        availableEpisodes: range(1, 8),
      }),
      new Season({
        seasonNumber: 2,
        status: MediaStatus.PARTIALLY_AVAILABLE,
        availableEpisodes: range(1, 4),
      }),
    ]);
    await seedRequest(media, demo, [1]);
    await seedRequest(media, demo, [2]);
    await seedRequest(media, admin, [1]);

    await scanner.scanShow(1399, [
      {
        seasonNumber: 1,
        totalEpisodes: 8,
        episodes: 9,
        episodes4k: 0,
        episodeNumbers: range(1, 9),
      },
      {
        seasonNumber: 2,
        totalEpisodes: 10,
        episodes: 6,
        episodes4k: 0,
        episodeNumbers: range(1, 6),
      },
    ]);

    const sent = episodeNotifications();
    const demoPayload = sent.find((p) => p.notifyUser?.id === demo.id);
    const adminPayload = sent.find((p) => p.notifyUser?.id === admin.id);

    assert.equal(sent.length, 2);
    assert.equal(demoPayload?.extra?.[0].value, 'S01E09, S02E05, S02E06');
    assert.equal(adminPayload?.extra?.[0].value, 'S01E09');
    assert.equal(demoPayload?.notifyAdmin, false);
    assert.deepEqual((await getSeason(2))?.availableEpisodes, range(1, 6));
  });

  it('does not notify on the first scan of a show', async () => {
    await scanner.scanShow(1399, [
      {
        seasonNumber: 1,
        totalEpisodes: 10,
        episodes: 4,
        episodes4k: 0,
        episodeNumbers: range(1, 4),
      },
    ]);

    assert.equal(episodeNotifications().length, 0);
    assert.deepEqual((await getSeason(1))?.availableEpisodes, range(1, 4));
  });

  it('does not notify for an already partial season on its first scan', async () => {
    const { demo } = await getUsers();
    const media = await seedShow([
      new Season({
        seasonNumber: 1,
        status: MediaStatus.PARTIALLY_AVAILABLE,
      }),
    ]);
    await seedRequest(media, demo, [1]);

    await scanner.scanShow(1399, [
      {
        seasonNumber: 1,
        totalEpisodes: 10,
        episodes: 5,
        episodes4k: 0,
        episodeNumbers: range(1, 5),
      },
    ]);

    assert.equal(episodeNotifications().length, 0);
    assert.deepEqual((await getSeason(1))?.availableEpisodes, range(1, 5));
  });

  it('notifies when a requested season gets its first episode', async () => {
    const { demo } = await getUsers();
    const media = await seedShow([
      new Season({ seasonNumber: 1, status: MediaStatus.AVAILABLE }),
      new Season({ seasonNumber: 2, status: MediaStatus.PROCESSING }),
    ]);
    await seedRequest(media, demo, [2], {
      status: MediaRequestStatus.APPROVED,
    });

    await scanner.scanShow(1399, [
      {
        seasonNumber: 2,
        totalEpisodes: 10,
        episodes: 1,
        episodes4k: 0,
        episodeNumbers: [1],
      },
    ]);

    const sent = episodeNotifications();

    assert.equal(sent.length, 1);
    assert.equal(sent[0].notifyUser?.id, demo.id);
    assert.equal(sent[0].extra?.[0].value, 'S02E01');
    assert.deepEqual((await getSeason(2))?.availableEpisodes, [1]);
  });

  it('notifies when a requested season without a row gets episodes', async () => {
    const { demo } = await getUsers();
    const media = await seedShow([
      new Season({ seasonNumber: 1, status: MediaStatus.AVAILABLE }),
    ]);
    await seedRequest(media, demo, [2]);

    await scanner.scanShow(1399, [
      {
        seasonNumber: 2,
        totalEpisodes: 10,
        episodes: 2,
        episodes4k: 0,
        episodeNumbers: [1, 2],
      },
    ]);

    const sent = episodeNotifications();

    assert.equal(sent.length, 1);
    assert.equal(sent[0].extra?.[0].value, 'S02E01, S02E02');
  });

  it('notifies when another scanner marked the season partial first', async () => {
    const { demo } = await getUsers();
    const media = await seedShow([
      new Season({
        seasonNumber: 1,
        status: MediaStatus.PARTIALLY_AVAILABLE,
        availableEpisodes: [],
      }),
    ]);
    await seedRequest(media, demo, [1]);

    await scanner.scanShow(1399, [
      {
        seasonNumber: 1,
        totalEpisodes: 10,
        episodes: 1,
        episodes4k: 0,
        episodeNumbers: [1],
      },
    ]);

    assert.equal(episodeNotifications()[0]?.extra?.[0].value, 'S01E01');
  });

  it('leaves a season that arrives complete to Now Available', async () => {
    const { demo } = await getUsers();
    const media = await seedShow([
      new Season({ seasonNumber: 1, status: MediaStatus.PROCESSING }),
    ]);
    await seedRequest(media, demo, [1], {
      status: MediaRequestStatus.APPROVED,
    });

    await scanner.scanShow(1399, [
      {
        seasonNumber: 1,
        totalEpisodes: 10,
        episodes: 10,
        episodes4k: 0,
        episodeNumbers: range(1, 10),
      },
    ]);

    assert.equal(episodeNotifications().length, 0);
  });

  it('leaves the season to Now Available when it becomes complete', async () => {
    const { demo } = await getUsers();
    const media = await seedShow([
      new Season({
        seasonNumber: 1,
        status: MediaStatus.PARTIALLY_AVAILABLE,
        availableEpisodes: range(1, 9),
      }),
    ]);
    await seedRequest(media, demo, [1]);

    await scanner.scanShow(1399, [
      {
        seasonNumber: 1,
        totalEpisodes: 10,
        episodes: 10,
        episodes4k: 0,
        episodeNumbers: range(1, 10),
      },
    ]);

    assert.equal(episodeNotifications().length, 0);
    assert.deepEqual((await getSeason(1))?.availableEpisodes, range(1, 10));
  });

  it('does not report episodes again after a scan that missed them', async () => {
    const { demo } = await getUsers();
    const media = await seedShow([
      new Season({
        seasonNumber: 1,
        status: MediaStatus.PARTIALLY_AVAILABLE,
        availableEpisodes: range(1, 6),
      }),
    ]);
    await seedRequest(media, demo, [1]);

    for (const episodeNumbers of [range(1, 3), range(1, 6)]) {
      await scanner.scanShow(1399, [
        {
          seasonNumber: 1,
          totalEpisodes: 10,
          episodes: episodeNumbers.length,
          episodes4k: 0,
          episodeNumbers,
        },
      ]);
    }

    assert.equal(episodeNotifications().length, 0);
    assert.deepEqual((await getSeason(1))?.availableEpisodes, range(1, 6));
  });

  it('keeps the episode list when the scanner does not know episodes', async () => {
    const { demo } = await getUsers();
    const media = await seedShow([
      new Season({
        seasonNumber: 1,
        status: MediaStatus.PARTIALLY_AVAILABLE,
        availableEpisodes: range(1, 4),
      }),
    ]);
    await seedRequest(media, demo, [1]);

    await scanner.scanShow(1399, [
      { seasonNumber: 1, totalEpisodes: 10, episodes: 6, episodes4k: 0 },
    ]);

    assert.equal(episodeNotifications().length, 0);
    assert.deepEqual((await getSeason(1))?.availableEpisodes, range(1, 4));
  });
});
