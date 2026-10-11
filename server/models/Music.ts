import type {
  MbAlbumResult,
  MbArtist,
  MbArtistCredit,
  MbArtistResult,
  MbRelation,
  MbRelease,
  MbReleaseGroup,
  MbReleaseSummary,
} from '@server/api/musicbrainz/interfaces';
import type Media from '@server/entity/Media';
import type { AlbumResult, ArtistResult } from '@server/models/Search';

export interface MusicTrack {
  name: string;
  number: string;
  position: number;
  disc: number;
  length: number | null;
  recordingMbid: string;
  artists: {
    name: string;
    mbid: string;
  }[];
}

export interface MusicLink {
  type: string;
  url: string;
}

export interface MusicDetails {
  id: string;
  mbId: string;
  mediaType: 'album';
  title: string;
  type: string;
  secondaryTypes: string[];
  disambiguation?: string;
  releaseDate?: string;
  releaseId?: string;
  artist: {
    id: string;
    name: string;
    type?: string;
  };
  artistCredit: string;
  genres: string[];
  tracks: MusicTrack[];
  links: MusicLink[];
  posterPath?: string | null;
  artistThumb?: string | null;
  artistBackdrop?: string | null;
  artistWikipedia?: {
    title: string;
    url: string;
    content: string;
  } | null;
  mediaInfo?: Media;
  onUserWatchlist?: boolean;
}

export interface ArtistDetails {
  id: string;
  mbId: string;
  mediaType: 'artist';
  name: string;
  sortName: string;
  type?: string;
  disambiguation?: string;
  country?: string;
  area?: string;
  beginDate?: string;
  endDate?: string;
  ended: boolean;
  genres: string[];
  links: MusicLink[];
  wikipedia?: {
    title: string;
    url: string;
    content: string;
  } | null;
  artistThumb?: string | null;
  artistBackdrop?: string | null;
  releaseGroups: AlbumResult[];
  typeCounts: Record<string, number>;
  totalReleaseGroups: number;
  // Whether the current user follows the artist through their watchlist
  onUserWatchlist?: boolean;
}

const formatArtistCredit = (credits: MbArtistCredit[] = []): string =>
  credits
    .map((credit) => `${credit.name}${credit.joinphrase ?? ''}`)
    .join('')
    .trim();

const mapLinks = (relations: MbRelation[] = []): MusicLink[] =>
  relations
    .filter((relation) => relation.url?.resource)
    .map((relation) => ({
      type: relation.type,
      url: relation.url?.resource ?? '',
    }));

const mapGenres = ({
  genres,
  tags,
}: {
  genres?: { name: string; count: number }[];
  tags?: { name: string; count: number }[];
}): string[] =>
  [...(genres?.length ? genres : (tags ?? []))]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((genre) => genre.name);

/**
 * Picks the release whose track list stands for the whole release group:
 * the earliest official release, or the earliest release without one
 */
export const pickRepresentativeRelease = (
  releases: MbReleaseSummary[] = []
): MbReleaseSummary | undefined => {
  const official = releases.filter((release) => release.status === 'Official');
  const candidates = official.length > 0 ? official : releases;

  return [...candidates].sort((a, b) => {
    if (!a.date) {
      return b.date ? 1 : 0;
    }
    if (!b.date) {
      return -1;
    }
    return a.date.localeCompare(b.date);
  })[0];
};

export const mapAlbumResult = (
  releaseGroup: MbReleaseGroup | MbAlbumResult,
  media?: Media,
  posterPath?: string | null
): AlbumResult => {
  const artistCredit = releaseGroup['artist-credit'] ?? [];

  return {
    id: releaseGroup.id,
    mediaType: 'album',
    title: releaseGroup.title,
    albumType: releaseGroup['primary-type'] ?? undefined,
    secondaryTypes:
      ('secondary-types' in releaseGroup
        ? releaseGroup['secondary-types']
        : undefined) ?? [],
    releaseDate: releaseGroup['first-release-date'] || undefined,
    artistId: artistCredit[0]?.artist.id,
    artistName: formatArtistCredit(artistCredit) || undefined,
    score: 'score' in releaseGroup ? releaseGroup.score : undefined,
    posterPath: posterPath ?? null,
    needsCoverArt: !posterPath,
    mediaInfo: media,
  };
};

export const mapArtistResult = (
  artist: MbArtistResult,
  images?: { artistThumb: string | null; artistBackground: string | null }
): ArtistResult => ({
  id: artist.id,
  mediaType: 'artist',
  name: artist.name,
  type: artist.type,
  sortName: artist['sort-name'],
  country: artist.country,
  disambiguation: artist.disambiguation,
  score: artist.score,
  artistThumb: images?.artistThumb ?? null,
  artistBackdrop: images?.artistBackground ?? null,
});

export const mapMusicDetails = (
  releaseGroup: MbReleaseGroup,
  release?: MbRelease,
  media?: Media
): MusicDetails => {
  const artistCredit = releaseGroup['artist-credit'] ?? [];

  return {
    id: releaseGroup.id,
    mbId: releaseGroup.id,
    mediaType: 'album',
    title: releaseGroup.title,
    type: releaseGroup['primary-type'] ?? 'Other',
    secondaryTypes: releaseGroup['secondary-types'] ?? [],
    disambiguation: releaseGroup.disambiguation || undefined,
    releaseDate: releaseGroup['first-release-date'] || undefined,
    releaseId: release?.id,
    artist: {
      id: artistCredit[0]?.artist.id ?? '',
      name: artistCredit[0]?.artist.name ?? '',
      type: artistCredit[0]?.artist.type ?? undefined,
    },
    artistCredit: formatArtistCredit(artistCredit),
    genres: mapGenres(releaseGroup),
    tracks: (release?.media ?? []).flatMap((medium) =>
      (medium.tracks ?? []).map((track) => ({
        name: track.title,
        number: track.number,
        position: track.position,
        disc: medium.position,
        length: track.length ?? track.recording.length ?? null,
        recordingMbid: track.recording.id,
        artists: (track['artist-credit'] ?? artistCredit).map((credit) => ({
          name: credit.name,
          mbid: credit.artist.id,
        })),
      }))
    ),
    links: mapLinks(releaseGroup.relations),
    mediaInfo: media,
  };
};

export const mapArtistDetails = (
  artist: MbArtist
): Omit<
  ArtistDetails,
  'releaseGroups' | 'typeCounts' | 'totalReleaseGroups'
> => ({
  id: artist.id,
  mbId: artist.id,
  mediaType: 'artist',
  name: artist.name,
  sortName: artist['sort-name'],
  type: artist.type ?? undefined,
  disambiguation: artist.disambiguation || undefined,
  country: artist.country ?? undefined,
  area: artist.area?.name ?? artist['begin-area']?.name,
  beginDate: artist['life-span']?.begin ?? undefined,
  endDate: artist['life-span']?.end ?? undefined,
  ended: artist['life-span']?.ended ?? false,
  genres: mapGenres(artist),
  links: mapLinks(artist.relations),
});
