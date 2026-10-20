import {
  compareAllseerrVersions,
  isReleaseTag,
  isSameAllseerrVersion,
  parseAllseerrVersion,
} from '@server/utils/allseerrVersion';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('parseAllseerrVersion', () => {
  it('reads versions and release tags', () => {
    assert.deepStrictEqual(parseAllseerrVersion('3.5.0.1'), [3, 5, 0, 1]);
    assert.deepStrictEqual(parseAllseerrVersion('v3.5.0.12'), [3, 5, 0, 12]);
  });

  it('treats a Seerr version as revision 0', () => {
    assert.deepStrictEqual(parseAllseerrVersion('v3.5.0'), [3, 5, 0, 0]);
  });

  it('rejects commits and other text', () => {
    assert.equal(parseAllseerrVersion('local'), null);
    assert.equal(parseAllseerrVersion('develop-abc123'), null);
    assert.equal(
      parseAllseerrVersion('1a07fcd2b4c1e9e5f2d3c4b5a6978877665544aa'),
      null
    );
    assert.equal(parseAllseerrVersion('3.5'), null);
    assert.equal(parseAllseerrVersion('3.5.0.1.2'), null);
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

describe('compareAllseerrVersions', () => {
  it('orders revisions numerically', () => {
    assert.ok(compareAllseerrVersions('v3.5.0.2', '3.5.0.1') > 0);
    assert.ok(compareAllseerrVersions('v3.5.0.10', '3.5.0.9') > 0);
    assert.ok(compareAllseerrVersions('v3.5.0.1', '3.5.0.2') < 0);
    assert.equal(compareAllseerrVersions('v3.5.0.2', '3.5.0.2'), 0);
  });

  it('puts a newer Seerr base above any revision', () => {
    assert.ok(compareAllseerrVersions('v3.5.1.1', '3.5.0.14') > 0);
    assert.ok(compareAllseerrVersions('v3.6.0.1', '3.5.9.9') > 0);
    assert.ok(compareAllseerrVersions('v4.0.0.1', '3.10.0.1') > 0);
  });

  it('does not order things that are not versions', () => {
    assert.equal(compareAllseerrVersions('nightly', '3.5.0.1'), 0);
    assert.equal(compareAllseerrVersions('v3.5.0.2', 'develop-abc'), 0);
  });
});

describe('isSameAllseerrVersion', () => {
  it('matches a tag to the running version', () => {
    assert.equal(isSameAllseerrVersion('v3.5.0.1', '3.5.0.1'), true);
    assert.equal(isSameAllseerrVersion('v3.5.0.12', '3.5.0.1'), false);
    assert.equal(isSameAllseerrVersion('Latest', 'Latest'), false);
  });
});
