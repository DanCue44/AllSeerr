import type { GitHubRelease, GithubCommit } from '@server/api/github';
import { checkForUpdate, type UpdateSource } from '@server/lib/updateCheck';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const release = (
  tag_name: string,
  extra: Partial<GitHubRelease> = {}
): GitHubRelease =>
  ({
    tag_name,
    name: tag_name,
    draft: false,
    prerelease: false,
    ...extra,
  }) as GitHubRelease;

const commit = (sha: string, message = 'feat: something'): GithubCommit =>
  ({ sha, commit: { message } }) as GithubCommit;

const source = ({
  releases = [],
  commits = [],
}: {
  releases?: GitHubRelease[];
  commits?: GithubCommit[];
}) => {
  const calls = { releases: 0, commits: 0 };
  const api: UpdateSource = {
    getReleases: async () => {
      calls.releases++;
      return releases;
    },
    getCommits: async () => {
      calls.commits++;
      return commits;
    },
  };

  return { api, calls };
};

describe('checkForUpdate', () => {
  it('skips local builds', async () => {
    const { api, calls } = source({ releases: [release('v9.9.9.9')] });

    assert.deepStrictEqual(await checkForUpdate('3.5.0.1', 'local', api), {
      updateAvailable: false,
      commitsBehind: 0,
    });
    assert.deepStrictEqual(calls, { releases: 0, commits: 0 });
  });

  describe('release builds', () => {
    it('reports a newer Allseerr release', async () => {
      const { api, calls } = source({
        releases: [release('v3.5.0.2'), release('v3.5.0.1')],
      });

      assert.deepStrictEqual(await checkForUpdate('3.5.0.1', 'v3.5.0.1', api), {
        updateAvailable: true,
        commitsBehind: 0,
      });
      assert.deepStrictEqual(calls, { releases: 1, commits: 0 });
    });

    it('is up to date on the latest release', async () => {
      const { api } = source({ releases: [release('v3.5.0.2')] });

      assert.equal(
        (await checkForUpdate('3.5.0.2', 'v3.5.0.2', api)).updateAvailable,
        false
      );
    });

    it('compares revisions as numbers', async () => {
      const { api } = source({ releases: [release('v3.5.0.9')] });

      assert.equal(
        (await checkForUpdate('3.5.0.10', 'v3.5.0.10', api)).updateAvailable,
        false
      );
    });

    it('skips drafts, prereleases and tags that are not versions', async () => {
      const { api } = source({
        releases: [
          release('v3.6.0.1', { draft: true }),
          release('v3.5.1.1', { prerelease: true }),
          release('nightly'),
          release('v3.5.0.1'),
        ],
      });

      assert.equal(
        (await checkForUpdate('3.5.0.1', 'v3.5.0.1', api)).updateAvailable,
        false
      );
    });

    it('is not out of date when there are no releases', async () => {
      const { api } = source({});

      assert.equal(
        (await checkForUpdate('3.5.0.1', 'v3.5.0.1', api)).updateAvailable,
        false
      );
    });
  });

  describe('branch builds', () => {
    it('is up to date on the newest commit', async () => {
      const { api, calls } = source({
        commits: [commit('aaa'), commit('bbb')],
      });

      assert.deepStrictEqual(await checkForUpdate('3.5.0.1', 'aaa', api), {
        updateAvailable: false,
        commitsBehind: 0,
      });
      assert.deepStrictEqual(calls, { releases: 0, commits: 1 });
    });

    it('counts commits behind, ignoring [skip ci] ones', async () => {
      const { api } = source({
        commits: [
          commit('ccc'),
          commit('skip', 'chore: bump [skip ci]'),
          commit('bbb'),
          commit('aaa'),
        ],
      });

      assert.deepStrictEqual(await checkForUpdate('3.5.0.1', 'aaa', api), {
        updateAvailable: true,
        commitsBehind: 2,
      });
    });

    it('reports -1 when the commit is too old to find', async () => {
      const { api } = source({ commits: [commit('ccc'), commit('bbb')] });

      assert.deepStrictEqual(await checkForUpdate('3.5.0.1', 'aaa', api), {
        updateAvailable: true,
        commitsBehind: -1,
      });
    });

    it('stays quiet when GitHub answers nothing', async () => {
      const { api } = source({});

      assert.deepStrictEqual(await checkForUpdate('3.5.0.1', 'aaa', api), {
        updateAvailable: false,
        commitsBehind: 0,
      });
    });
  });
});
