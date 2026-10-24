import type { ComicKind, MediaStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type MetadataComic from '@server/entity/MetadataComic';

/**
 * What Talearr's library holds of a series, once it was added there
 */
export interface ComicLibraryInfo {
  seriesId: number;
  volumeCount: number;
  downloadedCount: number;
  missingCount: number;
  downloadingCount: number;
  // Available, partly available or processing, from the volume counts
  status: MediaStatus;
}

/**
 * What Talearr has of one volume of a series in its library
 */
export type ComicVolumeState =
  | 'downloaded'
  | 'downloading'
  | 'missing'
  | 'unreleased'
  | 'unmonitored';

export const COMIC_VOLUME_STATES: ComicVolumeState[] = [
  'downloaded',
  'downloading',
  'missing',
  'unreleased',
  'unmonitored',
];

export interface ComicVolumeInfo {
  number: number;
  title?: string;
  // yyyy-MM-dd
  releaseDate?: string;
  coverUrl?: string;
  pages?: number;
  description?: string;
  hardcoverUrl?: string;
  // Only set for a series in Talearr's library
  state?: ComicVolumeState;
}

/**
 * What the metadata sources added to the saved facts, through Talearr's
 * preview of the series
 */
export interface ComicPreviewExtras {
  genres: string[];
  format?: string;
  bannerUrl?: string;
  volumeList: ComicVolumeInfo[];
  notices: string[];
}

export interface ComicDetails {
  id: string;
  mediaType: 'comic';
  kind: ComicKind;
  // Whether the kind came from AniList, which only lists manga. A series only
  // Hardcover knows may be either, so it can be filed as the other kind.
  kindKnown: boolean;
  title: string;
  alternateTitles: string[];
  year?: number;
  status?: string;
  volumes?: number;
  authors?: string;
  overview?: string;
  posterPath: string | null;
  ageRating?: string;
  isAdult: boolean;
  aniListId?: number;
  hardcoverSeriesId?: number;
  library?: ComicLibraryInfo;
  mediaInfo?: Media;
  genres: string[];
  format?: string;
  bannerPath?: string;
  // Each volume of the series, when Talearr could list them
  volumeList: ComicVolumeInfo[];
  notices: string[];
}

export const mapComicDetails = (
  metadata: MetadataComic,
  {
    media,
    library,
    extras,
  }: {
    media?: Media;
    library?: ComicLibraryInfo;
    extras?: ComicPreviewExtras;
  } = {}
): ComicDetails => ({
  id: metadata.comicId,
  mediaType: 'comic',
  kind: media?.comicKind ?? metadata.kind,
  kindKnown: !!metadata.aniListId || !!media?.comicKind,
  title: metadata.title,
  alternateTitles: metadata.alternateTitles ?? [],
  year: metadata.year ?? undefined,
  status: metadata.status ?? undefined,
  volumes: metadata.volumes ?? undefined,
  authors: metadata.authors ?? undefined,
  overview: metadata.overview ?? undefined,
  posterPath: metadata.coverUrl,
  ageRating: metadata.ageRating ?? undefined,
  isAdult: metadata.isAdult,
  aniListId: metadata.aniListId ?? undefined,
  hardcoverSeriesId: metadata.hardcoverSeriesId ?? undefined,
  library,
  mediaInfo: media,
  genres: extras?.genres ?? [],
  format: extras?.format,
  bannerPath: extras?.bannerUrl,
  volumeList: extras?.volumeList ?? [],
  notices: extras?.notices ?? [],
});
