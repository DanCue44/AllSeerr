import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import MusicBrainz from '@server/api/musicbrainz';
import type { MbReleaseGroup } from '@server/api/musicbrainz/interfaces';
import OpenLibrary from '@server/api/openlibrary';
import type { OlWork } from '@server/api/openlibrary/interfaces';
import { MediaRequestStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import {
  MediaRequest,
  QuotaRestrictedError,
  RequestPermissionError,
} from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';

mock.method(MediaRequest, 'sendNotification', async () => undefined);

mock.method(
  MusicBrainz.prototype,
  'getAlbum',
  async ({ releaseGroupId }: { releaseGroupId: string }) =>
    ({
      id: releaseGroupId,
      title: 'OK Computer',
      'primary-type': 'Album',
      'artist-credit': [],
    }) as unknown as MbReleaseGroup
);

mock.method(
  OpenLibrary.prototype,
  'getWork',
  async (workId: string): Promise<OlWork> => ({
    key: `/works/${workId}`,
    title: 'Fantastic Mr Fox',
    type: { key: '/type/work' },
  })
);

setupTestDb();

afterEach(() => {
  getSettings().main.defaultQuotas.music = {};
  getSettings().main.defaultQuotas.book = {};
});

async function createUser(
  email: string,
  permissions: number,
  quotas: Partial<
    Pick<
      User,
      'musicQuotaLimit' | 'musicQuotaDays' | 'bookQuotaLimit' | 'bookQuotaDays'
    >
  > = {}
): Promise<User> {
  return getRepository(User).save(
    new User({ email, permissions, avatar: '', ...quotas })
  );
}

function requestAlbum(mbId: string, user: User, extra = {}) {
  return MediaRequest.request(
    { mediaId: mbId, mediaType: MediaType.MUSIC, ...extra },
    user
  );
}

function requestBook(
  olId: string,
  user: User,
  isAudiobook = false,
  extra = {}
) {
  return MediaRequest.request(
    { mediaId: olId, mediaType: MediaType.BOOK, isAudiobook, ...extra },
    user
  );
}

describe('User.getQuota for music and books', () => {
  it('counts music requests in the quota window', async () => {
    const user = await createUser('music@seerr.dev', Permission.REQUEST, {
      musicQuotaLimit: 5,
      musicQuotaDays: 7,
    });

    await requestAlbum('album-1', user);
    await requestAlbum('album-2', user);

    const quota = await user.getQuota();
    assert.equal(quota.music.used, 2);
    assert.equal(quota.music.remaining, 3);
    assert.equal(quota.music.restricted, false);
    // Albums do not count against the book quota
    assert.equal(quota.book.used, 0);
  });

  it('counts each format of a book as one request', async () => {
    const user = await createUser('books@seerr.dev', Permission.REQUEST, {
      bookQuotaLimit: 3,
      bookQuotaDays: 7,
    });

    await requestBook('OL1W', user, false);
    await requestBook('OL1W', user, true);

    const quota = await user.getQuota();
    assert.equal(quota.book.used, 2);
    assert.equal(quota.book.remaining, 1);
    assert.equal(quota.music.used, 0);
  });

  it('skips declined, quota exempt and out of window requests', async () => {
    const user = await createUser('window@seerr.dev', Permission.REQUEST, {
      musicQuotaLimit: 5,
      musicQuotaDays: 7,
    });
    const requestRepository = getRepository(MediaRequest);

    const declined = await requestAlbum('album-1', user);
    await requestRepository.update(declined.id, {
      status: MediaRequestStatus.DECLINED,
    });
    const exempt = await requestAlbum('album-2', user);
    await requestRepository.update(exempt.id, { ignoreQuota: true });
    const old = await requestAlbum('album-3', user);
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - 30);
    await requestRepository.update(old.id, { createdAt });
    await requestAlbum('album-4', user);

    const quota = await user.getQuota();
    assert.equal(quota.music.used, 1);
  });

  it('falls back to the global default quotas', async () => {
    getSettings().main.defaultQuotas.music = { quotaLimit: 4, quotaDays: 2 };
    getSettings().main.defaultQuotas.book = { quotaLimit: 6, quotaDays: 3 };
    const user = await createUser('defaults@seerr.dev', Permission.REQUEST);

    const quota = await user.getQuota();
    assert.equal(quota.music.limit, 4);
    assert.equal(quota.music.days, 2);
    assert.equal(quota.book.limit, 6);
    assert.equal(quota.book.days, 3);
  });

  it('lifts the quotas for users who can manage users', async () => {
    getSettings().main.defaultQuotas.music = { quotaLimit: 1, quotaDays: 7 };
    getSettings().main.defaultQuotas.book = { quotaLimit: 1, quotaDays: 7 };
    const manager = await createUser(
      'manager@seerr.dev',
      Permission.REQUEST | Permission.MANAGE_USERS
    );

    await requestAlbum('album-1', manager);
    await requestAlbum('album-2', manager);
    await requestBook('OL1W', manager);
    await requestBook('OL2W', manager);

    const quota = await manager.getQuota();
    assert.equal(quota.music.limit, 0);
    assert.equal(quota.music.restricted, false);
    assert.equal(quota.book.limit, 0);
    assert.equal(quota.book.restricted, false);
  });
});

describe('music and book quota enforcement', () => {
  it('rejects a music request once the music quota is used up', async () => {
    const user = await createUser('music@seerr.dev', Permission.REQUEST, {
      musicQuotaLimit: 1,
      musicQuotaDays: 7,
    });

    await requestAlbum('album-1', user);

    await assert.rejects(
      requestAlbum('album-2', user),
      (error: Error) =>
        error instanceof QuotaRestrictedError &&
        error.message === 'Music Quota exceeded.'
    );
    // The book quota is separate
    await requestBook('OL1W', user);
  });

  it('rejects the second format of a book at a quota of one', async () => {
    const user = await createUser('books@seerr.dev', Permission.REQUEST, {
      bookQuotaLimit: 1,
      bookQuotaDays: 7,
    });

    await requestBook('OL1W', user, false);

    await assert.rejects(
      requestBook('OL1W', user, true),
      (error: Error) =>
        error instanceof QuotaRestrictedError &&
        error.message === 'Book Quota exceeded.'
    );
  });

  it('lets a request manager bypass the quota for another user', async () => {
    const user = await createUser('books@seerr.dev', Permission.REQUEST, {
      bookQuotaLimit: 1,
      bookQuotaDays: 7,
      musicQuotaLimit: 1,
      musicQuotaDays: 7,
    });
    const manager = await createUser(
      'manager@seerr.dev',
      Permission.MANAGE_REQUESTS | Permission.MANAGE_USERS
    );

    await requestBook('OL1W', user);
    await requestAlbum('album-1', user);

    const book = await requestBook('OL2W', manager, false, {
      userId: user.id,
      ignoreQuota: true,
    });
    const album = await requestAlbum('album-2', manager, {
      userId: user.id,
      ignoreQuota: true,
    });
    assert.equal(book.ignoreQuota, true);
    assert.equal(album.ignoreQuota, true);

    // Exempt requests stay off the quota
    const quota = await user.getQuota();
    assert.equal(quota.book.used, 1);
    assert.equal(quota.music.used, 1);
  });

  it('refuses a quota bypass from a user who cannot manage requests', async () => {
    const user = await createUser('music@seerr.dev', Permission.REQUEST, {
      musicQuotaLimit: 1,
      musicQuotaDays: 7,
    });

    await assert.rejects(
      requestAlbum('album-1', user, { ignoreQuota: true }),
      RequestPermissionError
    );
  });
});

describe('book request permissions', () => {
  it('allows book requests with Request Books alone', async () => {
    const user = await createUser('books@seerr.dev', Permission.REQUEST_BOOK);

    const request = await requestBook('OL1W', user);
    assert.equal(request.type, MediaType.BOOK);
  });

  it('keeps allowing book requests with the general Request permission', async () => {
    const user = await createUser('request@seerr.dev', Permission.REQUEST);

    const request = await requestBook('OL1W', user);
    assert.equal(request.type, MediaType.BOOK);
  });

  it('rejects book requests from users without either permission', async () => {
    const user = await createUser(
      'music@seerr.dev',
      Permission.REQUEST_MUSIC | Permission.REQUEST_MOVIE
    );

    await assert.rejects(requestBook('OL1W', user), RequestPermissionError);
  });

  it('does not let Request Books stand in for music', async () => {
    const user = await createUser('books@seerr.dev', Permission.REQUEST_BOOK);

    await assert.rejects(requestAlbum('album-1', user), RequestPermissionError);
  });

  it('uses a bit no other permission shares', () => {
    const others = Object.entries(Permission).filter(
      ([name, value]) =>
        typeof value === 'number' && name !== 'REQUEST_BOOK' && name !== 'NONE'
    );

    for (const [name, value] of others) {
      assert.equal(
        (value as number) & Permission.REQUEST_BOOK,
        0,
        `${name} overlaps REQUEST_BOOK`
      );
    }
    // Fits the signed 32-bit permissions column
    assert.ok(Permission.REQUEST_BOOK < 2 ** 31);
  });
});
