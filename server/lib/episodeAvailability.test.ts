import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getEpisodeAvailability } from '@server/lib/episodeAvailability';

const now = new Date('2026-10-10T12:00:00Z');
const base = {
  episodeNumber: 1,
  hasFile: false,
  monitored: true,
  airDateUtc: '2026-10-01T02:00:00Z',
  queued: false,
};

describe('getEpisodeAvailability', () => {
  it('calls an episode with a file available', () => {
    assert.strictEqual(
      getEpisodeAvailability({ ...base, hasFile: true }, now),
      'available'
    );
  });

  it('calls a queued episode downloading', () => {
    assert.strictEqual(
      getEpisodeAvailability({ ...base, queued: true }, now),
      'downloading'
    );
  });

  it('calls an aired monitored episode without a file missing', () => {
    assert.strictEqual(getEpisodeAvailability(base, now), 'missing');
  });

  it('calls an unaired monitored episode wanted', () => {
    assert.strictEqual(
      getEpisodeAvailability(
        { ...base, airDateUtc: '2026-11-01T02:00:00Z' },
        now
      ),
      'wanted'
    );
  });

  it('calls an episode Sonarr does not monitor unmonitored', () => {
    assert.strictEqual(
      getEpisodeAvailability({ ...base, monitored: false }, now),
      'unmonitored'
    );
  });
});
