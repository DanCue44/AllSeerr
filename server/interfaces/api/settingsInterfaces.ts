import type {
  NoBookEndsSyncHealth,
  NoBookEndsSyncStatus,
} from '@server/api/nobookendsSync';
import type { BookLanguage } from '@server/constants/bookLanguages';
import type { BookFormatChoice } from '@server/constants/media';
import type { BookService } from '@server/lib/settings';
import type { DnsEntries, DnsStats } from 'dns-caching';
import type { PaginatedResponse } from './common';

export type LogMessage = {
  timestamp: string;
  level: string;
  label?: string;
  message: string;
  data?: Record<string, unknown>;
};

export interface LogsResultsResponse extends PaginatedResponse {
  results: LogMessage[];
}

export interface SettingsAboutResponse {
  version: string;
  releaseBuild: boolean;
  totalRequests: number;
  totalMediaItems: number;
  tz?: string;
  appDataPath: string;
}

export interface PublicSettingsResponse {
  jellyfinHost?: string;
  jellyfinExternalHost?: string;
  jellyfinServerName?: string;
  jellyfinForgotPasswordUrl?: string;
  initialized: boolean;
  applicationTitle: string;
  applicationUrl: string;
  applicationLogoVersion: string;
  accentColor: string;
  hideAvailable: boolean;
  hideBlocklisted: boolean;
  hideRequested: boolean;
  localLogin: boolean;
  mediaServerLogin: boolean;
  movie4kEnabled: boolean;
  series4kEnabled: boolean;
  booksEnabled: boolean;
  bookService?: BookService;
  discoverRegion: string;
  streamingRegion: string;
  blockedWatchProviders: string;
  musicEnabled: boolean;
  // Whether Bazarr is set up, so subtitles can be checked and requested
  subtitlesEnabled: boolean;
  audiobookshelfEnabled: boolean;
  originalLanguage: string;
  mediaServerType: number;
  partialRequestsEnabled: boolean;
  allowCurrentSeasonRequests: boolean;
  defaultBookFormat: BookFormatChoice;
  bookLanguage: BookLanguage;
  enableSpecialEpisodes: boolean;
  cacheImages: boolean;
  vapidPublic: string;
  enablePushRegistration: boolean;
  locale: string;
  emailEnabled: boolean;
  newPlexLogin: boolean;
  youtubeUrl: string;
  versionCheck: boolean;
  plexClientIdentifier: string;
}

export interface CacheItem {
  id: string;
  name: string;
  stats: {
    hits: number;
    misses: number;
    keys: number;
    ksize: number;
    vsize: number;
  };
}

export interface CacheResponse {
  apiCaches: CacheItem[];
  imageCache: Record<'tmdb' | 'avatar', { size: number; imageCount: number }>;
  dnsCache: {
    stats: DnsStats | undefined;
    entries: DnsEntries | undefined;
  };
}

export interface StatusResponse {
  version: string;
  commitTag: string;
  releaseBuild: boolean;
  updateAvailable?: boolean;
  commitsBehind?: number;
  restartRequired: boolean;
}

/**
 * The NoBookEnds Sync settings as the API returns them: the admin token
 * never leaves the server, only whether one is saved
 */
export interface NoBookEndsSyncSettingsResponse {
  enabled: boolean;
  url: string;
  internalUrl: string;
  adminTokenSet: boolean;
}

export interface NoBookEndsSyncTestResponse extends NoBookEndsSyncHealth {
  // Set when an admin token was checked
  tokenValid?: boolean;
  // Window, queue and running job, when the token works on a Sync server
  // that reports them
  status?: NoBookEndsSyncStatus;
  // The Sync server has no status endpoint (an older version), so only
  // its health is known
  statusUnavailable?: boolean;
}

export interface NoBookEndsSyncBackfillResponse {
  // Books with both an audiobook and an ebook item
  total: number;
  // Taken by the Sync server
  accepted: number;
  // Refused for good: an item gone, or without audio or EPUB
  rejected: number;
  // Not taken this time, tried again later
  failed: number;
  // When background alignments run, when the Sync server reports it
  window?: NoBookEndsSyncStatus['window'];
}
