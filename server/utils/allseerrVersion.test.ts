import {
  compareAllSeerrVersions,
  isReleaseTag,
  isSameAllSeerrVersion,
  parseAllSeerrVersion,
} from '@server/utils/allseerrVersion';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('parseAllSeerrVersion', () => {
  it('reads versions and release tags', () => {
    assert.deepStrictEqual(parseAllSeerrVersion('3.5.0.1'), [3, 5, 0, 1]);
    assert.deepStrictEqual(parseAllSeerrVersion('v3.5.0.12'), [3, 5, 0, 12]);
  });

  it('treats a Seerr version as revision 0', () => {
    assert.deepStrictEqual(parseAllSeerrVersion('v3.5.0'), [3, 5, 0, 0]);
  });

  it('rejects commits and other text', () => {
    assert.equal(parseAllSeerrVersion('local'), null);
    assert.equal(parseAllSeerrVersion('develop-abc123'), null);
    assert.equal(
      parseAllSeerrVersion('1a07fcd2b4c1e9e5f2d3c4b5a6978877665544aa'),
      null
    );
    assert.equal(parseAllSeerrVersion('3.5'), null);
    assert.equal(parseAllSeerrVersion('3.5.0.1.2'), null);
  });
});

describe('isReleaseTag', () => {
  it('knows version tags from commits', () => {
    assert.equal(isReleaseTag('v3.5.0.2'), true);
    assert.equal(isReleaseTag('3.5.0.2'), true);
    assert.equal(isReleaseTag('1a07fcd2'), false);
    assert.equal(isReleaseTag('local'), false);
    assert.equal(isReleaseTag(''), false);
  });
});

describe('compareAllSeerrVersions', () => {
  it('orders revisions numerically', () => {
    assert.ok(compareAllSeerrVersions('v3.5.0.2', '3.5.0.1') > 0);
    assert.ok(compareAllSeerrVersions('v3.5.0.10', '3.5.0.9') > 0);
    assert.ok(compareAllSeerrVersions('v3.5.0.1', '3.5.0.2') < 0);
    assert.equal(compareAllSeerrVersions('v3.5.0.2', '3.5.0.2'), 0);
  });

  it('puts a newer Seerr base above any revision', () => {
    assert.ok(compareAllSeerrVersions('v3.5.1.1', '3.5.0.14') > 0);
    assert.ok(compareAllSeerrVersions('v3.6.0.1', '3.5.9.9') > 0);
    assert.ok(compareAllSeerrVersions('v4.0.0.1', '3.10.0.1') > 0);
  });

  it('does not order things that are not versions', () => {
    assert.equal(compareAllSeerrVersions('nightly', '3.5.0.1'), 0);
    assert.equal(compareAllSeerrVersions('v3.5.0.2', 'develop-abc'), 0);
  });
});

describe('isSameAllSeerrVersion', () => {
  it('matches a tag to the running version', () => {
    assert.equal(isSameAllSeerrVersion('v3.5.0.1', '3.5.0.1'), true);
    assert.equal(isSameAllSeerrVersion('v3.5.0.12', '3.5.0.1'), false);
    assert.equal(isSameAllSeerrVersion('Latest', 'Latest'), false);
  });
});
