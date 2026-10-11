import type { GitHubRelease, GithubCommit } from '@server/api/github';
import {
  compareAllSeerrVersions,
  isReleaseTag,
} from '@server/utils/allseerrVersion';

export interface UpdateSource {
  getReleases(): Promise<GitHubRelease[]>;
  getCommits(): Promise<GithubCommit[]>;
}

export interface UpdateStatus {
  updateAvailable: boolean;
  commitsBehind: number;
}

/**
 * Release builds (tagged with their version, such as v3.5.0.2) compare their
 * version with the newest AllSeerr release. Other builds (tagged with the
 * commit they were built from) count how far behind the branch they are,
 * -1 when the commit is not among the recent ones. Local builds skip it.
 */
export const checkForUpdate = async (
  currentVersion: string,
  commitTag: string,
  source: UpdateSource
): Promise<UpdateStatus> => {
  const status: UpdateStatus = { updateAvailable: false, commitsBehind: 0 };

  if (commitTag === 'local') {
    return status;
  }

  if (isReleaseTag(commitTag)) {
    const releases = await source.getReleases();
    const latest = releases.find(
      (release) =>
        !release.draft && !release.prerelease && isReleaseTag(release.tag_name)
    );

    if (
      latest &&
      compareAllSeerrVersions(latest.tag_name, currentVersion) > 0
    ) {
      status.updateAvailable = true;
    }

    return status;
  }

  const commits = (await source.getCommits()).filter(
    (commit) => !commit.commit.message.includes('[skip ci]')
  );

  if (commits.length && commits[0].sha !== commitTag) {
    status.updateAvailable = true;
    status.commitsBehind = commits.findIndex(
      (commit) => commit.sha === commitTag
    );
  }

  return status;
};
