import type Media from '@server/entity/Media';
import type { BookDetails } from '@server/models/Book';
import type { MovieDetails } from '@server/models/Movie';
import type { MusicDetails } from '@server/models/Music';
import type { TvDetails } from '@server/models/Tv';

/**
 * The details of any title an issue or removal request can be about
 */
export type MediaTitle = MovieDetails | TvDetails | MusicDetails | BookDetails;

type MediaRef = Pick<Media, 'mediaType' | 'tmdbId' | 'mbId' | 'olId'>;

export const isMusicTitle = (title: MediaTitle): title is MusicDetails =>
  (title as MusicDetails).mediaType === 'album';

export const isBookTitle = (title: MediaTitle): title is BookDetails =>
  (title as BookDetails).mediaType === 'book';

export const isMovieTitle = (title: MediaTitle): title is MovieDetails =>
  !isMusicTitle(title) &&
  !isBookTitle(title) &&
  (title as MovieDetails).title !== undefined;

export const isTvTitle = (title: MediaTitle): title is TvDetails =>
  !isMusicTitle(title) && !isBookTitle(title) && !isMovieTitle(title);

/**
 * API route of a media item's details. Music is addressed by its
 * MusicBrainz id and books by their OpenLibrary work id.
 */
export const getMediaApiUrl = (media: MediaRef): string | null => {
  switch (media.mediaType) {
    case 'music':
      return media.mbId ? `/api/v1/music/${media.mbId}` : null;
    case 'book':
      return media.olId ? `/api/v1/book/${media.olId}` : null;
    default:
      return media.tmdbId ? `/api/v1/${media.mediaType}/${media.tmdbId}` : null;
  }
};

/**
 * Page of a media item
 */
export const getMediaPagePath = (media: MediaRef): string => {
  switch (media.mediaType) {
    case 'music':
      return `/music/${media.mbId}`;
    case 'book':
      return `/book/${media.olId}`;
    default:
      return `/${media.mediaType}/${media.tmdbId}`;
  }
};

export const getMediaTitleName = (title: MediaTitle): string =>
  isTvTitle(title) ? title.name : title.title;

export const getMediaTitleYear = (title: MediaTitle): string | undefined =>
  isBookTitle(title)
    ? title.firstPublishYear?.toString()
    : (isTvTitle(title) ? title.firstAirDate : title.releaseDate)?.slice(0, 4);

/**
 * The artist of an album or the authors of a book
 */
export const getMediaTitleCredit = (title: MediaTitle): string | undefined =>
  isMusicTitle(title)
    ? title.artistCredit || undefined
    : isBookTitle(title)
      ? title.authors.map((author) => author.name).join(', ') || undefined
      : undefined;

export interface MediaTitleImage {
  type: 'tmdb' | 'music' | 'book';
  src: string;
  // Album covers are square, posters and book covers are portrait
  square: boolean;
}

const POSTER_NOT_FOUND = '/images/seerr_poster_not_found.png';

export const getMediaTitlePoster = (title?: MediaTitle): MediaTitleImage => {
  if (!title) {
    return { type: 'tmdb', src: POSTER_NOT_FOUND, square: false };
  }

  if (isMusicTitle(title)) {
    return {
      type: 'music',
      src: title.posterPath ?? POSTER_NOT_FOUND,
      square: true,
    };
  }

  if (isBookTitle(title)) {
    return {
      type: 'book',
      src: title.posterPath ?? POSTER_NOT_FOUND,
      square: false,
    };
  }

  return {
    type: 'tmdb',
    src: title.posterPath
      ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${title.posterPath}`
      : POSTER_NOT_FOUND,
    square: false,
  };
};

/**
 * The wide backdrop behind a title: the TMDB backdrop, or the artist image
 * of an album. Books have none.
 */
export const getMediaTitleBackdrop = (
  title?: MediaTitle
): MediaTitleImage | undefined => {
  if (!title || isBookTitle(title)) {
    return undefined;
  }

  if (isMusicTitle(title)) {
    return title.artistBackdrop
      ? { type: 'music', src: title.artistBackdrop, square: false }
      : undefined;
  }

  return title.backdropPath
    ? {
        type: 'tmdb',
        src: `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${title.backdropPath}`,
        square: false,
      }
    : undefined;
};

/**
 * Label of an album track: its position, prefixed with the disc on albums
 * with more than one disc
 */
export const getTrackLabel = (
  track: { disc: number; position: number; name: string },
  multiDisc: boolean
): string =>
  `${multiDisc ? `${track.disc}-` : ''}${track.position}. ${track.name}`;
