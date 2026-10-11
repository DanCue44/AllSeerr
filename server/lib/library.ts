import TheMovieDb from '@server/api/themoviedb';
import type {
  TmdbMovieResult,
  TmdbTvResult,
} from '@server/api/themoviedb/interfaces';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import cacheManager from '@server/lib/cache';
import logger from '@server/logger';
import type {
  CollectionResult,
  MovieResult,
  TvResult,
} from '@server/models/Search';
import {
  mapMovieDetailsToResult,
  mapMovieResult,
  mapTvDetailsToResult,
  mapTvResult,
} from '@server/models/Search';
import { Brackets } from 'typeorm';

export const LIBRARY_PAGE_SIZE = 20;

// Parallel TMDB lookups when a page or the whole library is not cached yet. The
// TMDB client rate limits on top of this.
const LIBRARY_LOOKUP_CONCURRENCY = 10;

const LIBRARY_TTL = 43200;

export const LibrarySortOptionsIterable = [
  'mediaAdded.desc',
  'mediaAdded.asc',
  'title.asc',
  'title.desc',
  'releaseDate.desc',
  'releaseDate.asc',
  'rating.desc',
  'rating.asc',
] as const;

export type LibrarySortOptions = (typeof LibrarySortOptionsIterable)[number];

const availableStatuses = [
  MediaStatus.AVAILABLE,
  MediaStatus.PARTIALLY_AVAILABLE,
];

// A collection shows up once any of its parts is on the server or on its way
const collectionStatuses = [
  MediaStatus.PENDING,
  MediaStatus.PROCESSING,
  MediaStatus.PARTIALLY_AVAILABLE,
  MediaStatus.AVAILABLE,
];

export interface LibraryEntry {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  releaseDate?: string;
  voteAverage: number;
  genreIds: number[];
  collection?: {
    id: number;
    name: string;
    posterPath?: string;
    backdropPath?: string;
  };
  result: TmdbMovieResult | TmdbTvResult;
}

interface LibraryMedia {
  id: number;
  tmdbId: number;
  mediaType: MediaType;
  mediaAddedAt?: Date | null;
  createdAt: Date;
}

export interface LibraryPage<T> {
  page: number;
  totalPages: number;
  totalResults: number;
  results: T[];
}

const libraryCache = cacheManager.getCache('library').data;

// Shared so concurrent requests for an uncached title only ask TMDB once
const pendingLookups = new Map<string, Promise<LibraryEntry | undefined>>();

const entryKey = (media: LibraryMedia, language: string): string =>
  `${media.mediaType}-${media.tmdbId}-${language}`;

const fetchEntry = async (
  tmdb: TheMovieDb,
  media: LibraryMedia,
  language: string
): Promise<LibraryEntry | undefined> => {
  try {
    if (media.mediaType === MediaType.MOVIE) {
      const movie = await tmdb.getMovie({ movieId: media.tmdbId, language });

      return {
        tmdbId: media.tmdbId,
        mediaType: MediaType.MOVIE,
        title: movie.title,
        releaseDate: movie.release_date,
        voteAverage: movie.vote_average,
        genreIds: (movie.genres ?? []).map((genre) => genre.id),
        collection: movie.belongs_to_collection
          ? {
              id: movie.belongs_to_collection.id,
              name: movie.belongs_to_collection.name,
              posterPath: movie.belongs_to_collection.poster_path,
              backdropPath: movie.belongs_to_collection.backdrop_path,
            }
          : undefined,
        result: mapMovieDetailsToResult({
          ...movie,
          genres: movie.genres ?? [],
        }),
      };
    }

    const tv = await tmdb.getTvShow({ tvId: media.tmdbId, language });

    return {
      tmdbId: media.tmdbId,
      mediaType: MediaType.TV,
      title: tv.name,
      releaseDate: tv.first_air_date,
      voteAverage: tv.vote_average,
      genreIds: (tv.genres ?? []).map((genre) => genre.id),
      result: mapTvDetailsToResult({ ...tv, genres: tv.genres ?? [] }),
    };
  } catch (e) {
    logger.debug('Unable to look up library title on TMDB', {
      label: 'Library',
      tmdbId: media.tmdbId,
      mediaType: media.mediaType,
      errorMessage: e.message,
    });
    return undefined;
  }
};

const getEntry = async (
  tmdb: TheMovieDb,
  media: LibraryMedia,
  language: string
): Promise<LibraryEntry | undefined> => {
  const key = entryKey(media, language);
  const cached = libraryCache.get<LibraryEntry>(key);

  if (cached) {
    return cached;
  }

  let pending = pendingLookups.get(key);

  if (!pending) {
    pending = fetchEntry(tmdb, media, language)
      .then((entry) => {
        if (entry) {
          libraryCache.set(key, entry, LIBRARY_TTL);
        }
        return entry;
      })
      .finally(() => pendingLookups.delete(key));
    pendingLookups.set(key, pending);
  }

  return pending;
};

const getEntries = async (
  media: LibraryMedia[],
  language: string
): Promise<(LibraryEntry | undefined)[]> => {
  const tmdb = new TheMovieDb();
  const results = new Array<LibraryEntry | undefined>(media.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < media.length) {
      const index = nextIndex++;
      results[index] = await getEntry(tmdb, media[index], language);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(LIBRARY_LOOKUP_CONCURRENCY, media.length) },
      () => worker()
    )
  );

  return results;
};

const findLibraryMedia = async (
  mediaType: MediaType,
  statuses: MediaStatus[]
): Promise<LibraryMedia[]> =>
  getRepository(Media)
    .createQueryBuilder('media')
    .select([
      'media.id',
      'media.tmdbId',
      'media.mediaType',
      'media.mediaAddedAt',
      'media.createdAt',
    ])
    .where('media.mediaType = :mediaType', { mediaType })
    .andWhere(
      new Brackets((qb) => {
        qb.where('media.status IN (:...statuses)', { statuses }).orWhere(
          'media.status4k IN (:...statuses)',
          { statuses }
        );
      })
    )
    .getMany();

const addedTime = (media: LibraryMedia): number =>
  new Date(media.mediaAddedAt ?? media.createdAt).getTime();

// Titles without a release date or rating always sort last
const compareOptional = <T>(
  a: T | undefined,
  b: T | undefined,
  compare: (a: T, b: T) => number
): number => {
  if (a === undefined || a === null || a === '') {
    return b === undefined || b === null || b === '' ? 0 : 1;
  }
  if (b === undefined || b === null || b === '') {
    return -1;
  }
  return compare(a, b);
};

const sortEntries = (
  entries: LibraryEntry[],
  sortBy: LibrarySortOptions,
  language: string
): LibraryEntry[] => {
  const [field, direction] = sortBy.split('.');
  const sign = direction === 'asc' ? 1 : -1;
  const collator = new Intl.Collator(language, { sensitivity: 'base' });

  return [...entries].sort((a, b) => {
    switch (field) {
      case 'title':
        return sign * collator.compare(a.title, b.title);
      case 'releaseDate':
        return compareOptional(
          a.releaseDate,
          b.releaseDate,
          (x, y) => sign * x.localeCompare(y)
        );
      case 'rating':
        return compareOptional(
          a.voteAverage || undefined,
          b.voteAverage || undefined,
          (x, y) => sign * (x - y)
        );
      default:
        return 0;
    }
  });
};

const paginate = <T>(items: T[], page: number) =>
  items.slice((page - 1) * LIBRARY_PAGE_SIZE, page * LIBRARY_PAGE_SIZE);

const mapResults = async (
  entries: LibraryEntry[],
  user?: User
): Promise<(MovieResult | TvResult)[]> => {
  // Loaded with the user's watchlist so the cards show the watchlist state
  const media = await Media.getRelatedMedia(user, entries);

  return entries.map((entry) => {
    const mediaInfo = media.find(
      (m) => m.tmdbId === entry.tmdbId && m.mediaType === entry.mediaType
    );

    return entry.mediaType === MediaType.MOVIE
      ? mapMovieResult(entry.result as TmdbMovieResult, mediaInfo)
      : mapTvResult(entry.result as TmdbTvResult, mediaInfo);
  });
};

export const getLibraryTitles = async ({
  mediaType,
  sortBy = 'mediaAdded.desc',
  genreIds = [],
  page = 1,
  language,
  user,
}: {
  mediaType: MediaType;
  sortBy?: LibrarySortOptions;
  genreIds?: number[];
  page?: number;
  language: string;
  user?: User;
}): Promise<LibraryPage<MovieResult | TvResult>> => {
  const media = await findLibraryMedia(mediaType, availableStatuses);

  let entries: LibraryEntry[];
  let totalResults: number;

  if (sortBy.startsWith('mediaAdded') && genreIds.length === 0) {
    // Sorting by date added only needs TMDB for the requested page
    const sign = sortBy === 'mediaAdded.asc' ? 1 : -1;
    const sorted = [...media].sort(
      (a, b) => sign * (addedTime(a) - addedTime(b)) || b.id - a.id
    );
    const pageEntries = await getEntries(paginate(sorted, page), language);

    entries = pageEntries.filter((entry): entry is LibraryEntry => !!entry);
    totalResults = sorted.length;
  } else {
    // Every other sort and the genre filter need metadata for the whole library
    const addedOrder = new Map(media.map((m) => [m.tmdbId, addedTime(m)]));
    const allEntries = (await getEntries(media, language)).filter(
      (entry): entry is LibraryEntry =>
        !!entry && genreIds.every((genreId) => entry.genreIds.includes(genreId))
    );

    const sorted = sortBy.startsWith('mediaAdded')
      ? allEntries.sort(
          (a, b) =>
            (sortBy === 'mediaAdded.asc' ? 1 : -1) *
            ((addedOrder.get(a.tmdbId) ?? 0) - (addedOrder.get(b.tmdbId) ?? 0))
        )
      : sortEntries(allEntries, sortBy, language);

    entries = paginate(sorted, page);
    totalResults = sorted.length;
  }

  return {
    page,
    totalPages: Math.ceil(totalResults / LIBRARY_PAGE_SIZE),
    totalResults,
    results: await mapResults(entries, user),
  };
};

export const getLibraryCollections = async ({
  page = 1,
  language,
}: {
  page?: number;
  language: string;
}): Promise<LibraryPage<CollectionResult>> => {
  const media = await findLibraryMedia(MediaType.MOVIE, collectionStatuses);
  const entries = await getEntries(media, language);

  const collections = new Map<number, CollectionResult>();

  for (const entry of entries) {
    if (!entry?.collection || collections.has(entry.collection.id)) {
      continue;
    }

    collections.set(entry.collection.id, {
      id: entry.collection.id,
      mediaType: 'collection',
      adult: false,
      originalLanguage: '',
      originalTitle: entry.collection.name,
      title: entry.collection.name,
      overview: '',
      backdropPath: entry.collection.backdropPath,
      posterPath: entry.collection.posterPath,
    });
  }

  const collator = new Intl.Collator(language, { sensitivity: 'base' });
  const sorted = [...collections.values()].sort((a, b) =>
    collator.compare(a.title, b.title)
  );

  return {
    page,
    totalPages: Math.ceil(sorted.length / LIBRARY_PAGE_SIZE),
    totalResults: sorted.length,
    results: paginate(sorted, page),
  };
};
