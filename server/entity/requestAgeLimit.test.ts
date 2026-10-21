import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import OpenLibrary from '@server/api/openlibrary';
import type { OlWork } from '@server/api/openlibrary/interfaces';
import { MediaRequestStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import {
  MediaRequest,
  RequestPermissionError,
} from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { UserAccessProfile } from '@server/entity/UserAccessProfile';
import { Permission } from '@server/lib/permissions';
import { setupTestDb } from '@server/test/db';

mock.method(MediaRequest, 'sendNotification', async () => undefined);

let subjects: string[] = [];
mock.method(
  OpenLibrary.prototype,
  'getWork',
  async (id: string): Promise<OlWork> => ({
    key: `/works/${id}`,
    title: 'A Book',
    type: { key: '/type/work' },
    subjects,
  })
);

setupTestDb();

const limitedReader = async (permissions: number) => {
  const user = await getRepository(User).findOneOrFail({
    where: { email: 'demo@seerr.dev' },
  });
  user.permissions = permissions;
  await getRepository(User).save(user);
  await getRepository(UserAccessProfile).save(
    new UserAccessProfile({ user, ageLimit: 'teen', includeUnrated: false })
  );
  return user;
};

const requestBook = (user: User, olId: string) =>
  MediaRequest.request(
    { mediaType: MediaType.BOOK, mediaId: olId as unknown as number },
    user
  );

describe('book requests under an age limit', () => {
  it('refuses a book written for adults', async () => {
    subjects = ['Fiction', 'Erotica'];
    const user = await limitedReader(Permission.REQUEST);

    await assert.rejects(requestBook(user, 'OL1W'), RequestPermissionError);
  });

  it('waits for approval even with auto approve', async () => {
    subjects = ['Fantasy'];
    const user = await limitedReader(
      Permission.REQUEST | Permission.AUTO_APPROVE
    );

    const request = await requestBook(user, 'OL2W');
    assert.equal(request.status, MediaRequestStatus.PENDING);
  });

  it('leaves people without a limit alone', async () => {
    subjects = ['Erotica'];
    const user = await getRepository(User).findOneOrFail({
      where: { email: 'demo@seerr.dev' },
    });
    user.permissions = Permission.REQUEST | Permission.AUTO_APPROVE;
    await getRepository(User).save(user);

    const request = await requestBook(user, 'OL3W');
    assert.equal(request.status, MediaRequestStatus.APPROVED);
  });
});
