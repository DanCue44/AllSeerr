import LazyLibrarianAPI, {
  isLazyLibrarianConfigured,
} from '@server/api/lazylibrarian';
import ChaptarrAPI from '@server/api/servarr/chaptarr';
import LidarrAPI from '@server/api/servarr/lidarr';
import RadarrAPI from '@server/api/servarr/radarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import TheMovieDb from '@server/api/themoviedb';
import type { BookFormatChoice } from '@server/constants/media';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { removeBookFromChaptarr } from '@server/lib/chaptarrRequests';
import { getDefaultChaptarr, getSettings } from '@server/lib/settings';
import logger from '@server/logger';

export class NoRemovalServiceError extends Error {}

/**
 * Deletes an album's files and unmonitors it in the Lidarr server that holds
 * it, removing the artist as well when nothing else of theirs is monitored
 */
const removeAlbumFromLidarr = async (media: Media): Promise<void> => {
  const settings = getSettings();
  const lidarrSettings =
    settings.lidarr.find((lidarr) => lidarr.id === media.serviceId) ??
    settings.lidarr.find((lidarr) => lidarr.isDefault);

  if (!lidarrSettings || !media.mbId) {
    logger.info(
      'There is no default Lidarr server configured. Did you set any of your Lidarr servers as default?',
      {
        label: 'Media Request',
        mediaId: media.id,
      }
    );
    throw new NoRemovalServiceError(
      'No Lidarr server configured to delete media files'
    );
  }

  const lidarr = new LidarrAPI({
    apiKey: lidarrSettings.apiKey,
    url: LidarrAPI.buildUrl(lidarrSettings, '/api/v1'),
  });
  await lidarr.removeAlbumFiles(media.mbId);
};

/**
 * Takes the requested formats of a book out of LazyLibrarian. Its API cannot
 * delete files, so each format is marked Skipped: LazyLibrarian stops
 * searching for it and the library scan no longer reports it as available.
 * The files stay on disk until they are deleted in LazyLibrarian.
 */
const removeBookFromLazyLibrarian = async (
  media: Media,
  bookFormat: BookFormatChoice
): Promise<void> => {
  const settings = getSettings();

  if (!isLazyLibrarianConfigured(settings.lazylibrarian) || !media.olId) {
    throw new NoRemovalServiceError(
      'No LazyLibrarian server configured to remove books'
    );
  }

  const lazyLibrarian = new LazyLibrarianAPI(settings.lazylibrarian);
  const bookId = media.externalServiceSlug ?? media.olId;
  const book = await lazyLibrarian.getBook(bookId);

  if (!book) {
    logger.info('Book not in LazyLibrarian, nothing to remove', {
      label: 'LazyLibrarian',
      mediaId: media.id,
      bookId,
    });
    return;
  }

  if (bookFormat !== 'audiobook') {
    await lazyLibrarian.unqueueBook(book.bookId, 'eBook');
  }
  if (bookFormat !== 'ebook') {
    await lazyLibrarian.unqueueBook(book.bookId, 'AudioBook');
  }

  logger.info('Marked book as skipped in LazyLibrarian', {
    label: 'LazyLibrarian',
    mediaId: media.id,
    bookId: book.bookId,
    bookFormat,
  });
};

/**
 * Deletes the files of the requested formats of a book in the Chaptarr
 * server that holds it and stops monitoring them
 */
const removeBookFromChaptarrServer = async (
  media: Media,
  bookFormat: BookFormatChoice
): Promise<void> => {
  const settings = getSettings();
  const chaptarrSettings =
    settings.chaptarr.find((chaptarr) => chaptarr.id === media.serviceId) ??
    getDefaultChaptarr(settings.chaptarr);

  if (!chaptarrSettings) {
    throw new NoRemovalServiceError(
      'No Chaptarr server configured to delete book files'
    );
  }

  const chaptarr = new ChaptarrAPI({
    apiKey: chaptarrSettings.apiKey,
    url: ChaptarrAPI.buildUrl(chaptarrSettings, '/api/v1'),
  });
  const sameServer = media.serviceId === chaptarrSettings.id;

  await removeBookFromChaptarr(
    chaptarr,
    sameServer ? media : { foreignBookId: media.foreignBookId ?? undefined },
    bookFormat === 'both' ? ['ebook', 'audiobook'] : [bookFormat]
  );
};

/**
 * Removes a title and its files from the Radarr or Sonarr server that
 * holds it, then marks the media as deleted. Albums are removed from Lidarr
 * and books from Chaptarr or LazyLibrarian, for books only the given
 * formats.
 */
export const removeMediaFromService = async (
  media: Media,
  is4k: boolean,
  { bookFormat = 'both' }: { bookFormat?: BookFormatChoice } = {}
): Promise<void> => {
  const settings = getSettings();
  const mediaRepository = getRepository(Media);

  if (media.mediaType === MediaType.MUSIC) {
    await removeAlbumFromLidarr(media);
    media.status = MediaStatus.DELETED;
    media.resetServiceData(false);
    await mediaRepository.save(media);
    return;
  }

  if (media.mediaType === MediaType.BOOK) {
    if (settings.bookService === 'chaptarr') {
      await removeBookFromChaptarrServer(media, bookFormat);
    } else {
      await removeBookFromLazyLibrarian(media, bookFormat);
    }
    // A format that was never requested or found stays unknown
    if (bookFormat !== 'audiobook' && media.status !== MediaStatus.UNKNOWN) {
      media.status = MediaStatus.DELETED;
    }
    if (bookFormat !== 'ebook' && media.statusAudio !== MediaStatus.UNKNOWN) {
      media.statusAudio = MediaStatus.DELETED;
    }
    // The book ids are kept so a new request finds the book
    await mediaRepository.save(media);
    return;
  }

  const isMovie = media.mediaType === MediaType.MOVIE;

  let serviceSettings;
  if (isMovie) {
    serviceSettings = settings.radarr.find(
      (radarr) => radarr.isDefault && radarr.is4k === is4k
    );
  } else {
    serviceSettings = settings.sonarr.find(
      (sonarr) => sonarr.isDefault && sonarr.is4k === is4k
    );
  }

  const specificServiceId = is4k ? media.serviceId4k : media.serviceId;
  if (
    specificServiceId &&
    specificServiceId >= 0 &&
    serviceSettings?.id !== specificServiceId
  ) {
    if (isMovie) {
      serviceSettings = settings.radarr.find(
        (radarr) => radarr.id === specificServiceId
      );
    } else {
      serviceSettings = settings.sonarr.find(
        (sonarr) => sonarr.id === specificServiceId
      );
    }
  }

  if (!serviceSettings) {
    const arrName = `${is4k ? '4K ' : ''}${isMovie ? 'Radarr' : 'Sonarr'}`;
    logger.info(
      `There is no default ${arrName} server configured. Did you set any of your ${arrName} servers as default?`,
      {
        label: 'Media Request',
        mediaId: media.id,
      }
    );
    throw new NoRemovalServiceError(
      `No ${arrName} server configured to delete media files`
    );
  }

  if (isMovie) {
    const radarr = new RadarrAPI({
      apiKey: serviceSettings.apiKey,
      url: RadarrAPI.buildUrl(serviceSettings, '/api/v3'),
    });
    await radarr.removeMovie(media.tmdbId);
  } else {
    const sonarr = new SonarrAPI({
      apiKey: serviceSettings.apiKey,
      url: SonarrAPI.buildUrl(serviceSettings, '/api/v3'),
    });
    const tmdb = new TheMovieDb();
    const series = await tmdb.getTvShow({ tvId: media.tmdbId });
    const tvdbId = series.external_ids.tvdb_id ?? media.tvdbId;
    if (!tvdbId) {
      throw new Error('TVDB ID not found');
    }
    await sonarr.removeSeries(tvdbId);

    for (const season of media.seasons ?? []) {
      season[is4k ? 'status4k' : 'status'] = MediaStatus.DELETED;
    }
  }

  media[is4k ? 'status4k' : 'status'] = MediaStatus.DELETED;
  media.resetServiceData(is4k);
  await mediaRepository.save(media);
};
