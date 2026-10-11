import ChaptarrAPI from '@server/api/servarr/chaptarr';
import LidarrAPI from '@server/api/servarr/lidarr';
import { MediaStatus, MediaType } from '@server/constants/media';
import type Media from '@server/entity/Media';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import type { FindOptionsWhere } from 'typeorm';
import { In } from 'typeorm';

/**
 * Albums and books have no title or date in the media table, so the music
 * and books libraries are sorted and filtered with what Lidarr and Chaptarr
 * know about them. Titles neither service knows go last.
 */

export const MEDIA_LIBRARY_SORTS = ['title', 'creator', 'releaseDate'] as const;
export type MediaLibrarySort = (typeof MEDIA_LIBRARY_SORTS)[number];

export const MUSIC_ALBUM_TYPES = ['album', 'ep', 'single', 'other'] as const;
export type MusicAlbumType = (typeof MUSIC_ALBUM_TYPES)[number];

export const BOOK_FORMATS = ['ebook', 'audiobook', 'both'] as const;
export type BookFormat = (typeof BOOK_FORMATS)[number];

export interface LibraryItemMetadata {
  title?: string;
  // Album artist or book author
  creator?: string;
  // YYYY-MM-DD, or shorter when only the year or month is known
  releaseDate?: string;
  // Lidarr's primary type in lower case: album, ep, single, broadcast, other
  albumType?: string;
}

export type LibraryMetadataIndex = Map<string, LibraryItemMetadata>;

// Long enough that scrolling through a library asks the services once
const METADATA_TTL_MS = 10 * 60 * 1000;

const metadataCache = new Map<
  MediaType,
  { expires: number; index: Promise<LibraryMetadataIndex> }
>();

const toDate = (value: unknown): string | undefined =>
  typeof value === 'string' && /^\d{4}/.test(value)
    ? value.slice(0, 10)
    : undefined;

const buildMusicIndex = async (): Promise<LibraryMetadataIndex> => {
  const index: LibraryMetadataIndex = new Map();

  for (const server of getSettings().lidarr ?? []) {
    try {
      const lidarr = new LidarrAPI({
        apiKey: server.apiKey,
        url: LidarrAPI.buildUrl(server, '/api/v1'),
      });

      for (const album of await lidarr.getAlbums()) {
        if (!album.foreignAlbumId || index.has(album.foreignAlbumId)) {
          continue;
        }

        index.set(album.foreignAlbumId, {
          title: album.title,
          creator: album.artist?.artistName,
          releaseDate: toDate(album.releaseDate),
          albumType: album.albumType?.toLowerCase(),
        });
      }
    } catch (e) {
      logger.warn('Failed to read albums for the music library', {
        label: 'Media Library',
        server: server.name,
        errorMessage: e.message,
      });
    }
  }

  return index;
};

const buildBookIndex = async (): Promise<LibraryMetadataIndex> => {
  const index: LibraryMetadataIndex = new Map();

  for (const server of getSettings().chaptarr ?? []) {
    try {
      const chaptarr = new ChaptarrAPI({
        apiKey: server.apiKey,
        url: ChaptarrAPI.buildUrl(server, '/api/v1'),
      });

      for (const book of await chaptarr.getAllBooks()) {
        const metadata: LibraryItemMetadata = {
          title: book.title,
          creator: book.author?.authorName,
          releaseDate: toDate(book.releaseDate),
        };
        const olId = book.openLibraryWorkId?.replace(/^ol:/i, '');

        // Books are found by their Chaptarr id or their OpenLibrary work
        for (const key of [book.foreignBookId, olId]) {
          if (key && !index.has(key)) {
            index.set(key, metadata);
          }
        }
      }
    } catch (e) {
      logger.warn('Failed to read books for the books library', {
        label: 'Media Library',
        server: server.name,
        errorMessage: e.message,
      });
    }
  }

  return index;
};

/**
 * What Lidarr (for music) or Chaptarr (for books) knows about the titles in
 * the library, kept for a few minutes
 */
export const getLibraryMetadata = (
  mediaType: MediaType.MUSIC | MediaType.BOOK
): Promise<LibraryMetadataIndex> => {
  const cached = metadataCache.get(mediaType);

  if (cached && cached.expires > Date.now()) {
    return cached.index;
  }

  const index = (
    mediaType === MediaType.MUSIC ? buildMusicIndex() : buildBookIndex()
  ).catch(() => new Map() as LibraryMetadataIndex);

  metadataCache.set(mediaType, {
    expires: Date.now() + METADATA_TTL_MS,
    index,
  });

  return index;
};

export const clearLibraryMetadataCache = (): void => metadataCache.clear();

export const getMediaMetadata = (
  media: Pick<Media, 'mbId' | 'olId' | 'foreignBookId'>,
  index: LibraryMetadataIndex
): LibraryItemMetadata | undefined =>
  (media.mbId ? index.get(media.mbId) : undefined) ??
  (media.foreignBookId ? index.get(media.foreignBookId) : undefined) ??
  (media.olId ? index.get(media.olId) : undefined);

/** Album, EP and single by name, everything else (broadcasts too) as other */
export const matchesAlbumType = (
  metadata: LibraryItemMetadata | undefined,
  albumType: MusicAlbumType
): boolean => {
  const type = metadata?.albumType;

  if (!type) {
    return false;
  }

  return albumType === 'other'
    ? !['album', 'ep', 'single'].includes(type)
    : type === albumType;
};

const collator = new Intl.Collator('en', {
  sensitivity: 'base',
  numeric: true,
});

/**
 * Sorts library media by title, artist or author, or release date. Titles
 * with no value for the sort go last either way, and ties keep the newest
 * first.
 */
export const sortLibraryMedia = <
  T extends Pick<Media, 'id' | 'mbId' | 'olId' | 'foreignBookId'>,
>(
  media: T[],
  index: LibraryMetadataIndex,
  sort: MediaLibrarySort,
  direction: 'asc' | 'desc'
): T[] => {
  const valueOf = (item: T): string | undefined => {
    const metadata = getMediaMetadata(item, index);

    if (sort === 'creator') {
      // Albums of one artist stay together, sorted by title
      return metadata?.creator
        ? `${metadata.creator}\u0000${metadata.title ?? ''}`
        : undefined;
    }

    return metadata?.[sort] || undefined;
  };
  const values = new Map(media.map((item) => [item.id, valueOf(item)]));
  const sign = direction === 'asc' ? 1 : -1;

  return [...media].sort((a, b) => {
    const left = values.get(a.id);
    const right = values.get(b.id);

    if (!left || !right) {
      return left ? -1 : right ? 1 : b.id - a.id;
    }

    return sign * collator.compare(left, right) || b.id - a.id;
  });
};

const AVAILABLE = [MediaStatus.AVAILABLE, MediaStatus.PARTIALLY_AVAILABLE];

/**
 * Conditions for available books in a format. A book counts once either
 * format is in, unless a format is picked.
 */
export const getBookFormatWhere = (
  format: BookFormat | undefined,
  base: FindOptionsWhere<Media>
): FindOptionsWhere<Media>[] => {
  const ebook = { ...base, status: In(AVAILABLE) };
  const audiobook = { ...base, statusAudio: In(AVAILABLE) };

  switch (format) {
    case 'ebook':
      return [ebook];
    case 'audiobook':
      return [audiobook];
    case 'both':
      return [{ ...ebook, statusAudio: In(AVAILABLE) }];
    default:
      return [ebook, audiobook];
  }
};
