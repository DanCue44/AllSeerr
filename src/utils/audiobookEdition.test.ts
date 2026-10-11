import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickAudiobookEdition, splitRuntime } from './audiobookEdition';

describe('pickAudiobookEdition', () => {
  it('prefers the edition the book came with', () => {
    const saved = { asin: 'B005V0QI82', narrators: ['Dylan Baker'] };

    assert.deepEqual(
      pickAudiobookEdition(saved, {
        exists: true,
        asin: 'OTHER',
        narrators: ['Someone Else'],
      }),
      saved
    );
  });

  it('falls back to the availability lookup', () => {
    assert.deepEqual(
      pickAudiobookEdition(null, {
        exists: true,
        asin: 'B005V0QI82',
        narrators: ['Dylan Baker'],
        runtimeMinutes: 1518,
      }),
      {
        asin: 'B005V0QI82',
        narrators: ['Dylan Baker'],
        runtimeMinutes: 1518,
        coverUrl: undefined,
      }
    );
    assert.deepEqual(
      pickAudiobookEdition(undefined, { exists: true, asin: 'B0' })?.narrators,
      []
    );
  });

  it('shows nothing without a known edition', () => {
    assert.equal(pickAudiobookEdition(undefined, undefined), undefined);
    assert.equal(pickAudiobookEdition(null, { exists: false }), undefined);
    assert.equal(pickAudiobookEdition(null, { exists: null }), undefined);
  });
});

describe('splitRuntime', () => {
  it('splits minutes into hours and minutes', () => {
    assert.deepEqual(splitRuntime(1518), { hours: 25, minutes: 18 });
    assert.deepEqual(splitRuntime(45), { hours: 0, minutes: 45 });
    assert.deepEqual(splitRuntime(120), { hours: 2, minutes: 0 });
  });
});
