import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import CoverArtArchive from '@server/api/coverartarchive';
import MusicBrainz from '@server/api/musicbrainz';
import type { MbAlbumDetails } from '@server/api/musicbrainz/interfaces';
import OpenLibrary from '@server/api/openlibrary';
import type { OlSearchResponse } from '@server/api/openlibrary/interfaces';
import { FollowType, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import followedReleases, {
  applyReleaseCheck,
  getFollowGroups,
} from '@server/job/followedReleases';
import notificationManager from '@server/lib/notifications';
import type { NotificationPayload } from '@server/lib/notifications/agents/agent';
import { setupTestDb } from '@server/test/db';

const RADIOHEAD = 'a74b1b7f-71a5-4011-9441-d0b5e4122711';
const DAHL = 'OL34184A';
const today = new Date().toISOString().slice(0, 10);

let releaseGroups: Partial<MbAlbumDetails>[] = [];
let works: OlSearchResponse['docs'] = [];

const search = mock.method(MusicBrainz.prototype, 'searchAlbum', async () =>
  releaseGroups.map((releaseGroup) => releaseGroup as MbAlbumDetails)
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
mock.method(
  CoverArtArchive.prototype,
  'getFrontCoverUrl',
  async () => 'https://coverartarchive.org/cover.jpg'
);
const sent = mock.method(
  notificationManager,
  'sendNotification',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (_type: unknown, _payload: NotificationPayload) => undefined
).mock;

setupTestDb();

const getDemo = () =>
  getRepository(User).findOneOrFail({ where: { email: 'demo@seerr.dev' } });

describe('applyReleaseCheck', () => {
  const release = (id: string) => ({ id, title: id });

  it('only records the releases on the first check', () => {
    const follow = new Watchlist({ mediaType: FollowType.ARTIST });

    assert.deepEqual(applyReleaseCheck(follow, [release('a')]), []);
    assert.deepEqual(follow.knownReleaseIds, ['a']);
    assert.ok(follow.releasesCheckedAt);
  });

  it('returns the releases not seen before', () => {
    const follow = new Watchlist({
      mediaType: FollowType.ARTIST,
      releasesCheckedAt: new Date('2026-01-01'),
      knownReleaseIds: ['a'],
    });

    assert.deepEqual(applyReleaseCheck(follow, [release('a'), release('b')]), [
      release('b'),
    ]);
    assert.deepEqual(follow.knownReleaseIds, ['a', 'b']);
  });
});

describe('getFollowGroups', () => {
  it('groups the followers of an artist, unchecked ones first', () => {
    const groups = getFollowGroups([
      new Watchlist({
        id: 1,
        mediaType: FollowType.AUTHOR,
        olId: DAHL,
        releasesCheckedAt: new Date('2026-01-02'),
      }),
      new Watchlist({
        id: 2,
        mediaType: FollowType.ARTIST,
        mbId: RADIOHEAD,
        releasesCheckedAt: new Date('2026-01-03'),
      }),
      new Watchlist({ id: 3, mediaType: FollowType.ARTIST, mbId: RADIOHEAD }),
    ]);

    assert.deepEqual(
      groups.map((group) => [
        group.followType,
        group.id,
        group.follows.map((follow) => follow.id),
      ]),
      [
        [FollowType.ARTIST, RADIOHEAD, [2, 3]],
        [FollowType.AUTHOR, DAHL, [1]],
      ]
    );
  });
});

describe('followedReleases.run', () => {
  it('announces a new album after the first check', async () => {
    const demo = await getDemo();
    await getRepository(Watchlist).save(
      new Watchlist({
        title: 'Radiohead',
        mediaType: FollowType.ARTIST,
        mbId: RADIOHEAD,
        requestedBy: demo,
      })
    );
    releaseGroups = [
      { id: 'rg-old', title: 'Old Single', 'first-release-date': today },
    ];
    sent.resetCalls();

    await followedReleases.run();

    assert.equal(sent.callCount(), 0);
    const checked = await getRepository(Watchlist).findOneOrFail({
      where: { mbId: RADIOHEAD },
    });
    assert.ok(checked.releasesCheckedAt);
    assert.deepEqual(checked.knownReleaseIds, ['rg-old']);
    assert.match(
      String(search.calls.at(-1)?.arguments[0]?.query),
      new RegExp(`^arid:${RADIOHEAD} AND firstreleasedate:\\[`)
    );

    releaseGroups = [
      ...releaseGroups,
      { id: 'rg-new', title: 'New Album', 'first-release-date': today },
      // Not out yet
      { id: 'rg-later', title: 'Later', 'first-release-date': '2999-01-01' },
    ];

    await followedReleases.run();

    assert.equal(sent.callCount(), 1);
    const [, payload] = sent.calls[0].arguments;
    assert.equal(payload.subject, 'New release from Radiohead: New Album');
    assert.equal(payload.notifyUser?.id, demo.id);
    assert.equal(payload.media?.mediaType, MediaType.MUSIC);
    assert.equal(payload.media?.mbId, 'rg-new');
    assert.equal(payload.image, 'https://coverartarchive.org/cover.jpg');
  });

  it('announces a new book after the first check', async () => {
    const demo = await getDemo();
    await getRepository(Watchlist).save(
      new Watchlist({
        title: 'Roald Dahl',
        mediaType: FollowType.AUTHOR,
        olId: DAHL,
        requestedBy: demo,
        releasesCheckedAt: new Date('2026-01-01'),
        knownReleaseIds: [],
      })
    );
    works = [{ key: '/works/OL1W', title: 'New Book', cover_i: 42 }];
    sent.resetCalls();

    await followedReleases.run();

    assert.equal(sent.callCount(), 1);
    const [, payload] = sent.calls[0].arguments;
    assert.equal(payload.subject, 'New release from Roald Dahl: New Book');
    assert.equal(payload.media?.olId, 'OL1W');
    assert.equal(payload.image, 'https://covers.openlibrary.org/b/id/42-L.jpg');
  });
});
