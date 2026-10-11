import type { MediaType } from '@server/constants/media';

export interface FavoriteItem {
  id: number;
  // Movies and series are keyed on tmdbId, albums on the MusicBrainz release
  // group id and books on the OpenLibrary work id
  tmdbId?: number;
  mbId?: string;
  olId?: string;
  mediaType: MediaType;
  createdAt: Date;
}

export interface FavoriteResultsResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: FavoriteItem[];
}

export interface FavoriteRequestBody {
  tmdbId?: number;
  mbId?: string;
  olId?: string;
  mediaType: MediaType;
}
