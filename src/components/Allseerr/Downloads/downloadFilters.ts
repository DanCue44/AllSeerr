import type {
  DownloadItem,
  DownloadStatus,
} from '@server/interfaces/api/downloadInterfaces';

export type DownloadTab = 'all' | 'movie' | 'tv' | 'music' | 'book';

export type DownloadStatusFilter =
  | 'all'
  | 'downloading'
  | 'queued'
  | 'importing'
  | 'attention';

export const DOWNLOAD_TABS: DownloadTab[] = [
  'all',
  'movie',
  'tv',
  'music',
  'book',
];

export const STATUS_FILTERS: DownloadStatusFilter[] = [
  'all',
  'downloading',
  'queued',
  'importing',
  'attention',
];

const STATUS_GROUPS: Record<
  Exclude<DownloadStatusFilter, 'all'>,
  DownloadStatus[]
> = {
  downloading: ['downloading'],
  queued: ['queued', 'paused'],
  importing: ['importing', 'importPending', 'completed'],
  attention: ['failed', 'stalled', 'warning'],
};

export const matchesTab = (item: DownloadItem, tab: DownloadTab): boolean =>
  tab === 'all' ||
  (tab === 'book'
    ? item.mediaType === 'ebook' || item.mediaType === 'audiobook'
    : item.mediaType === tab);

export const matchesStatus = (
  item: DownloadItem,
  filter: DownloadStatusFilter
): boolean => filter === 'all' || STATUS_GROUPS[filter].includes(item.status);

export const filterDownloads = (
  items: DownloadItem[],
  tab: DownloadTab,
  status: DownloadStatusFilter
): DownloadItem[] =>
  items.filter((item) => matchesTab(item, tab) && matchesStatus(item, status));

/**
 * A time left split into the two largest units, such as 2 h 5 min, for
 * the card to word
 */
export const splitDuration = (
  seconds: number
): { unit: 'day' | 'hour' | 'minute' | 'second'; value: number }[] => {
  const total = Math.max(0, Math.round(seconds));
  const parts = [
    { unit: 'day' as const, value: Math.floor(total / 86_400) },
    { unit: 'hour' as const, value: Math.floor((total % 86_400) / 3600) },
    { unit: 'minute' as const, value: Math.floor((total % 3600) / 60) },
    { unit: 'second' as const, value: total % 60 },
  ];
  const first = parts.findIndex((part) => part.value > 0);

  if (first === -1) {
    return [{ unit: 'second', value: 0 }];
  }

  // Seconds only matter under a minute
  return parts
    .slice(first, first + 2)
    .filter(
      (part, index) => part.value > 0 && (index === 0 || part.unit !== 'second')
    );
};

/**
 * The episodes of a download the way the app shows them: S01E02, or
 * S01E01-E08 for a run of a season pack
 */
export const episodeLabel = (
  seasonNumber: number | undefined,
  episodeNumbers: number[] = []
): string | undefined => {
  if (seasonNumber === undefined) {
    return undefined;
  }

  const season = `S${String(seasonNumber).padStart(2, '0')}`;
  const episode = (n: number) => `E${String(n).padStart(2, '0')}`;

  if (episodeNumbers.length === 0) {
    return season;
  }

  const first = episodeNumbers[0];
  const last = episodeNumbers[episodeNumbers.length - 1];

  if (episodeNumbers.length === 1) {
    return `${season}${episode(first)}`;
  }

  return last - first + 1 === episodeNumbers.length
    ? `${season}${episode(first)}-${episode(last)}`
    : `${season} ${episodeNumbers.map(episode).join(', ')}`;
};
