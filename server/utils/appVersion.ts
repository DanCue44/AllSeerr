import logger from '@server/logger';
import { isReleaseTag } from '@server/utils/allseerrVersion';
import { existsSync } from 'fs';
import path from 'path';

const COMMIT_TAG_PATH = path.join(__dirname, '../../committag.json');
const ALLSEERR_VERSION_PATH = path.join(__dirname, '../../allseerr.json');
let commitTag = 'local';

if (existsSync(COMMIT_TAG_PATH)) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  commitTag = require(COMMIT_TAG_PATH).commitTag;
  logger.info(`Commit Tag: ${commitTag}`);
}

export const getCommitTag = (): string => {
  return commitTag;
};

/**
 * Release images are built with their version tag (v3.5.0.2) as the commit
 * tag, every other build with the commit it was built from
 */
export const isReleaseBuild = (): boolean => isReleaseTag(commitTag);

/**
 * AllSeerr versions follow the Seerr release they are based on plus an
 * AllSeerr revision: 3.5.0.1, 3.5.0.2, then 3.5.1.1 after moving to 3.5.1.
 */
export const getAllSeerrVersion = (): string | undefined => {
  if (!existsSync(ALLSEERR_VERSION_PATH)) {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { seerrVersion, revision } = require(ALLSEERR_VERSION_PATH);
  return `${seerrVersion}.${revision}`;
};

export const getAppVersion = (): string => {
  const allseerrVersion = getAllSeerrVersion();

  if (allseerrVersion) {
    return allseerrVersion;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { version } = require('../../package.json');

  let finalVersion = version;

  if (version === '0.1.0') {
    finalVersion = `develop-${getCommitTag()}`;
  }

  return finalVersion;
};
