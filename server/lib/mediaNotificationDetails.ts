import TheMovieDb from '@server/api/themoviedb';
import type { BookFormat, BookFormatChoice } from '@server/constants/media';
import { MediaType } from '@server/constants/media';
import type Media from '@server/entity/Media';
import {
  getBookFormatName,
  getBookNotificationDetails,
} from '@server/lib/bookNotifications';
import { getMusicNotificationDetails } from '@server/lib/musicNotifications';

export interface MediaNotificationDetails {
  subject: string;
  message?: string;
  image?: string;
}

/**
 * Builds the subject, message and poster or cover of a notification about a
 * media item: the TMDB title for movies and series, the album and artist for
 * music, and the title and author for books
 */
export const getMediaNotificationDetails = async (
  media: Media
): Promise<MediaNotificationDetails> => {
  if (media.mediaType === MediaType.MUSIC) {
    if (!media.mbId) {
      throw new Error('Album has no MusicBrainz ID');
    }
    const { subject, message, image } = await getMusicNotificationDetails(
      media.mbId
    );
    return { subject, message, image };
  }

  if (media.mediaType === MediaType.BOOK) {
    if (!media.olId) {
      throw new Error('Book has no OpenLibrary work ID');
    }
    const { subject, message, image } = await getBookNotificationDetails(
      media.olId
    );
    return { subject, message, image };
  }

  const tmdb = new TheMovieDb();

  if (media.mediaType === MediaType.MOVIE) {
    const movie = await tmdb.getMovie({ movieId: media.tmdbId });

    return {
      subject: `${movie.title}${
        movie.release_date ? ` (${movie.release_date.slice(0, 4)})` : ''
      }`,
      message: movie.overview,
      image: `https://image.tmdb.org/t/p/w600_and_h900_bestv2${movie.poster_path}`,
    };
  }

  const tvshow = await tmdb.getTvShow({ tvId: media.tmdbId });

  return {
    subject: `${tvshow.name}${
      tvshow.first_air_date ? ` (${tvshow.first_air_date.slice(0, 4)})` : ''
    }`,
    message: tvshow.overview,
    image: `https://image.tmdb.org/t/p/w600_and_h900_bestv2${tvshow.poster_path}`,
  };
};

/**
 * Name of the book formats a removal request or issue covers
 */
export const getBookFormatChoiceName = (
  format?: BookFormatChoice | BookFormat | null
): string =>
  format === 'both' || !format
    ? 'Ebook and Audiobook'
    : getBookFormatName(format === 'audiobook');
