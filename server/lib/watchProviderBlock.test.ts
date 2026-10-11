import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  findBlockingProviders,
  parseBlockedWatchProviders,
} from '@server/lib/watchProviderBlock';

const providers = {
  US: {
    flatrate: [
      { provider_id: 8, provider_name: 'Netflix' },
      { provider_id: 538, provider_name: 'Plex' },
    ],
    buy: [{ provider_id: 2, provider_name: 'Apple TV' }],
  },
  CA: {
    flatrate: [{ provider_id: 337, provider_name: 'Disney Plus' }],
  },
};

describe('parseBlockedWatchProviders', () => {
  it('reads pipe and comma separated ids', () => {
    assert.deepEqual(parseBlockedWatchProviders('8|1796, 337'), [8, 1796, 337]);
  });

  it('ignores empty and invalid values', () => {
    assert.deepEqual(parseBlockedWatchProviders(''), []);
    assert.deepEqual(parseBlockedWatchProviders(undefined), []);
    assert.deepEqual(parseBlockedWatchProviders('abc||0|-3'), []);
  });
});

describe('findBlockingProviders', () => {
  it('blocks a title streaming on a blocked provider in the region', () => {
    assert.deepEqual(findBlockingProviders(providers, 'US', [8, 1796]), [
      { id: 8, name: 'Netflix' },
    ]);
  });

  it('does not block providers that are not on the list', () => {
    assert.deepEqual(findBlockingProviders(providers, 'US', [337]), []);
  });

  it('only looks at the configured region', () => {
    assert.deepEqual(findBlockingProviders(providers, 'CA', [8]), []);
  });

  it('ignores rent and buy offers', () => {
    assert.deepEqual(findBlockingProviders(providers, 'US', [2]), []);
  });

  it('does nothing without a list or provider data', () => {
    assert.deepEqual(findBlockingProviders(providers, 'US', []), []);
    assert.deepEqual(findBlockingProviders(undefined, 'US', [8]), []);
  });
});
