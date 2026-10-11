import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import CoverArtArchive from '@server/api/coverartarchive';
import MusicBrainz from '@server/api/musicbrainz';
import type { MbReleaseGroup } from '@server/api/musicbrainz/interfaces';
import OpenLibrary from '@server/api/openlibrary';
import type { OlWork } from '@server/api/openlibrary/interfaces';
import {
  FollowType,
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import {
  getFollowerRecipients,
  getNewlyAvailable,
  notifyFollowers,
} from '@server/lib/followNotifications';
import notificationManager, { Notification } from '@server/lib/notifications';
import type { NotificationPayload } from '@server/lib/notifications/agents/agent';
import { setupTestDb } from '@server/test/db';

const ALBUM_MBID = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';
const RADIOHEAD = 'a74b1b7f-71a5-4011-9441-d0b5e4122711';
const GUEST_ARTIST = 'f22942a1-6f70-4f48-866e-238cb2308fbd';
const WORK_ID = 'OL45804W';
const DAHL = 'OL34184A';

mock.method(
  MusicBrainz.prototype,
  'getAlbum',
  async ({ releaseGroupId }: { releaseGroupId: string }) =>
    ({
      id: releaseGroupId,
      title: 'OK Computer',
      'first-release-date': '1997-05-21',
      'artist-credit': [
        {
          name: 'Radiohead',
          joinphrase: ' & ',
          artist: {
            id: RADIOHEAD,
            name: 'Radiohead',
            'sort-name': 'Radiohead',
          },
        },
        {
          name: 'Guest',
          artist: { id: GUEST_ARTIST, name: 'Guest', 'sort-name': 'Guest' },
        },
      ],
    }) as MbReleaseGroup
);
mock.method(
  MusicBrainz.prototype,
  'getArtistWikipediaExtract',
  async () => null
);
mock.method(CoverArtArchive.prototype, 'getFrontCoverUrl', async () => null);
mock.method(
  OpenLibrary.prototype,
  'getWork',
  async (): Promise<OlWork> => ({
    key: `/works/${WORK_ID}`,
    title: 'Fantastic Mr Fox',
    type: { key: '/type/work' },
    authors: [{ author: { key: `/authors/${DAHL}` } }],
  })
);
mock.method(OpenLibrary.prototype, 'getWorkSummary', async () => ({
  key: `/works/${WORK_ID}`,
  title: 'Fantastic Mr Fox',
  author_name: ['Roald Dahl'],
}));

const sent = mock.method(
  notificationManager,
  'sendNotification',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (_type: Notification, _payload: NotificationPayload) => undefined
).mock;

setupTestDb();

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

const follow = (
  user: User,
  followType: FollowType,
  id: string,
  title: string
) =>
  getRepository(Watchlist).save(
    new Watchlist({
      title,
      mediaType: followType,
      ...(followType === FollowType.ARTIST ? { mbId: id } : { olId: id }),
      requestedBy: user,
    })
  );

// Explicit ids, as a user is told about a media id once in a while
const saveAlbum = (id: number, status = MediaStatus.AVAILABLE) =>
  getRepository(Media).save(
    new Media({ id, mediaType: MediaType.MUSIC, mbId: ALBUM_MBID, status })
  );

const saveBook = (id: number, status = MediaStatus.AVAILABLE) =>
  getRepository(Media).save(
    new Media({
      id,
      mediaType: MediaType.BOOK,
      olId: WORK_ID,
      status,
      statusAudio: MediaStatus.UNKNOWN,
    })
  );

const waitForNotifications = async (count: number) => {
  for (let i = 0; i < 100 && sent.callCount() < count; i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

describe('getNewlyAvailable', () => {
  it('fires once an album becomes available', () => {
    assert.deepEqual(
      getNewlyAvailable(
        {
          mediaType: MediaType.MUSIC,
          status: MediaStatus.AVAILABLE,
          statusAudio: MediaStatus.UNKNOWN,
        },
        { status: MediaStatus.PROCESSING, statusAudio: MediaStatus.UNKNOWN }
      ),
      { isAudiobook: false }
    );
    assert.equal(
      getNewlyAvailable(
        {
          mediaType: MediaType.MUSIC,
          status: MediaStatus.AVAILABLE,
          statusAudio: MediaStatus.UNKNOWN,
        },
        { status: MediaStatus.AVAILABLE, statusAudio: MediaStatus.UNKNOWN }
      ),
      null
    );
  });

  it('fires for the first book format only', () => {
    assert.deepEqual(
      getNewlyAvailable({
        mediaType: MediaType.BOOK,
        status: MediaStatus.UNKNOWN,
        statusAudio: MediaStatus.AVAILABLE,
      }),
      { isAudiobook: true }
    );
    assert.equal(
      getNewlyAvailable(
        {
          mediaType: MediaType.BOOK,
          status: MediaStatus.AVAILABLE,
          statusAudio: MediaStatus.AVAILABLE,
        },
        { status: MediaStatus.UNKNOWN, statusAudio: MediaStatus.AVAILABLE }
      ),
      null
    );
  });

  it('ignores movies and series', () => {
    assert.equal(
      getNewlyAvailable({
        mediaType: MediaType.MOVIE,
        status: MediaStatus.AVAILABLE,
        statusAudio: MediaStatus.UNKNOWN,
      }),
      null
    );
  });
});

describe('getFollowerRecipients', () => {
  it('finds the followers of any credited artist', async () => {
    const { admin, demo } = await getUsers();
    const album = await saveAlbum(201);
    await follow(admin, FollowType.ARTIST, GUEST_ARTIST, 'Guest');
    await follow(demo, FollowType.ARTIST, RADIOHEAD, 'Radiohead');
    await follow(demo, FollowType.ARTIST, GUEST_ARTIST, 'Guest');

    const recipients = await getFollowerRecipients(album, [
      RADIOHEAD,
      GUEST_ARTIST,
    ]);

    assert.deepEqual(
      recipients
        .map(({ user, name }) => [user.id, name])
        .sort((a, b) => Number(a[0]) - Number(b[0])),
      [
        [admin.id, 'Guest'],
        [demo.id, 'Radiohead'],
      ]
    );
  });

  it('leaves out followers who requested it themselves', async () => {
    const { admin, demo } = await getUsers();
    const album = await saveAlbum(202);
    await follow(admin, FollowType.ARTIST, RADIOHEAD, 'Radiohead');
    await follow(demo, FollowType.ARTIST, RADIOHEAD, 'Radiohead');
    await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.MUSIC,
        status: MediaRequestStatus.COMPLETED,
        media: album,
        requestedBy: admin,
        is4k: false,
      })
    );

    const recipients = await getFollowerRecipients(album, [RADIOHEAD]);

    assert.deepEqual(
      recipients.map(({ user }) => user.id),
      [demo.id]
    );
  });

  it('does not mix artists and authors', async () => {
    const { demo } = await getUsers();
    const book = await saveBook(203);
    await follow(demo, FollowType.ARTIST, DAHL, 'Not an artist');

    assert.deepEqual(await getFollowerRecipients(book, [DAHL]), []);

    await follow(demo, FollowType.AUTHOR, DAHL, 'Roald Dahl');

    assert.deepEqual(
      (await getFollowerRecipients(book, [DAHL])).map(({ name }) => name),
      ['Roald Dahl']
    );
  });
});

describe('notifyFollowers', () => {
  it('tells the followers of the artist about an available album', async () => {
    const { demo } = await getUsers();
    await follow(demo, FollowType.ARTIST, RADIOHEAD, 'Radiohead');
    // Saved unavailable, so the subscriber leaves it to this call
    const album = await saveAlbum(204, MediaStatus.PROCESSING);
    sent.resetCalls();

    await notifyFollowers(album);

    assert.equal(sent.callCount(), 1);
    const [type, payload] = sent.calls[0].arguments;
    assert.equal(type, Notification.MEDIA_AVAILABLE);
    assert.equal(payload.notifyUser?.id, demo.id);
    assert.equal(payload.notifyAdmin, false);
    assert.equal(
      payload.subject,
      'A new album by Radiohead is available: OK Computer'
    );

    // Told once
    await notifyFollowers(album);
    assert.equal(sent.callCount(), 1);
  });

  it('tells the followers of the author about an available book', async () => {
    const { admin } = await getUsers();
    await follow(admin, FollowType.AUTHOR, DAHL, 'Roald Dahl');
    const book = await saveBook(205, MediaStatus.UNKNOWN);
    sent.resetCalls();

    await notifyFollowers(book, { isAudiobook: true });

    assert.equal(sent.callCount(), 1);
    const [, payload] = sent.calls[0].arguments;
    assert.equal(payload.notifyUser?.id, admin.id);
    assert.equal(
      payload.subject,
      'A new book by Roald Dahl is available: Fantastic Mr Fox'
    );
    assert.deepEqual(payload.extra, [{ name: 'Format', value: 'Audiobook' }]);
  });

  it('sends nothing when nobody follows the artist', async () => {
    const { demo } = await getUsers();
    await follow(demo, FollowType.AUTHOR, DAHL, 'Roald Dahl');
    const album = await saveAlbum(206);
    sent.resetCalls();

    await notifyFollowers(album);

    assert.equal(sent.callCount(), 0);
  });

  it('runs when a scan makes the album available', async () => {
    const { demo } = await getUsers();
    await follow(demo, FollowType.ARTIST, RADIOHEAD, 'Radiohead');
    const album = await saveAlbum(207, MediaStatus.PROCESSING);
    sent.resetCalls();

    album.status = MediaStatus.AVAILABLE;
    await getRepository(Media).save(album);
    await waitForNotifications(1);

    assert.equal(sent.callCount(), 1);
    assert.equal(sent.calls[0].arguments[1].notifyUser?.id, demo.id);
  });

  it('runs when a scan adds a book that is already available', async () => {
    const { demo } = await getUsers();
    await follow(demo, FollowType.AUTHOR, DAHL, 'Roald Dahl');
    sent.resetCalls();

    await saveBook(208);
    await waitForNotifications(1);

    assert.equal(sent.callCount(), 1);
    assert.deepEqual(sent.calls[0].arguments[1].extra, [
      { name: 'Format', value: 'Ebook' },
    ]);
  });
});
