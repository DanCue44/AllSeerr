interface MbResult {
  id: string;
  score: number;
}

export interface MbLink {
  type: string;
  target: string;
}

export interface MbAlbumResult extends MbResult {
  // Set by Seerr-side enrichment for downstream consumers; not present in
  // raw MusicBrainz `/release-group` responses.
  media_type?: 'album';
  title: string;
  'primary-type': 'Album' | 'Single' | 'EP';
  'first-release-date': string;
  'artist-credit': {
    name: string;
    artist: {
      id: string;
      name: string;
      'sort-name': string;
      overview?: string;
    };
  }[];
  // Seerr-side enrichment.
  posterPath?: string;
}

export interface MbAlbumDetails extends MbAlbumResult {
  'type-id'?: string;
  'primary-type-id'?: string;
  count?: number;
  'secondary-types'?: string[];
  'secondary-type-ids'?: string[];
  releases?: {
    id: string;
    title: string;
    status: string;
    'status-id': string;
  }[];
  releasedate?: string;
  tags?: {
    count: number;
    name: string;
  }[];
  artists?: {
    id: string;
    name: string;
    overview?: string;
  }[];
  links?: MbLink[];
  // Seerr-side enrichment.
  poster_path?: string;
}

export interface MbArtistResult extends MbResult {
  // Seerr-side enrichment for downstream consumers; not returned by the
  // raw MusicBrainz `/artist` endpoint.
  media_type?: 'artist';
  name: string;
  type: 'Group' | 'Person';
  'sort-name': string;
  country?: string;
  disambiguation?: string;
  artistThumb?: string | null;
  artistBackdrop?: string | null;
}

export interface MbArtistDetails extends MbArtistResult {
  'type-id'?: string;
  area?: {
    id: string;
    name: string;
    type: string;
    'type-id': string;
    'sort-name': string;
  };
  'begin-area'?: {
    id: string;
    name: string;
    type: string;
    'sort-name': string;
  };
  'life-span'?: {
    begin?: string;
    ended: boolean;
  };
  gender?: string;
  'gender-id'?: string;
  isnis?: string[];
  aliases?: {
    name: string;
    'sort-name': string;
    type?: string;
    'type-id'?: string;
  }[];
  tags?: {
    count: number;
    name: string;
  }[];
  links?: MbLink[];
}

export interface MbSearchAlbumResponse {
  created: string;
  count: number;
  offset: number;
  'release-groups': MbAlbumDetails[];
}

export interface MbSearchArtistResponse {
  created: string;
  count: number;
  offset: number;
  artists: MbArtistDetails[];
}

export interface MbSearchMultiResponse {
  created: string;
  count: number;
  offset: number;
  results: (MbArtistResult | MbAlbumResult)[];
}

export interface MbArtistCredit {
  name: string;
  joinphrase?: string;
  artist: {
    id: string;
    name: string;
    'sort-name': string;
    type?: string | null;
    disambiguation?: string;
  };
}

export interface MbGenre {
  id?: string;
  name: string;
  count: number;
}

export interface MbRelation {
  type: string;
  url?: {
    id: string;
    resource: string;
  };
}

export interface MbReleaseSummary {
  id: string;
  title: string;
  status?: string | null;
  date?: string;
  country?: string | null;
  disambiguation?: string;
}

export interface MbReleaseGroup {
  id: string;
  title: string;
  disambiguation?: string;
  'primary-type'?: string | null;
  'secondary-types'?: string[];
  'first-release-date'?: string;
  'artist-credit'?: MbArtistCredit[];
  releases?: MbReleaseSummary[];
  genres?: MbGenre[];
  tags?: MbGenre[];
  relations?: MbRelation[];
}

export interface MbTrack {
  id: string;
  number: string;
  position: number;
  title: string;
  length?: number | null;
  'artist-credit'?: MbArtistCredit[];
  recording: {
    id: string;
    title: string;
    length?: number | null;
  };
}

export interface MbMedium {
  position: number;
  format?: string | null;
  title?: string;
  'track-count': number;
  tracks?: MbTrack[];
}

export interface MbRelease extends MbReleaseSummary {
  media?: MbMedium[];
  'artist-credit'?: MbArtistCredit[];
  'release-group'?: {
    id: string;
  };
}

export interface MbArtist {
  id: string;
  name: string;
  'sort-name': string;
  type?: string | null;
  country?: string | null;
  disambiguation?: string;
  area?: {
    id: string;
    name: string;
  } | null;
  'begin-area'?: {
    id: string;
    name: string;
  } | null;
  'life-span'?: {
    begin?: string | null;
    end?: string | null;
    ended: boolean;
  };
  genres?: MbGenre[];
  tags?: MbGenre[];
  relations?: MbRelation[];
}

export interface MbBrowseReleaseGroupsResponse {
  'release-group-count': number;
  'release-group-offset': number;
  'release-groups': MbReleaseGroup[];
}
