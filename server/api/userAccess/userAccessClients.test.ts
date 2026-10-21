import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { AudiobookshelfAdminAPI } from '@server/api/userAccess/audiobookshelfAdmin';
import {
  KavitaAdminAPI,
  parseKavitaInviteLink,
} from '@server/api/userAccess/kavitaAdmin';
import { KomgaAdminAPI } from '@server/api/userAccess/komgaAdmin';
import { matchAccount } from '@server/api/userAccess/types';
import { KavitaAgeRating } from '@server/lib/userAccess/ageLimits';
import {
  startFakeAudiobookshelf,
  startFakeKavita,
  startFakeKomga,
} from '@server/test/fakeApps';

const access = {
  enabled: true,
  libraryIds: null,
  ageLimit: null,
  includeUnrated: false,
} as const;

describe('matchAccount', () => {
  const accounts = [
    { id: '1', username: 'Sam', email: 'sam@example.com' },
    { id: '2', username: 'alex', email: 'Alex@Example.com' },
  ];

  it('matches by id, then username, then email, ignoring case', () => {
    assert.equal(matchAccount(accounts, { remoteUserId: '2' })?.id, '2');
    assert.equal(matchAccount(accounts, { username: 'sam' })?.id, '1');
    assert.equal(
      matchAccount(accounts, { username: 'nobody', email: 'alex@example.com' })
        ?.id,
      '2'
    );
    assert.equal(matchAccount(accounts, { username: 'nobody' }), null);
  });
});

describe('parseKavitaInviteLink', () => {
  it('reads the token and email of an invite link', () => {
    assert.deepEqual(
      parseKavitaInviteLink(
        'http://kavita:5000/registration/confirm-email?token=a%2Bb&email=kid%40example.com'
      ),
      { token: 'a+b', email: 'kid@example.com' }
    );
    assert.equal(parseKavitaInviteLink('http://kavita/'), null);
  });
});

describe('AudiobookshelfAdminAPI', () => {
  let abs: Awaited<ReturnType<typeof startFakeAudiobookshelf>>;
  let client: AudiobookshelfAdminAPI;

  before(async () => {
    abs = await startFakeAudiobookshelf('abs-key');
    client = new AudiobookshelfAdminAPI({ url: abs.url, apiKey: 'abs-key' });
  });
  after(() => abs.close());

  it('checks that the key belongs to an admin', async () => {
    assert.deepEqual(await client.test(), { version: '2.37.1' });
    await assert.rejects(
      new AudiobookshelfAdminAPI({ url: abs.url, apiKey: 'wrong' }).test(),
      /answered 401/
    );
  });

  it('makes a listener account and turns it off without access', async () => {
    const account = await client.createAccount({
      ...access,
      ageLimit: 'teen',
      libraryIds: ['lib-audio'],
      username: 'sam',
      email: 'sam@example.com',
      password: 'pw-1234',
    });
    const user = abs.users.find((u) => u.id === account.id)!;

    assert.equal(user.type, 'user');
    assert.equal(user.isActive, true);
    assert.equal(user.permissions.accessAllLibraries, false);
    assert.deepEqual(user.permissions.librariesAccessible, ['lib-audio']);
    // Any age limit hides explicit books
    assert.equal(user.permissions.accessExplicitContent, false);
    assert.equal(user.permissions.update, false);

    await client.updateAccount(account, { ...access, enabled: false });
    assert.equal(user.isActive, false);
    assert.equal(user.permissions.accessAllLibraries, true);

    await client.setPassword(account, 'pw-5678');
    assert.equal(user.password, 'pw-5678');

    assert.equal(
      (await client.findAccount({ email: 'SAM@example.com' }))?.id,
      account.id
    );
    await client.deleteAccount(account);
    assert.equal(await client.findAccount({ username: 'sam' }), null);
  });

  it('leaves the root user alone', async () => {
    await client.updateAccount(
      { id: 'root', username: 'root' },
      { ...access, enabled: false }
    );
    assert.equal(abs.users.find((u) => u.id === 'root')?.isActive, true);
  });
});

describe('KavitaAdminAPI', () => {
  let kavita: Awaited<ReturnType<typeof startFakeKavita>>;
  let client: KavitaAdminAPI;

  before(async () => {
    kavita = await startFakeKavita('kavita-key');
    client = new KavitaAdminAPI({ url: kavita.url, apiKey: 'kavita-key' });
  });
  after(() => kavita.close());

  it('signs in with the API key and lists the libraries', async () => {
    assert.deepEqual(await client.test(), { version: '0.9.1.4' });
    assert.deepEqual(await client.getLibraries(), [
      { id: '1', name: 'Comics' },
      { id: '2', name: 'Manga' },
    ]);
  });

  it('invites, confirms and then limits a new reader', async () => {
    const account = await client.createAccount({
      ...access,
      ageLimit: 'kids',
      libraryIds: ['2'],
      username: 'kid',
      email: 'kid@example.com',
      password: 'pw-1234',
    });
    const member = kavita.members.find((m) => String(m.id) === account.id)!;

    assert.equal(account.username, 'kid');
    assert.equal(member.isPending, false);
    assert.equal(member.password, 'pw-1234');
    assert.deepEqual(
      member.libraries.map((l) => l.name),
      ['Manga']
    );
    assert.deepEqual(member.ageRestriction, {
      ageRating: KavitaAgeRating.G,
      includeUnknowns: false,
    });
    assert.ok(member.roles.includes('Login'));

    // All libraries is every library Kavita has
    await client.updateAccount(account, { ...access, ageLimit: 'kids' });
    assert.deepEqual(
      member.libraries.map((l) => l.id),
      [1, 2]
    );

    // Without access the account stays but cannot sign in
    await client.updateAccount(account, { ...access, enabled: false });
    assert.equal(member.roles.includes('Login'), false);
    assert.deepEqual(member.libraries, []);
  });

  it('signs in again when its token expired', async () => {
    kavita.expireTokens();
    assert.ok((await client.getLibraries()).length > 0);
  });

  it('never changes an admin', async () => {
    await client.updateAccount(
      { id: '1', username: 'admin' },
      { ...access, enabled: false }
    );
    assert.deepEqual(kavita.members[0].roles, ['Admin']);
  });

  it('resets passwords and deletes accounts', async () => {
    const account = (await client.findAccount({ username: 'kid' }))!;
    await client.setPassword(account, 'pw-9999');
    assert.equal(
      kavita.members.find((m) => m.username === 'kid')?.password,
      'pw-9999'
    );
    await client.deleteAccount(account);
    assert.equal(await client.findAccount({ username: 'kid' }), null);
  });
});

describe('KomgaAdminAPI', () => {
  let komga: Awaited<ReturnType<typeof startFakeKomga>>;
  let client: KomgaAdminAPI;

  before(async () => {
    komga = await startFakeKomga('komga-key');
    client = new KomgaAdminAPI({ url: komga.url, apiKey: 'komga-key' });
  });
  after(() => komga.close());

  it('checks that the key belongs to an admin', async () => {
    assert.deepEqual(await client.test(), { version: '1.29.1' });
  });

  it('makes a reader by email and turns it off without access', async () => {
    const account = await client.createAccount({
      ...access,
      ageLimit: 'tween',
      includeUnrated: true,
      libraryIds: ['km'],
      username: 'kid',
      email: 'kid@example.com',
      password: 'pw-1234',
    });
    const user = komga.users.find((u) => u.id === account.id)!;

    assert.equal(account.username, 'kid@example.com');
    assert.deepEqual(user.roles, ['PAGE_STREAMING', 'FILE_DOWNLOAD']);
    assert.equal(user.sharedAllLibraries, false);
    assert.deepEqual(user.sharedLibrariesIds, ['km']);
    assert.deepEqual(user.ageRestriction, { age: 13, restriction: 'EXCLUDE' });

    await client.updateAccount(account, { ...access, enabled: false });
    assert.deepEqual(user.roles, []);
    assert.deepEqual(user.sharedLibrariesIds, []);
    assert.equal(user.sharedAllLibraries, false);

    await client.setPassword(account, 'pw-5678');
    assert.equal(user.password, 'pw-5678');
    await client.deleteAccount(account);
    assert.equal(await client.findAccount({ email: 'kid@example.com' }), null);
  });

  it('gives a local user without email an address Komga accepts', async () => {
    const account = await client.createAccount({
      ...access,
      username: 'nomail',
      password: 'pw-1234',
    });
    assert.equal(account.username, 'nomail@allseerr.invalid');
  });
});
