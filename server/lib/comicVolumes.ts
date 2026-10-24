import { MediaRequestStatus } from '@server/constants/media';

/**
 * Volume requests of a comic or manga series: which volumes a request asks
 * for and how they are written. Shared by the server and the pages, so it
 * imports nothing that only runs on the server.
 */

// More volumes than any series has, so a request body stays small
export const MAX_REQUESTED_VOLUMES = 1000;

/**
 * The volume numbers of a request body, deduplicated and sorted. Null for
 * a request of the whole series, which is also what an empty list means.
 * Undefined when the value is not a list of volume numbers.
 */
export const parseComicVolumes = (
  value: unknown
): number[] | null | undefined => {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Array.isArray(value) || value.length > MAX_REQUESTED_VOLUMES) {
    return undefined;
  }

  if (
    !value.every(
      (volume) =>
        typeof volume === 'number' && Number.isFinite(volume) && volume >= 0
    )
  ) {
    return undefined;
  }

  const volumes = [...new Set(value as number[])].sort((a, b) => a - b);

  return volumes.length > 0 ? volumes : null;
};

/**
 * Volume numbers as runs, such as "1-3, 7". Whole numbers in a row join
 * into a run; any other number stands alone.
 */
export const formatVolumeRanges = (volumes: number[]): string => {
  const sorted = [...new Set(volumes)].sort((a, b) => a - b);
  const runs: string[] = [];
  let index = 0;

  while (index < sorted.length) {
    const start = sorted[index];
    let end = start;

    while (
      Number.isInteger(end) &&
      index + 1 < sorted.length &&
      sorted[index + 1] === end + 1
    ) {
      index++;
      end = sorted[index];
    }

    runs.push(start === end ? String(start) : `${start}-${end}`);
    index++;
  }

  return runs.join(', ');
};

/**
 * Volume numbers as notifications write them, such as "Vol. 1-3, 7"
 */
export const formatRequestedVolumes = (volumes: number[]): string =>
  `Vol. ${formatVolumeRanges(volumes)}`;

/**
 * Whether a request still stands in the way of asking for the same
 * volumes again: every request but a declined or completed one
 */
export const holdsComicVolumes = (status: MediaRequestStatus): boolean =>
  status !== MediaRequestStatus.DECLINED &&
  status !== MediaRequestStatus.COMPLETED;

/**
 * What the standing requests of a series ask for: the whole series, or
 * the volumes they list
 */
export const getRequestedComicVolumes = (
  requests: { status: MediaRequestStatus; comicVolumes?: number[] | null }[]
): { wholeSeries: boolean; volumes: number[] } => {
  const standing = requests.filter((request) =>
    holdsComicVolumes(request.status)
  );
  const volumes = new Set<number>();

  for (const request of standing) {
    for (const volume of request.comicVolumes ?? []) {
      volumes.add(volume);
    }
  }

  return {
    wholeSeries: standing.some((request) => !request.comicVolumes?.length),
    volumes: [...volumes].sort((a, b) => a - b),
  };
};
