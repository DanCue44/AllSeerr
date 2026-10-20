import type { ArrTarget } from '@server/interfaces/api/arrActionInterfaces';

export type DownloadService = 'radarr' | 'sonarr' | 'lidarr' | 'chaptarr';

export type DownloadMediaType =
  | 'movie'
  | 'tv'
  | 'music'
  | 'ebook'
  | 'audiobook';

export type DownloadStatus =
  | 'downloading'
  | 'queued'
  | 'paused'
  | 'importing'
  | 'importPending'
  | 'completed'
  | 'warning'
  | 'failed'
  | 'stalled';

export type DownloadProtocol = 'usenet' | 'torrent' | 'unknown';

export interface DownloadRequester {
  id: number;
  displayName: string;
  avatar: string;
}

/**
 * A download in the queue of one of the arrs, the same for every arr
 */
export interface DownloadItem {
  // service:serverId:queueId, for the actions
  id: string;
  service: DownloadService;
  serverId: number;
  // The arr as it is set up in AllSeerr, such as "4K Radarr"
  serverName: string;
  is4k: boolean;
  mediaType: DownloadMediaType;
  // The movie, series, album or book
  title: string;
  year?: number;
  // Series: the season and the episodes in the download, more than one for
  // a season pack
  seasonNumber?: number;
  episodeNumbers?: number[];
  episodeTitle?: string;
  // Albums
  artistName?: string;
  // Books
  authorName?: string;
  // The release in the download client
  releaseTitle: string;
  protocol: DownloadProtocol;
  downloadClient?: string;
  indexer?: string;
  // Bytes
  size: number;
  sizeLeft: number;
  // 0 to 1
  progress: number;
  // As the arr says it, such as 01:02:03 or 1.02:03:04
  timeLeft?: string;
  timeLeftSeconds?: number;
  estimatedCompletionTime?: string;
  status: DownloadStatus;
  // What the arr itself says
  arrStatus?: string;
  trackedDownloadState?: string;
  trackedDownloadStatus?: string;
  statusMessages: string[];
  errorMessage?: string;
  // Failed, stalled or showing a warning
  needsAttention: boolean;
  added?: string;
  // Torrents, when the arr says
  seeders?: number;
  leechers?: number;
  posterUrl?: string;
  // The media in AllSeerr, when the download is of one
  mediaId?: number;
  tmdbId?: number;
  tvdbId?: number;
  mbId?: string;
  olId?: string;
  // For the /media/{mediaId}/arr actions
  target?: ArrTarget;
  requester?: DownloadRequester;
  // A new search can be started for what the download is of
  canSearch: boolean;
}

export interface DownloadServerError {
  service: DownloadService;
  serverId: number;
  serverName: string;
  message: string;
}

export interface DownloadTotals {
  total: number;
  downloading: number;
  queued: number;
  attention: number;
}

export interface DownloadsResponse {
  results: DownloadItem[];
  totals: DownloadTotals;
  serverErrors: DownloadServerError[];
  updatedAt: string;
}

export interface DownloadRemoveBody {
  // Also delete it from NZBGet or qBittorrent
  removeFromClient?: boolean;
  // Never grab this release again
  blocklist?: boolean;
  // Start a new search after removing
  search?: boolean;
}

export interface DownloadRemoveResponse {
  removed: boolean;
  blocklisted: boolean;
  searched: boolean;
  // Why the new search could not be started, the download is gone anyway
  searchError?: string;
}

export type SeedingState =
  | 'seeding'
  | 'stalled'
  | 'queued'
  | 'paused'
  | 'checking'
  | 'error'
  | 'downloading';

/**
 * A torrent TaleArr's download client is seeding, or should be. Bytes and
 * seconds, ISO 8601 times. Fields TaleArr does not know are null.
 */
export interface SeedingTorrent {
  // The hash in the download client
  downloadId: string;
  // The release name in the client
  title: string;
  // Null when TaleArr cannot match the torrent to a book
  bookId: number | null;
  bookTitle: string | null;
  authorName: string | null;
  mediaType: 'audiobook' | 'ebook' | null;
  indexer: string | null;
  isPrivateTracker: boolean;
  downloadClient: string | null;
  state: SeedingState;
  size: number;
  uploaded: number;
  ratio: number;
  seedingSeconds: number;
  // The tracker's minimum seeding time
  requiredSeedingSeconds: number | null;
  // When the client stops seeding by itself
  seedGoalSeconds: number | null;
  requirementMet: boolean;
  atRisk: boolean;
  riskReason: string | null;
  addedAt: string | null;
  completedAt: string | null;
  // Added by AllSeerr: the book in AllSeerr, when it has the TaleArr book
  mediaId?: number;
  olId?: string;
}

export interface SeedingSummary {
  total: number;
  seeding: number;
  atRisk: number;
  privateUnsatisfied: number;
}

/**
 * The private tracker account TaleArr checks, for its seeding rules
 */
export interface TrackerAccount {
  userClass: string | null;
  isVip: boolean;
  unsatisfied: number | null;
  unsatisfiedLimit: number | null;
  wedges: number | null;
  bonusPoints: number | null;
  checkedAt: string | null;
}

export interface TalearrSeeding {
  generatedAt: string | null;
  torrents: SeedingTorrent[];
  summary: SeedingSummary;
  // Null when TaleArr checks no tracker account
  trackerAccount: TrackerAccount | null;
}

/**
 * Seeding is only known to TaleArr; stock Chaptarr and LazyLibrarian answer
 * unsupported
 */
export type SeedingResponse =
  | { supported: false }
  | ({ supported: true } & TalearrSeeding);
