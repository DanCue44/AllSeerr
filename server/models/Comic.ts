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
}

export const mapComicDetails = (
  metadata: MetadataComic,
  { media, library }: { media?: Media; library?: ComicLibraryInfo } = {}
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
});
