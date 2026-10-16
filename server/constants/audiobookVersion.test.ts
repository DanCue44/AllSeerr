import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getAudiobookVersionsMode,
  resolveAudiobookVersion,
} from '@server/constants/audiobookVersion';

describe('audiobook versions', () => {
  it('applies with TaleArr only, both when not set', () => {
    assert.strictEqual(getAudiobookVersionsMode('talearr', undefined), 'both');
    assert.strictEqual(getAudiobookVersionsMode('talearr', 'nonsense'), 'both');
    assert.strictEqual(
      getAudiobookVersionsMode('talearr', 'requester'),
      'requester'
    );
    assert.strictEqual(getAudiobookVersionsMode('chaptarr', 'both'), undefined);
    assert.strictEqual(getAudiobookVersionsMode(undefined, 'both'), undefined);
  });

  it('resolves the version of a request', () => {
    assert.strictEqual(resolveAudiobookVersion('abridged', 'both'), 'abridged');
    assert.strictEqual(
      resolveAudiobookVersion('unabridged', null),
      'unabridged'
    );
    assert.strictEqual(
      resolveAudiobookVersion('requester', 'unabridged'),
      'unabridged'
    );
    // A requester who picked none gets both, like the default setting
    assert.strictEqual(resolveAudiobookVersion('requester', null), 'both');
    assert.strictEqual(resolveAudiobookVersion('requester', 'x'), 'both');
  });
});
