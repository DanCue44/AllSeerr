import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import AudiobookshelfAPI from '@server/api/audiobookshelf';
import type { AllSettings } from '@server/lib/settings';
import {
  getSettings,
  resolveAudiobookshelfSettings,
} from '@server/lib/settings';
import migrateAudiobookshelfSettings from '@server/lib/settings/migrations/0009_migrate_audiobookshelf_settings';
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
    getSettings().audiobookshelf = { url: '', libraryId: '', apiKey: '' };
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
