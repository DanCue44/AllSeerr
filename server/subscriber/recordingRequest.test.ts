import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import OpenLibrary from '@server/api/openlibrary';
import type { OlWork } from '@server/api/openlibrary/interfaces';
import type {
  ChaptarrBook,
  TalearrAddRecordingBody,
  TalearrAddRecordingResult,
  TalearrRecording,
  TalearrRecordings,
} from '@server/api/servarr/chaptarr';
import ChaptarrAPI from '@server/api/servarr/chaptarr';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import notificationManager, { Notification } from '@server/lib/notifications';
import { Permission } from '@server/lib/permissions';
import type { ChaptarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import {
  getBookRecordings,
  syncRecordingRequests,
} from '@server/lib/talearrRecordings';
import { checkUser } from '@server/middleware/auth';
import authRoutes from '@server/routes/auth';
import requestRoutes from '@server/routes/request';
import { settleTestBackgroundTasks, setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';

const WORK_ID = 'OL66554W';
// Talearr's book id of the available, abridged audiobook
const AUDIOBOOK_ID = 3401;

const sendNotificationMock = mock.method(
  MediaRequest,
  'sendNotification',
  async () => undefined
).mock;
const notificationManagerMock = mock.method(
  notificationManager,
  'sendNotification',
  () => undefined
).mock;

mock.method(
  OpenLibrary.prototype,
  'getWork',
  async (workId: string): Promise<OlWork> => ({
    key: `/works/${workId}`,
    title: 'The Firm',
    type: { key: '/type/work' },
    authors: [],
  })
);
mock.method(OpenLibrary.prototype, 'getWorkSummary', async () => ({
  key: `/works/${WORK_ID}`,
  title: 'The Firm',
  author_name: ['John Grisham'],
}));

// What Talearr answers and what it was asked
let addCalls: TalearrAddRecordingBody[] = [];
let addImpl: (
  body: TalearrAddRecordingBody
) => Promise<TalearrAddRecordingResult>;
let recordingsView: TalearrRecordings | undefined;

const recording = (fields: Partial<TalearrRecording>): TalearrRecording => ({
  bookId: 4100,
  role: 'additional',
  editionId: 28705,
  narrators: ['Scott Brick'],
  abridged: 'unabridged',
  monitored: true,
  hasFiles: false,
  ...fields,
});

mock.method(
  ChaptarrAPI.prototype,
  'addTalearrRecording',
  async (body: TalearrAddRecordingBody) => {
    addCalls.push(body);
    return addImpl(body);
  }
);
mock.method(
  ChaptarrAPI.prototype,
  'getTalearrRecordings',
  async () => recordingsView
);

const talearrServer: ChaptarrSettings = {
  id: 0,
  name: 'Talearr',
  hostname: 'talearr',
  port: 8789,
  apiKey: 'test-key',
  useSsl: false,
  activeProfileId: 1,
  activeProfileName: 'E-Book',
  activeDirectory: '/ebooks',
  activeMetadataProfileId: 2,
  activeMetadataProfileName: 'Ebook Default',
  activeAudiobookProfileId: 2,
  activeAudiobookProfileName: 'Audiobook',
  activeAudiobookMetadataProfileId: 1,
  activeAudiobookMetadataProfileName: 'Audiobook Default',
  activeAudiobookDirectory: '/audiobooks',
  tags: [],
  is4k: false,
  isDefault: true,
  syncEnabled: true,
  preventSearch: false,
  tagRequests: false,
  overrideRule: [],
};

function configureTalearr(service: 'talearr' | 'chaptarr' = 'talearr') {
  const settings = getSettings();
  settings.chaptarr = [{ ...talearrServer }];
  settings.main.bookService = service;
}

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/request', requestRoutes);
  return app;
}

async function loginAs(email: string) {
  const settings = getSettings();
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent
      .post('/auth/local')
      .send({ email, password: 'test1234' });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

async function waitFor(check: () => Promise<boolean> | boolean) {
  await settleTestBackgroundTasks();
  for (let i = 0; i < 100; i++) {
    if (await check()) {
      await settleTestBackgroundTasks();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('Condition was not met in time');
}

// The library has the abridged audiobook, from Talearr
async function seedAvailableAudiobook(
  fields: Partial<Media> = {}
): Promise<Media> {
  return getRepository(Media).save(
    new Media({
      olId: WORK_ID,
      mediaType: MediaType.BOOK,
      status: MediaStatus.UNKNOWN,
      statusAudio: MediaStatus.AVAILABLE,
      serviceId: 0,
      externalServiceIdAudio: AUDIOBOOK_ID,
      foreignBookId: 'hc:149559',
      ...fields,
    })
  );
}

const findRequest = (id: number) =>
  getRepository(MediaRequest).findOneOrFail({ where: { id } });

const findMedia = () =>
  getRepository(Media).findOneOrFail({
    where: { olId: WORK_ID, mediaType: MediaType.BOOK },
  });

const unabridgedBody = {
  mediaType: MediaType.BOOK,
  mediaId: WORK_ID,
  isAudiobook: true,
  recording: 'unabridged',
};

async function setRequester(permissions: number) {
  const repository = getRepository(User);
  const user = await repository.findOneOrFail({
    where: { email: 'demo@seerr.dev' },
  });
  user.permissions = permissions;
  await repository.save(user);
}

before(() => {
  app = createApp();
});

setupTestDb();

beforeEach(() => {
  addCalls = [];
  recordingsView = undefined;
  addImpl = async () => ({
    status: 'created',
    searchQueued: true,
    recording: recording({}),
  });
  sendNotificationMock.resetCalls();
  notificationManagerMock.resetCalls();
  configureTalearr();
});

afterEach(() => {
  getSettings().chaptarr = [];
  getSettings().main.bookService = undefined;
});

describe('recording requests', () => {
  it('waits for approval and leaves the audiobook status alone', async () => {
    await seedAvailableAudiobook();
    await setRequester(Permission.REQUEST);
    const agent = await loginAs('demo@seerr.dev');

    const res = await agent.post('/request').send(unabridgedBody);

    assert.strictEqual(res.status, 201, res.body.message);
    assert.strictEqual(res.body.status, MediaRequestStatus.PENDING);
    assert.strictEqual(res.body.recording, 'unabridged');
    assert.strictEqual(res.body.isAudiobook, true);
    await settleTestBackgroundTasks();
    assert.strictEqual(addCalls.length, 0);
    assert.strictEqual((await findMedia()).statusAudio, MediaStatus.AVAILABLE);
    assert.ok(
      sendNotificationMock.calls.some(
        (call) => call.arguments[2] === Notification.MEDIA_PENDING
      )
    );
  });

  it('sends the approved request to Talearr with the request id', async () => {
    await seedAvailableAudiobook();
    await setRequester(Permission.REQUEST);
    const user = await loginAs('demo@seerr.dev');
    const created = await user.post('/request').send(unabridgedBody);

    const admin = await loginAs('admin@seerr.dev');
    const approved = await admin.post(`/request/${created.body.id}/approve`);
    assert.strictEqual(approved.status, 200, approved.body.message);

    await waitFor(
      async () => (await findRequest(created.body.id)).recordingBookId === 4100
    );

    assert.deepStrictEqual(addCalls, [
      {
        bookId: AUDIOBOOK_ID,
        kind: 'unabridged',
        search: true,
        requestedBy: 'allseerr',
        externalRef: String(created.body.id),
      },
    ]);

    const saved = await findRequest(created.body.id);
    assert.strictEqual(saved.status, MediaRequestStatus.APPROVED);
    assert.strictEqual(saved.recordingNarrator, 'Scott Brick');
    assert.strictEqual((await findMedia()).statusAudio, MediaStatus.AVAILABLE);
    // Approving does not report the available abridged audiobook
    assert.ok(
      !sendNotificationMock.calls.some(
        (call) => call.arguments[2] === Notification.MEDIA_AVAILABLE
      )
    );
  });

  it('is approved right away for users who may auto-approve', async () => {
    await seedAvailableAudiobook();
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin.post('/request').send({
      ...unabridgedBody,
      recording: 'narrator',
      recordingNarrator: '  D.W.   Moffett ',
    });

    assert.strictEqual(res.status, 201, res.body.message);
    assert.strictEqual(res.body.status, MediaRequestStatus.APPROVED);
    await waitFor(() => addCalls.length === 1);
    assert.strictEqual(addCalls[0].kind, 'narrator');
    assert.strictEqual(addCalls[0].narrator, 'D.W. Moffett');
    await waitFor(
      async () => (await findRequest(res.body.id)).recordingBookId === 4100
    );
    // The narrator asked for is kept
    assert.strictEqual(
      (await findRequest(res.body.id)).recordingNarrator,
      'D.W. Moffett'
    );
  });

  it('asks for the first edition when several fit equally well', async () => {
    await seedAvailableAudiobook();
    addImpl = async (body) =>
      body.kind === 'edition'
        ? {
            status: 'created',
            searchQueued: true,
            recording: recording({ editionId: body.editionId }),
          }
        : {
            status: 'ambiguous',
            message: 'Several editions fit equally well',
            candidates: [
              { editionId: 31, narrators: ['A'], abridged: 'unabridged' },
              { editionId: 32, narrators: ['B'], abridged: 'unabridged' },
            ],
          };

    const admin = await loginAs('admin@seerr.dev');
    const res = await admin.post('/request').send(unabridgedBody);

    await waitFor(
      async () => (await findRequest(res.body.id)).recordingBookId === 4100
    );
    assert.deepStrictEqual(
      addCalls.map((call) => [call.kind, call.editionId]),
      [
        ['unabridged', undefined],
        ['edition', 31],
      ]
    );
  });

  it('fails when Talearr knows no fitting edition', async () => {
    await seedAvailableAudiobook();
    addImpl = async () => ({
      status: 'nomatch',
      message: 'No unabridged edition is known for this book',
      candidates: [],
    });

    const admin = await loginAs('admin@seerr.dev');
    const res = await admin.post('/request').send(unabridgedBody);

    await waitFor(
      async () =>
        (await findRequest(res.body.id)).status === MediaRequestStatus.FAILED
    );
    assert.ok(
      sendNotificationMock.calls.some(
        (call) => call.arguments[2] === Notification.MEDIA_FAILED
      )
    );
    assert.strictEqual((await findMedia()).statusAudio, MediaStatus.AVAILABLE);
  });

  it('fails when Talearr cannot be reached', async () => {
    await seedAvailableAudiobook();
    addImpl = async () => {
      throw new Error('connect ECONNREFUSED');
    };

    const admin = await loginAs('admin@seerr.dev');
    const res = await admin.post('/request').send(unabridgedBody);

    await waitFor(
      async () =>
        (await findRequest(res.body.id)).status === MediaRequestStatus.FAILED
    );
  });

  it('completes right away when Talearr has the recording with files', async () => {
    await seedAvailableAudiobook();
    addImpl = async () => ({
      status: 'existing',
      searchQueued: false,
      recording: recording({ hasFiles: true }),
    });

    const admin = await loginAs('admin@seerr.dev');
    const res = await admin.post('/request').send(unabridgedBody);

    await waitFor(
      async () =>
        (await findRequest(res.body.id)).status === MediaRequestStatus.COMPLETED
    );
    assert.ok(
      notificationManagerMock.calls.some(
        (call) =>
          call.arguments[0] === Notification.MEDIA_AVAILABLE &&
          call.arguments[1]?.event ===
            'Unabridged Audiobook Request Now Available'
      )
    );
  });

  it('declines without touching the audiobook status', async () => {
    await seedAvailableAudiobook();
    await setRequester(Permission.REQUEST);
    const user = await loginAs('demo@seerr.dev');
    const created = await user.post('/request').send(unabridgedBody);

    const admin = await loginAs('admin@seerr.dev');
    const declined = await admin
      .post(`/request/${created.body.id}/decline`)
      .send({ reason: 'Not now' });

    assert.strictEqual(declined.status, 200, declined.body.message);
    assert.strictEqual((await findMedia()).statusAudio, MediaStatus.AVAILABLE);
    assert.strictEqual(addCalls.length, 0);
  });

  it('refuses a recording that was requested already', async () => {
    await seedAvailableAudiobook();
    await setRequester(Permission.REQUEST);
    const agent = await loginAs('demo@seerr.dev');

    await agent.post('/request').send(unabridgedBody);
    const again = await agent.post('/request').send(unabridgedBody);
    assert.strictEqual(again.status, 409);

    // Another narrator is another recording
    const narrator = await agent.post('/request').send({
      ...unabridgedBody,
      recording: 'narrator',
      recordingNarrator: 'D.W. Moffett',
    });
    assert.strictEqual(narrator.status, 201, narrator.body.message);

    // The audiobook itself is still covered by the book's own requests
    const audiobook = await agent
      .post('/request')
      .send({ mediaType: MediaType.BOOK, mediaId: WORK_ID, isAudiobook: true });
    assert.strictEqual(audiobook.status, 201, audiobook.body.message);
  });

  it('refuses recordings unless Talearr has the audiobook', async () => {
    const admin = await loginAs('admin@seerr.dev');

    // No audiobook yet
    const missing = await admin.post('/request').send(unabridgedBody);
    assert.strictEqual(missing.status, 400);

    await seedAvailableAudiobook();

    // Stock Chaptarr keeps one recording
    configureTalearr('chaptarr');
    const chaptarr = await admin.post('/request').send(unabridgedBody);
    assert.strictEqual(chaptarr.status, 400);

    configureTalearr();
    const noNarrator = await admin
      .post('/request')
      .send({ ...unabridgedBody, recording: 'narrator' });
    assert.strictEqual(noNarrator.status, 400);

    const noEdition = await admin
      .post('/request')
      .send({ ...unabridgedBody, recording: 'edition' });
    assert.strictEqual(noEdition.status, 400);

    const ebook = await admin
      .post('/request')
      .send({ ...unabridgedBody, isAudiobook: false });
    assert.strictEqual(ebook.status, 400);
  });

  it('needs book request permission', async () => {
    await seedAvailableAudiobook();
    await setRequester(Permission.REQUEST_MOVIE);
    const agent = await loginAs('demo@seerr.dev');

    const res = await agent.post('/request').send(unabridgedBody);
    assert.strictEqual(res.status, 403);
  });

  it('is not completed by the audiobook status of the book', async () => {
    const media = await seedAvailableAudiobook({
      statusAudio: MediaStatus.AVAILABLE,
    });
    const admin = await loginAs('admin@seerr.dev');
    const res = await admin.post('/request').send(unabridgedBody);
    await waitFor(
      async () => (await findRequest(res.body.id)).recordingBookId === 4100
    );

    // The scan marks the audiobook deleted and back
    media.statusAudio = MediaStatus.DELETED;
    await getRepository(Media).save(media);
    media.statusAudio = MediaStatus.AVAILABLE;
    await getRepository(Media).save(media);

    assert.strictEqual(
      (await findRequest(res.body.id)).status,
      MediaRequestStatus.APPROVED
    );
  });
});

describe('abridged recording requests', () => {
  const abridgedBody = { ...unabridgedBody, recording: 'abridged' };

  it('goes through approval to Talearr and names the abridged audiobook', async () => {
    // The library has the unabridged audiobook this time
    await seedAvailableAudiobook();
    addImpl = async () => ({
      status: 'created',
      searchQueued: true,
      recording: recording({
        narrators: ['D.W. Moffett'],
        abridged: 'abridged',
      }),
    });
    await setRequester(Permission.REQUEST);
    const user = await loginAs('demo@seerr.dev');

    const created = await user.post('/request').send(abridgedBody);
    assert.strictEqual(created.status, 201, created.body.message);
    assert.strictEqual(created.body.status, MediaRequestStatus.PENDING);
    assert.strictEqual(created.body.recording, 'abridged');
    await settleTestBackgroundTasks();
    assert.strictEqual(addCalls.length, 0);

    const admin = await loginAs('admin@seerr.dev');
    const approved = await admin.post(`/request/${created.body.id}/approve`);
    assert.strictEqual(approved.status, 200, approved.body.message);

    await waitFor(
      async () => (await findRequest(created.body.id)).recordingBookId === 4100
    );
    assert.deepStrictEqual(addCalls, [
      {
        bookId: AUDIOBOOK_ID,
        kind: 'abridged',
        search: true,
        requestedBy: 'allseerr',
        externalRef: String(created.body.id),
      },
    ]);
    assert.strictEqual(
      (await findRequest(created.body.id)).status,
      MediaRequestStatus.APPROVED
    );

    // The scan finds the files of the abridged recording
    await syncRecordingRequests(
      [0],
      [
        {
          id: 4100,
          title: 'The Firm',
          foreignBookId: 'hc:149559',
          monitored: true,
          mediaType: 'audiobook',
          statistics: { bookFileCount: 1 },
        },
        {
          id: AUDIOBOOK_ID,
          title: 'The Firm',
          foreignBookId: 'hc:149559',
          monitored: true,
          mediaType: 'audiobook',
          statistics: { bookFileCount: 1 },
        },
      ]
    );
    await waitFor(
      async () =>
        (await findRequest(created.body.id)).status ===
        MediaRequestStatus.COMPLETED
    );

    const available = notificationManagerMock.calls.find(
      (call) => call.arguments[0] === Notification.MEDIA_AVAILABLE
    );
    assert.ok(available);
    assert.strictEqual(
      available.arguments[1]?.event,
      'Abridged Audiobook Request Now Available'
    );
    assert.deepStrictEqual(
      available.arguments[1]?.extra?.find(
        (field: { name: string }) => field.name === 'Recording'
      ),
      { name: 'Recording', value: 'Abridged, narrated by D.W. Moffett' }
    );
    assert.strictEqual((await findMedia()).statusAudio, MediaStatus.AVAILABLE);
  });

  it('is refused while the same abridged recording is requested', async () => {
    await seedAvailableAudiobook();
    await setRequester(Permission.REQUEST);
    const agent = await loginAs('demo@seerr.dev');

    const first = await agent.post('/request').send(abridgedBody);
    assert.strictEqual(first.status, 201, first.body.message);
    const again = await agent.post('/request').send(abridgedBody);
    assert.strictEqual(again.status, 409);

    // The unabridged recording is asked for on its own
    const unabridged = await agent.post('/request').send(unabridgedBody);
    assert.strictEqual(unabridged.status, 201, unabridged.body.message);
  });

  it('can be declined and asked for again', async () => {
    await seedAvailableAudiobook();
    await setRequester(Permission.REQUEST);
    const user = await loginAs('demo@seerr.dev');
    const created = await user.post('/request').send(abridgedBody);

    const admin = await loginAs('admin@seerr.dev');
    const declined = await admin
      .post(`/request/${created.body.id}/decline`)
      .send({ reason: 'Not now' });
    assert.strictEqual(declined.status, 200, declined.body.message);
    assert.strictEqual(addCalls.length, 0);

    const again = await user.post('/request').send(abridgedBody);
    assert.strictEqual(again.status, 201, again.body.message);
  });
});

describe('recording requests in the Talearr scan', () => {
  const book = (id: number, files: number): ChaptarrBook => ({
    id,
    title: 'The Firm',
    foreignBookId: 'hc:149559',
    monitored: true,
    mediaType: 'audiobook',
    statistics: { bookFileCount: files },
  });

  it('completes a request once its recording has files', async () => {
    await seedAvailableAudiobook();
    const admin = await loginAs('admin@seerr.dev');
    const res = await admin.post('/request').send(unabridgedBody);
    await waitFor(
      async () => (await findRequest(res.body.id)).recordingBookId === 4100
    );

    assert.strictEqual(
      await syncRecordingRequests([0], [book(AUDIOBOOK_ID, 1), book(4100, 0)]),
      0
    );
    assert.strictEqual(
      (await findRequest(res.body.id)).status,
      MediaRequestStatus.APPROVED
    );

    assert.strictEqual(
      await syncRecordingRequests([0], [book(AUDIOBOOK_ID, 1), book(4100, 1)]),
      1
    );
    assert.strictEqual(
      (await findRequest(res.body.id)).status,
      MediaRequestStatus.COMPLETED
    );
  });

  it('fails a request whose recording Talearr no longer has', async () => {
    await seedAvailableAudiobook();
    const admin = await loginAs('admin@seerr.dev');
    const res = await admin.post('/request').send(unabridgedBody);
    await waitFor(
      async () => (await findRequest(res.body.id)).recordingBookId === 4100
    );

    await syncRecordingRequests([0], [book(AUDIOBOOK_ID, 1)]);
    assert.strictEqual(
      (await findRequest(res.body.id)).status,
      MediaRequestStatus.FAILED
    );
  });

  it('leaves requests alone with another book service', async () => {
    await seedAvailableAudiobook();
    const admin = await loginAs('admin@seerr.dev');
    const res = await admin.post('/request').send(unabridgedBody);
    await waitFor(
      async () => (await findRequest(res.body.id)).recordingBookId === 4100
    );

    configureTalearr('chaptarr');
    assert.strictEqual(await syncRecordingRequests([0], [book(4100, 1)]), 0);
    assert.strictEqual(
      (await findRequest(res.body.id)).status,
      MediaRequestStatus.APPROVED
    );
  });
});

describe('book recordings', () => {
  const primary = recording({
    bookId: AUDIOBOOK_ID,
    role: 'primary',
    narrators: ['D.W. Moffett'],
    abridged: 'abridged',
    hasFiles: true,
  });

  it('lists what can still be asked for', async () => {
    const media = await seedAvailableAudiobook();
    const admin = await getRepository(User).findOneOrFail({
      where: { email: 'admin@seerr.dev' },
    });
    recordingsView = {
      recordings: [primary],
      candidates: [
        {
          editionId: 28705,
          narrators: ['Scott Brick'],
          abridged: 'unabridged',
        },
        {
          editionId: 28706,
          narrators: ['d.w. moffett'],
          abridged: 'unknown',
        },
      ],
    };

    const info = await getBookRecordings(media, admin);

    assert.strictEqual(info.supported, true);
    assert.strictEqual(info.canRequest, true);
    assert.deepStrictEqual(info.options.unabridged, { available: true });
    assert.deepStrictEqual(info.options.abridged, {
      available: false,
      reason: 'have',
    });
    // The narrator of the primary recording is not another narrator
    assert.deepStrictEqual(info.options.narrator, {
      available: true,
      narrators: ['Scott Brick'],
    });
    assert.strictEqual(info.recordings[0].status, MediaStatus.AVAILABLE);
  });

  it('closes the unabridged option once it is requested', async () => {
    const media = await seedAvailableAudiobook();
    recordingsView = {
      recordings: [primary],
      candidates: [
        {
          editionId: 28705,
          narrators: ['Scott Brick'],
          abridged: 'unabridged',
        },
      ],
    };
    await setRequester(Permission.REQUEST);
    const agent = await loginAs('demo@seerr.dev');
    await agent.post('/request').send(unabridgedBody);

    const user = await getRepository(User).findOneOrFail({
      where: { email: 'demo@seerr.dev' },
    });
    const info = await getBookRecordings(media, user);

    assert.deepStrictEqual(info.options.unabridged, {
      available: false,
      reason: 'requested',
    });
    assert.strictEqual(info.requests.length, 1);
    assert.strictEqual(info.requests[0].status, MediaRequestStatus.PENDING);
    assert.strictEqual(info.requests[0].recording, 'unabridged');
  });

  it('offers the abridged recording when the library has the unabridged one', async () => {
    const media = await seedAvailableAudiobook();
    const admin = await getRepository(User).findOneOrFail({
      where: { email: 'admin@seerr.dev' },
    });
    recordingsView = {
      recordings: [{ ...primary, abridged: 'unabridged' }],
      candidates: [
        {
          editionId: 28707,
          narrators: ['D.W. Moffett'],
          abridged: 'abridged',
        },
      ],
    };

    const info = await getBookRecordings(media, admin);

    assert.deepStrictEqual(info.options.abridged, { available: true });
    assert.deepStrictEqual(info.options.unabridged, {
      available: false,
      reason: 'have',
    });
  });

  it('says why recordings are not offered', async () => {
    const admin = await getRepository(User).findOneOrFail({
      where: { email: 'admin@seerr.dev' },
    });

    assert.strictEqual(
      (await getBookRecordings(null, admin)).reason,
      'unavailable'
    );

    const media = await seedAvailableAudiobook();
    // Stock Chaptarr has no recordings route
    recordingsView = undefined;
    assert.strictEqual(
      (await getBookRecordings(media, admin)).reason,
      'unsupported'
    );

    configureTalearr('chaptarr');
    assert.strictEqual(
      (await getBookRecordings(media, admin)).reason,
      'service'
    );
  });
});
