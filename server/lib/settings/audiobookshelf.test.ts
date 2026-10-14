import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import AudiobookshelfAPI from '@server/api/audiobookshelf';
import type { AllSettings } from '@server/lib/settings';
import {
  getSettings,
  resolveAudiobookshelfSettings,
} from '@server/lib/settings';
import migrateAudiobookshelfSettings from '@server/lib/settings/migrations/0009_migrate_audiobookshelf_settings';
import addAudiobookshelfAuthorMatchSettings from '@server/lib/settings/migrations/0012_add_audiobookshelf_author_match_settings';
import audiobookshelfRoutes from '@server/routes/settings/audiobookshelf';
import express from 'express';
import request from 'supertest';

const ABS_URL = 'https://abs.example.com';
const ABS_LIBRARY = '3f2b8c1e-6a4d-4e9b-8c7a-1d2e3f4a5b6c';

// Settings routes save to the settings file, which tests leave alone
mock.method(getSettings(), 'save', async () => undefined);

describe('0009_migrate_audiobookshelf_settings', () => {
  it('moves the link out of the LazyLibrarian settings', () => {
    const migrated = migrateAudiobookshelfSettings({
      lazylibrarian: {
        hostname: '',
        apiKey: '',
        audiobookshelfUrl: ABS_URL,
        audiobookshelfLibraryId: ABS_LIBRARY,
      },
    });

    assert.deepStrictEqual(migrated.audiobookshelf, {
      url: ABS_URL,
      libraryId: ABS_LIBRARY,
    });
    assert.deepStrictEqual(migrated.lazylibrarian, {
      hostname: '',
      apiKey: '',
    });
  });

  it('keeps values already in the Audiobookshelf block', () => {
    const migrated = migrateAudiobookshelfSettings({
      lazylibrarian: {
        audiobookshelfUrl: 'https://old.example.com',
        audiobookshelfLibraryId: 'old',
      },
      audiobookshelf: { url: ABS_URL, apiKey: 'key' },
    });

    assert.deepStrictEqual(migrated.audiobookshelf, {
      url: ABS_URL,
      libraryId: 'old',
      apiKey: 'key',
    });
    assert.strictEqual(migrated.lazylibrarian.audiobookshelfUrl, undefined);
  });

  it('leaves settings without a LazyLibrarian link alone', () => {
    const settings = { lazylibrarian: {}, main: {} };
    const migrated = migrateAudiobookshelfSettings(structuredClone(settings));

    assert.deepStrictEqual(migrated, settings);
  });
});

describe('0012_add_audiobookshelf_author_match_settings', () => {
  it('adds no admin key and the us region, keeping the rest', () => {
    const migrated = addAudiobookshelfAuthorMatchSettings({
      audiobookshelf: { url: ABS_URL, apiKey: 'key' },
    });

    assert.deepStrictEqual(migrated.audiobookshelf, {
      url: ABS_URL,
      apiKey: 'key',
      adminApiKey: '',
      authorMatchRegion: 'us',
    });
  });

  it('adds the block to settings without one', () => {
    const migrated = addAudiobookshelfAuthorMatchSettings({ main: {} });

    assert.deepStrictEqual(migrated.audiobookshelf, {
      adminApiKey: '',
      authorMatchRegion: 'us',
    });
  });

  it('tidies values written by hand and keeps good ones', () => {
    const migrated = addAudiobookshelfAuthorMatchSettings({
      audiobookshelf: { adminApiKey: ' admin ', authorMatchRegion: 'UK' },
    });

    assert.deepStrictEqual(migrated.audiobookshelf, {
      adminApiKey: 'admin',
      authorMatchRegion: 'uk',
    });

    const reset = addAudiobookshelfAuthorMatchSettings({
      audiobookshelf: { adminApiKey: 'admin', authorMatchRegion: 'mars' },
    });
    assert.strictEqual(reset.audiobookshelf.authorMatchRegion, 'us');

    const settings = {
      audiobookshelf: { adminApiKey: 'admin', authorMatchRegion: 'de' },
    };
    assert.deepStrictEqual(
      addAudiobookshelfAuthorMatchSettings(structuredClone(settings)),
      settings
    );
  });
});

describe('resolveAudiobookshelfSettings', () => {
  it('reads the old LazyLibrarian fields while the block is empty', () => {
    assert.deepStrictEqual(
      resolveAudiobookshelfSettings({
        audiobookshelf: {},
        lazylibrarian: {
          audiobookshelfUrl: ABS_URL,
          audiobookshelfLibraryId: ABS_LIBRARY,
        },
      }),
      { url: ABS_URL, libraryId: ABS_LIBRARY }
    );
  });

  it('prefers the Audiobookshelf block', () => {
    assert.deepStrictEqual(
      resolveAudiobookshelfSettings({
        audiobookshelf: { url: ABS_URL },
        lazylibrarian: { audiobookshelfUrl: 'https://old.example.com' },
      }),
      { url: ABS_URL }
    );
  });

  it('copes with settings files that have neither block', () => {
    assert.deepStrictEqual(
      resolveAudiobookshelfSettings({} as Partial<AllSettings>),
      { url: undefined, libraryId: undefined }
    );
  });
});

describe('/settings/audiobookshelf', () => {
  const app = express();
  app.use(express.json());
  app.use('/settings/audiobookshelf', audiobookshelfRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  );

  let versionImpl: () => Promise<string | undefined>;
  let librariesImpl: () => Promise<{ id: string; name: string }[]>;
  mock.method(AudiobookshelfAPI.prototype, 'getVersion', () => versionImpl());
  mock.method(AudiobookshelfAPI.prototype, 'getLibraries', () =>
    librariesImpl()
  );

  beforeEach(() => {
    versionImpl = async () => '2.17.0';
    librariesImpl = async () => [{ id: ABS_LIBRARY, name: 'Audiobooks' }];
    getSettings().lazylibrarian = {};
    getSettings().audiobookshelf = {
      url: '',
      libraryId: '',
      ebookLibraryId: '',
      apiKey: '',
      adminApiKey: '',
      authorMatchRegion: 'us',
    };
  });

  it('saves the link and clears the old LazyLibrarian fields', async () => {
    getSettings().lazylibrarian = { audiobookshelfUrl: 'https://old.test' };

    const res = await request(app)
      .post('/settings/audiobookshelf')
      .send({ url: `${ABS_URL}/`, libraryId: ABS_LIBRARY });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.url, ABS_URL);
    assert.strictEqual(res.body.libraryId, ABS_LIBRARY);
    assert.strictEqual(
      getSettings().lazylibrarian.audiobookshelfUrl,
      undefined
    );

    const saved = await request(app).get('/settings/audiobookshelf');
    assert.strictEqual(saved.body.url, ABS_URL);
  });

  it('never returns the admin API key, only whether one is saved', async () => {
    const saved = await request(app).post('/settings/audiobookshelf').send({
      url: ABS_URL,
      adminApiKey: ' admin-key ',
      authorMatchRegion: 'uk',
    });

    assert.strictEqual(saved.status, 200);
    assert.strictEqual(saved.body.adminApiKeySet, true);
    assert.strictEqual(saved.body.adminApiKey, undefined);
    assert.strictEqual(saved.body.authorMatchRegion, 'uk');
    assert.strictEqual(getSettings().audiobookshelf.adminApiKey, 'admin-key');

    const read = await request(app).get('/settings/audiobookshelf');
    assert.strictEqual(read.body.adminApiKeySet, true);
    assert.strictEqual(read.body.adminApiKey, undefined);

    // Left out keeps the saved key, empty removes it
    await request(app).post('/settings/audiobookshelf').send({ url: ABS_URL });
    assert.strictEqual(getSettings().audiobookshelf.adminApiKey, 'admin-key');

    const removed = await request(app)
      .post('/settings/audiobookshelf')
      .send({ adminApiKey: '' });
    assert.strictEqual(removed.body.adminApiKeySet, false);
    assert.strictEqual(getSettings().audiobookshelf.adminApiKey, '');
  });

  it('refuses a region Audnexus does not know', async () => {
    const res = await request(app)
      .post('/settings/audiobookshelf')
      .send({ authorMatchRegion: 'mars' });

    assert.strictEqual(res.status, 400);
  });

  it('refuses to match authors without an admin API key', async () => {
    getSettings().audiobookshelf = { url: ABS_URL, libraryId: ABS_LIBRARY };

    const res = await request(app).post(
      '/settings/audiobookshelf/match-authors'
    );

    assert.strictEqual(res.status, 400);
  });

  it('refuses an address that is not a web URL', async () => {
    const res = await request(app)
      .post('/settings/audiobookshelf')
      .send({ url: 'ftp://books' });

    assert.strictEqual(res.status, 400);
  });

  it('tests the server and lists libraries only with an API key', async () => {
    const withoutKey = await request(app)
      .post('/settings/audiobookshelf/test')
      .send({ url: ABS_URL });

    assert.strictEqual(withoutKey.status, 200);
    assert.deepStrictEqual(withoutKey.body, { version: '2.17.0' });

    const withKey = await request(app)
      .post('/settings/audiobookshelf/test')
      .send({ url: ABS_URL, apiKey: 'key' });

    assert.deepStrictEqual(withKey.body.libraries, [
      { id: ABS_LIBRARY, name: 'Audiobooks' },
    ]);
  });

  it('reports a server that does not answer', async () => {
    versionImpl = async () => {
      throw new Error('ECONNREFUSED');
    };

    const res = await request(app)
      .post('/settings/audiobookshelf/test')
      .send({ url: ABS_URL });

    assert.strictEqual(res.status, 500);
  });
});
