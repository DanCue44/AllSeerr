import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it, mock } from 'node:test';

import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { UserAppAccount } from '@server/entity/UserAppAccount';
import notificationManager, { Notification } from '@server/lib/notifications';
import { Permission } from '@server/lib/permissions';
import { defaultPlexDefaultAccess, getSettings } from '@server/lib/settings';
import { appUsernameFor, generateAppPassword } from '@server/lib/userAccess';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import authRoutes from '@server/routes/auth';
import userAccessSettingsRoutes from '@server/routes/settings/userAccess';
import userAccessRoutes from '@server/routes/userAccess';
import { setupTestDb } from '@server/test/db';
import {
  startFakeAudiobookshelf,
  startFakeKavita,
  startFakeKomga,
} from '@server/test/fakeApps';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';

let app: Express;

const notifications = mock.method(
  notificationManager,
  'sendNotification',
  () => undefined
);
let abs: Awaited<ReturnType<typeof startFakeAudiobookshelf>>;
let kavita: Awaited<ReturnType<typeof startFakeKavita>>;
let komga: Awaited<ReturnType<typeof startFakeKomga>>;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use(
    '/settings/user-access',
    isAuthenticated(Permission.ADMIN),
    userAccessSettingsRoutes
  );
  app.use(
    '/user-access',
    isAuthenticated(Permission.MANAGE_USERS),
    userAccessRoutes
  );
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ status: err.status ?? 500, message: err.message });
    }
  );
  return app;
}

before(async () => {
  app = createApp();
  abs = await startFakeAudiobookshelf('abs-key');
  kavita = await startFakeKavita('kavita-key');
  komga = await startFakeKomga('komga-key');
});

after(async () => {
  await abs.close();
  await kavita.close();
  await komga.close();
});

setupTestDb();

beforeEach(() => {
  // Each app starts with only its admin
  abs.users.splice(1);
  kavita.members.splice(1);
  komga.users.splice(1);

  const settings = getSettings();
  settings.notifications.agents.email.enabled = false;
  settings.audiobookshelf = { url: '' };
  settings.userAccess = {
    audiobookshelf: { url: abs.url, apiKey: 'abs-key' },
    kavita: { url: kavita.url, apiKey: 'kavita-key' },
    komga: { url: komga.url, apiKey: 'komga-key' },
    emailPasswords: true,
    oidc: { enabled: false, clients: [] },
    plexDefault: defaultPlexDefaultAccess(),
  };
});

async function loginAs(email: string, password = 'test1234') {
  const agent = request.agent(app);
  const res = await agent.post('/auth/local').send({ email, password });

  assert.strictEqual(res.status, 200);
  return agent;
}

describe('app passwords and usernames', () => {
  it('makes readable passwords that differ each time', () => {
    const password = generateAppPassword();
    assert.match(password, /^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
    assert.notEqual(password, generateAppPassword());
  });

  it('names people in the apps after their username', () => {
    assert.equal(
      appUsernameFor(new User({ id: 3, username: 'Sam Smith', email: '' })),
      'SamSmith'
    );
    assert.equal(
      appUsernameFor(
        new User({ id: 4, plexUsername: 'plexkid', email: 'x@example.com' })
      ),
      'plexkid'
    );
    assert.equal(
      appUsernameFor(new User({ id: 5, email: 'reader@example.com' })),
      'reader'
    );
  });
});

describe('user access settings', () => {
  it('never sends the secrets back', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const res = await agent.get('/settings/user-access');

    assert.equal(res.status, 200);
    assert.equal(res.body.kavita.apiKeySet, true);
    assert.equal(res.body.kavita.apiKey, undefined);
    assert.equal(JSON.stringify(res.body).includes('kavita-key'), false);
  });

  it('keeps a saved key when none is sent and removes an empty one', async () => {
    const agent = await loginAs('admin@seerr.dev');

    await agent
      .post('/settings/user-access')
      .send({ kavita: { url: `${kavita.url}/` } })
      .expect(200);
    assert.equal(getSettings().userAccess.kavita.apiKey, 'kavita-key');
    assert.equal(getSettings().userAccess.kavita.url, kavita.url);

    await agent
      .post('/settings/user-access')
      .send({ komga: { apiKey: '' } })
      .expect(200);
    assert.equal(getSettings().userAccess.komga.apiKey, '');
  });

  it('rejects addresses that are not web addresses', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const res = await agent
      .post('/settings/user-access')
      .send({ komga: { url: 'ftp://komga' } });

    assert.equal(res.status, 400);
  });

  it('tests a connection with the saved key and lists libraries', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const res = await agent.post('/settings/user-access/komga/test').send({});

    assert.equal(res.status, 200);
    assert.equal(res.body.version, '1.29.1');
    assert.deepEqual(
      res.body.libraries.map((l: { name: string }) => l.name),
      ['Comics', 'Manga']
    );
  });

  it('is for admins only', async () => {
    const agent = await loginAs('demo@seerr.dev');
    await agent.get('/settings/user-access').expect(403);
    await agent.get('/user-access/people').expect(403);
  });
});

describe('user access people', () => {
  const demoId = async () =>
    (
      await getRepository(User).findOneOrFail({
        where: { email: 'demo@seerr.dev' },
      })
    ).id;

  it('lists everyone with the apps they may use', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const res = await agent.get('/user-access/people');

    assert.equal(res.status, 200);
    const demo = res.body.find(
      (p: { email: string }) => p.email === 'demo@seerr.dev'
    );
    assert.equal(demo.apps.kavita.enabled, false);
    assert.equal(demo.apps.kavita.status, 'none');
    assert.equal(demo.ageLimit, null);
  });

  it('lists the apps and their libraries', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const res = await agent.get('/user-access/apps').expect(200);

    assert.deepEqual(
      res.body.map((a: { app: string; connected: boolean }) => [
        a.app,
        a.connected,
      ]),
      [
        ['audiobookshelf', true],
        ['kavita', true],
        ['komga', true],
      ]
    );
  });

  it('only allows apps when an admin turns them on, and tells the person', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const userId = await demoId();
    notifications.mock.resetCalls();

    const res = await agent
      .post(`/user-access/people/${userId}`)
      .send({ apps: { kavita: { enabled: true } } })
      .expect(200);

    assert.equal(res.body.person.apps.kavita.enabled, true);
    assert.equal(res.body.person.apps.kavita.status, 'none');
    assert.deepEqual(res.body.passwords, {});
    assert.equal(kavita.members.length, 1);

    assert.equal(notifications.mock.callCount(), 1);
    const [type, payload] = notifications.mock.calls[0].arguments;
    assert.equal(type, Notification.ACCESS_GRANTED);
    assert.equal(payload?.notifyUser?.id, userId);
    assert.equal(payload?.actionPath, '/profile/settings/apps?app=kavita');
    assert.equal(
      payload?.message,
      'Your Kavita access is ready. Set it up in one tap.'
    );

    // Saving again tells nobody again
    await agent
      .post(`/user-access/people/${userId}`)
      .send({ apps: { kavita: { enabled: true } } })
      .expect(200);
    assert.equal(notifications.mock.callCount(), 1);
  });

  it('makes accounts with a password shown once, then limits and locks them', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const userId = await demoId();

    await agent
      .post(`/user-access/people/${userId}`)
      .send({
        ageLimit: 'kids',
        apps: {
          kavita: { enabled: true, libraryIds: ['2'] },
          komga: { enabled: true },
          audiobookshelf: { enabled: true },
        },
      })
      .expect(200);

    // The admin makes the accounts now instead of the person
    const passwords: Record<string, { password: string; emailed: boolean }> =
      {};
    for (const name of ['kavita', 'komga', 'audiobookshelf']) {
      const created = await agent
        .post(`/user-access/people/${userId}/apps/${name}/create`)
        .expect(200);
      passwords[name] = created.body.passwords[name];
    }
    const person = await agent.get(`/user-access/people/${userId}`).expect(200);
    const res = { body: { person: person.body, passwords } };

    assert.equal(res.body.person.ageLimit, 'kids');
    assert.equal(res.body.person.apps.kavita.status, 'active');
    assert.equal(res.body.person.apps.kavita.remoteUsername, 'demo');
    assert.equal(res.body.person.apps.komga.remoteUsername, 'demo@seerr.dev');
    for (const name of ['kavita', 'komga', 'audiobookshelf']) {
      assert.match(res.body.passwords[name].password, /^[a-z2-9-]{19}$/);
      assert.equal(res.body.passwords[name].emailed, false);
    }

    const member = kavita.members.find((m) => m.username === 'demo')!;
    assert.equal(member.password, res.body.passwords.kavita.password);
    assert.deepEqual(
      member.libraries.map((l) => l.name),
      ['Manga']
    );
    const komgaUser = komga.users.find((u) => u.email === 'demo@seerr.dev')!;
    assert.deepEqual(komgaUser.ageRestriction, {
      age: 9,
      restriction: 'ALLOW_ONLY',
    });
    const absUser = abs.users.find((u) => u.username === 'demo')!;
    assert.equal(absUser.permissions.accessExplicitContent, false);

    // Nothing is stored that could show the password again
    const stored = await getRepository(UserAppAccount).find();
    assert.equal(
      JSON.stringify(stored).includes(res.body.passwords.kavita.password),
      false
    );

    // Taking access away keeps the accounts but locks them
    const revoked = await agent
      .post(`/user-access/people/${userId}`)
      .send({ apps: { kavita: { enabled: false }, komga: { enabled: false } } })
      .expect(200);

    assert.equal(revoked.body.person.apps.kavita.status, 'disabled');
    assert.deepEqual(revoked.body.passwords, {});
    assert.equal(member.roles.includes('Login'), false);
    assert.deepEqual(komgaUser.roles, []);
  });

  it('links an account that already exists instead of making one', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const userId = await demoId();
    abs.users.push({
      id: 'existing',
      username: 'demo',
      email: null,
      type: 'user',
      isActive: false,
      permissions: {},
    });

    const res = await agent
      .post(`/user-access/people/${userId}`)
      .send({ apps: { audiobookshelf: { enabled: true } } })
      .expect(200);

    assert.equal(res.body.passwords.audiobookshelf, undefined);
    assert.equal(res.body.person.apps.audiobookshelf.status, 'active');
    assert.equal(abs.users.find((u) => u.id === 'existing')?.isActive, true);
  });

  it('records why an app could not be synced', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const userId = await demoId();
    getSettings().userAccess = {
      ...getSettings().userAccess,
      komga: { url: komga.url, apiKey: 'wrong-key' },
    };

    const res = await agent
      .post(`/user-access/people/${userId}`)
      .send({ apps: { komga: { enabled: true } } })
      .expect(200);

    assert.equal(res.body.person.apps.komga.status, 'error');
    assert.match(res.body.person.apps.komga.lastError, /Komga answered 401/);
  });

  it('resets a password and deletes an account', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const userId = await demoId();

    await agent
      .post(`/user-access/people/${userId}`)
      .send({ apps: { komga: { enabled: true } } })
      .expect(200);
    await agent
      .post(`/user-access/people/${userId}/apps/komga/create`)
      .expect(200);

    const reset = await agent
      .post(`/user-access/people/${userId}/apps/komga/password`)
      .expect(200);
    assert.equal(
      komga.users.find((u) => u.email === 'demo@seerr.dev')?.password,
      reset.body.password
    );

    const removed = await agent
      .delete(`/user-access/people/${userId}/apps/komga`)
      .expect(200);
    assert.equal(removed.body.apps.komga.status, 'none');
    assert.equal(removed.body.apps.komga.enabled, false);
    assert.equal(
      komga.users.some((u) => u.email === 'demo@seerr.dev'),
      false
    );
  });

  it('rejects changes that are not valid', async () => {
    const agent = await loginAs('admin@seerr.dev');
    const userId = await demoId();

    await agent
      .post(`/user-access/people/${userId}`)
      .send({ ageLimit: 'toddler' })
      .expect(400);
    await agent
      .post(`/user-access/people/${userId}`)
      .send({ apps: { plex: { enabled: true } } })
      .expect(400);
    await agent.post('/user-access/people/9999').send({}).expect(404);
  });
});
