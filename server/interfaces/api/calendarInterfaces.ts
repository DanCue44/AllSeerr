export type CalendarItemType = 'movie' | 'episode' | 'album';

export type CalendarReleaseType =
  | 'cinema'
  | 'digital'
  | 'physical'
  | 'airing'
  | 'release';

export interface CalendarRequester {
  id: number;
  displayName: string;
  avatar: string;
}

export interface CalendarItem {
  id: string;
  type: CalendarItemType;
  // Calendar day of the release (YYYY-MM-DD)
  date: string;
  airDateUtc?: string;
  releaseType: CalendarReleaseType;
  title: string;
  subtitle?: string;
  tmdbId?: number;
  tvdbId?: number;
  posterUrl?: string;
  hasFile: boolean;
  mediaId?: number;
  requestedBy?: CalendarRequester[];
  requestedByMe: boolean;
}

export interface CalendarResponse {
  start: string;
  end: string;
  results: CalendarItem[];
}
