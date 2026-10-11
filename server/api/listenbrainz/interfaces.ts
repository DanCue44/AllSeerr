export interface LbReleaseGroup {
  artist_mbids: string[];
  artist_name: string;
  caa_id?: number | null;
  caa_release_mbid?: string | null;
  listen_count: number;
  release_group_mbid?: string | null;
  release_group_name: string;
}

export interface LbTopAlbumsResponse {
  payload: {
    count: number;
    from_ts: number;
    last_updated: number;
    offset: number;
    range: string;
    release_groups: LbReleaseGroup[];
    to_ts: number;
    total_release_group_count?: number;
  };
}

export interface LbRelease {
  artist_credit_name: string;
  artist_mbids: string[];
  caa_id?: number | null;
  caa_release_mbid?: string | null;
  listen_count: number;
  release_date: string;
  release_group_mbid: string;
  release_group_primary_type?: string | null;
  release_group_secondary_type?: string | null;
  release_mbid: string;
  release_name: string;
  release_tags?: string[];
}

export interface LbFreshReleasesResponse {
  payload: {
    releases: LbRelease[];
  };
}

export interface LbArtist {
  artist_mbid?: string | null;
  artist_name: string;
  listen_count: number;
}

export interface LbTopArtistsResponse {
  payload: {
    artists: LbArtist[];
    count: number;
    from_ts: number;
    last_updated: number;
    offset: number;
    range: string;
    to_ts: number;
    total_artist_count?: number;
  };
}

export interface LbTag {
  tag: string;
  count: number;
  // Set when the tag is a MusicBrainz genre rather than a free form tag
  genre_mbid?: string;
  artist_mbid?: string;
}

export interface LbReleaseGroupMetadata {
  release_group: {
    caa_id?: number | null;
    caa_release_mbid?: string | null;
    date?: string | null;
    name: string;
    type?: string | null;
  };
  tag?: {
    artist?: LbTag[];
    release_group?: LbTag[];
  };
}

// Keyed by release group MBID
export type LbReleaseGroupMetadataResponse = Record<
  string,
  LbReleaseGroupMetadata
>;

// An artist of the similar artists dataset of ListenBrainz Labs, most
// similar first
export interface LbLabsSimilarArtist {
  artist_mbid: string;
  name: string;
  comment?: string | null;
  type?: string | null;
  score?: number;
}

// A recording of an artist picked by LB Radio for a seed artist
export interface LbRadioRecording {
  recording_mbid: string;
  similar_artist_mbid: string;
  similar_artist_name: string;
  total_listen_count: number;
}

// Recordings of the seed artist and its similar artists, keyed by artist MBID
export type LbRadioArtistResponse = Record<string, LbRadioRecording[]>;

export interface LbSimilarArtist {
  mbid: string;
  name: string;
  comment?: string;
  type?: string;
}
