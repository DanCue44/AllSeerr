import type {
  ArrRelease,
  ArrReleaseProtocol,
  ArrTarget,
} from '@server/interfaces/api/arrActionInterfaces';

export type ReleaseSort = 'default' | 'size' | 'age' | 'seeders';

export interface ReleaseFilter {
  approvedOnly: boolean;
  protocol: 'all' | Exclude<ArrReleaseProtocol, 'unknown'>;
}

/**
 * Approved releases first, then the best quality, custom format score,
 * the largest and the newest, as the arrs rank them
 */
const byDefault = (a: ArrRelease, b: ArrRelease): number =>
  Number(b.approved) - Number(a.approved) ||
  b.qualityWeight - a.qualityWeight ||
  (b.customFormatScore ?? 0) - (a.customFormatScore ?? 0) ||
  b.size - a.size ||
  a.ageHours - b.ageHours;

const sorters: Record<ReleaseSort, (a: ArrRelease, b: ArrRelease) => number> = {
  default: byDefault,
  size: (a, b) => b.size - a.size || byDefault(a, b),
  age: (a, b) => a.ageHours - b.ageHours || byDefault(a, b),
  seeders: (a, b) => (b.seeders ?? -1) - (a.seeders ?? -1) || byDefault(a, b),
};

export const filterReleases = (
  releases: ArrRelease[],
  filter: ReleaseFilter,
  sort: ReleaseSort
): ArrRelease[] =>
  releases
    .filter(
      (release) =>
        (!filter.approvedOnly || release.approved) &&
        (filter.protocol === 'all' || release.protocol === filter.protocol)
    )
    .sort(sorters[sort]);

/**
 * Release age the way the arrs show it: hours, then days, then years
 */
export const splitAge = (
  ageHours: number
): { unit: 'hour' | 'day' | 'year'; value: number } => {
  if (ageHours < 24) {
    return { unit: 'hour', value: Math.max(0, Math.round(ageHours)) };
  }
  const days = Math.floor(ageHours / 24);
  if (days < 365) {
    return { unit: 'day', value: days };
  }
  return { unit: 'year', value: Math.floor((days / 365) * 10) / 10 };
};

/**
 * The query string of a target, for the GET endpoints
 */
export const targetQuery = (target: ArrTarget): string => {
  const params = new URLSearchParams();

  if (target.is4k) {
    params.set('is4k', 'true');
  }
  if (target.seasonNumber !== undefined) {
    params.set('seasonNumber', String(target.seasonNumber));
  }
  if (target.episodeNumber !== undefined) {
    params.set('episodeNumber', String(target.episodeNumber));
  }
  if (target.bookFormat) {
    params.set('bookFormat', target.bookFormat);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
};
