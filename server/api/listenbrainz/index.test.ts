import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import ExternalAPI from '@server/api/externalapi';
import cacheManager from '@server/lib/cache';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ListenBrainzAPI from '.';
import type { LbLabsSimilarArtist, LbRadioArtistResponse } from './interfaces';

const RADIOHEAD = 'a74b1b7f-71a5-4011-9441-d0b5e4122711';

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));

// Trimmed answers of ListenBrainz for Radiohead
const labsArtists = fixture<LbLabsSimilarArtist[]>('similar-artists.json');
const radioArtists = fixture<LbRadioArtistResponse>('lb-radio-artist.json');

let labsImpl: () => Promise<unknown>;
let radioImpl: () => Promise<unknown>;
const calls: { endpoint: string; ttl?: number }[] = [];

// Answers each endpoint with its fixture, through the transform as the
// cache would
mock.method(
  ExternalAPI.prototype as unknown as {
    get: (
      endpoint: string,
      config?: unknown,
      ttl?: number,
      options?: { transform?: (data: unknown) => unknown }
    ) => Promise<unknown>;
  },
  'get',
  async (
    endpoint: string,
    _config?: unknown,
    ttl?: number,
    options?: { transform?: (data: unknown) => unknown }
  ) => {
    calls.push({ endpoint, ttl });
    const data = endpoint.startsWith('https://labs.')
      ? await labsImpl()
      : await radioImpl();

    return options?.transform ? options.transform(data) : data;
  }
);

describe('ListenBrainzAPI.getSimilarArtists', () => {
  beforeEach(() => {
    calls.length = 0;
    cacheManager.getCache('listenbrainz').flush();
    labsImpl = async () => labsArtists;
    radioImpl = async () => radioArtists;
  });

  it('reads the ranked Labs dataset and caches it for a day', async () => {
    const artists = await new ListenBrainzAPI().getSimilarArtists(RADIOHEAD, 3);

    assert.deepStrictEqual(artists, [
      {
        mbid: '5b11f4ce-a62d-471e-81fc-a69a8278c7da',
        name: 'Nirvana',
        comment: '1980s–1990s US grunge band',
        type: 'Group',
      },
      {
        mbid: '8bfac288-ccc5-448d-9573-c33ea2aa5c30',
        name: 'Red Hot Chili Peppers',
        comment: undefined,
        type: 'Group',
      },
      {
        mbid: '9c9f1380-2516-4fc9-a3e6-f9f61941d090',
        name: 'Muse',
        comment: 'UK rock band',
        type: 'Group',
      },
    ]);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].ttl, 86400);
  });

  it('falls back to the artists of LB Radio, most listened first', async () => {
    labsImpl = async () => {
      throw new Error('Request failed with status code 502');
    };

    const artists = await new ListenBrainzAPI().getSimilarArtists(RADIOHEAD);

    // The seed artist is left out
    assert.deepStrictEqual(
      artists.map((artist) => artist.name),
      ['Arcade Fire', 'The Strokes', 'Tame Impala']
    );
    assert.strictEqual(calls[1].endpoint, `/lb-radio/artist/${RADIOHEAD}`);
    assert.strictEqual(calls[1].ttl, 86400);
  });

  it('throws when both sources fail', async () => {
    labsImpl = async () => {
      throw new Error('timeout of 10000ms exceeded');
    };
    radioImpl = async () => {
      throw new Error('Request failed with status code 503');
    };

    await assert.rejects(
      new ListenBrainzAPI().getSimilarArtists(RADIOHEAD),
      /Failed to fetch similar artists/
    );
  });

  it('reads a Labs answer that is not a list as no artists', async () => {
    labsImpl = async () => ({ error: 'unknown artist' });

    assert.deepStrictEqual(
      await new ListenBrainzAPI().getSimilarArtists(RADIOHEAD),
      []
    );
  });
});
