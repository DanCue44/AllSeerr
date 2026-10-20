/**
 * Allseerr versions are the Seerr release they are based on plus an Allseerr
 * revision, such as 3.5.0.1. Release tags carry a leading v (v3.5.0.2).
 * These helpers have no server dependencies so the frontend can use them.
 */
const VERSION_REGEX = /^v?(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/;

/**
 * Numeric parts of a version or release tag, a missing revision counts as 0
 */
export const parseAllseerrVersion = (version: string): number[] | null => {
  const match = VERSION_REGEX.exec(version.trim());

  if (!match) {
    return null;
  }

  return match.slice(1).map((part) => Number(part ?? 0));
};

/**
 * A release build is tagged with its version, other builds with a commit
 */
export const isReleaseTag = (commitTag: string): boolean =>
  parseAllseerrVersion(commitTag) !== null;

/**
 * Negative when a is older than b, positive when it is newer, 0 when equal or
 * when either is not a version
 */
export const compareAllseerrVersions = (a: string, b: string): number => {
  const left = parseAllseerrVersion(a);
  const right = parseAllseerrVersion(b);

  if (!left || !right) {
    return 0;
  }

  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return left[i] - right[i];
    }
  }

  return 0;
};

/**
 * Whether a release tag or name is the version that is running
 */
export const isSameAllseerrVersion = (a: string, b: string): boolean =>
  parseAllseerrVersion(a) !== null &&
  parseAllseerrVersion(b) !== null &&
  compareAllseerrVersions(a, b) === 0;
