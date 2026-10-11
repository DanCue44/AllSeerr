import MusicBrainz from '@server/api/musicbrainz';
import TheAudioDb from '@server/api/theaudiodb';
import TheMovieDb from '@server/api/themoviedb';
import type { TmdbSearchMultiResponse } from '@server/api/themoviedb/interfaces';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MetadataAlbum from '@server/entity/MetadataAlbum';
import { searchBooks } from '@server/lib/bookSearch';
import { rankMusicResult } from '@server/lib/musicSearchRank';
import { findSearchProvider } from '@server/lib/search';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { mapAlbumResult, mapArtistResult } from '@server/models/Music';
import type { AlbumResult, ArtistResult } from '@server/models/Search';
import { mapSearchResults } from '@server/models/Search';
import { Router } from 'express';
import { In } from 'typeorm';

const searchRoutes = Router();

const MUSIC_PAGE_SIZE = 20;

/**
 * Searches MusicBrainz for albums and artists, best matches first
 */
export const searchMusic = async ({
  query,
  page = 1,
}: {
  query: string;
  page?: number;
}): Promise<{
  results: (AlbumResult | ArtistResult)[];
  totalResults: number;
}> => {
  const musicbrainz = new MusicBrainz();
  const theAudioDb = new TheAudioDb();
  const offset = (page - 1) * MUSIC_PAGE_SIZE;

  const [albums, artists] = await Promise.all([
    musicbrainz
      .searchAlbum({ query, limit: MUSIC_PAGE_SIZE, offset })
      .catch(() => []),
    musicbrainz
      .searchArtist({ query, limit: MUSIC_PAGE_SIZE, offset })
      .catch(() => []),
  ]);

  const albumIds = albums.map((album) => album.id);

  const [media, albumMetadata, artistImages] = await Promise.all([
    Media.getRelatedMusic(albumIds),
    albumIds.length > 0
      ? getRepository(MetadataAlbum).find({
          where: { mbAlbumId: In(albumIds) },
          select: ['mbAlbumId', 'caaUrl'],
        })
      : [],
    theAudioDb
      .batchGetArtistImages(artists.map((artist) => artist.id))
      .catch(
        () => ({}) as Awaited<ReturnType<TheAudioDb['batchGetArtistImages']>>
      ),
  ]);

  const mediaMap = new Map(media.map((m) => [m.mbId, m]));
  const coverMap = new Map(
    albumMetadata.map((metadata) => [metadata.mbAlbumId, metadata.caaUrl])
  );

  const results = [
    ...albums.map((album) =>
      mapAlbumResult(album, mediaMap.get(album.id), coverMap.get(album.id))
    ),
    ...artists.map((artist) =>
      mapArtistResult(artist, artistImages[artist.id])
    ),
  ].sort((a, b) => rankMusicResult(query, b) - rankMusicResult(query, a));

  return {
    results,
    totalResults: results.length,
  };
};

searchRoutes.get('/', async (req, res, next) => {
  const queryString = req.query.query as string;
  const page = Number(req.query.page) || 1;
  const searchType = (req.query.type as string | undefined) ?? 'all';
  const searchProvider = findSearchProvider(queryString.toLowerCase());
  let results: TmdbSearchMultiResponse;

  try {
    if (searchType === 'music') {
      const musicResults = await searchMusic({ query: queryString });

      // MusicBrainz scores fall off quickly past the best matches, so music
      // is a single page
      return res.status(200).json({
        page: 1,
        totalPages: 1,
        totalResults: musicResults.totalResults,
        results: musicResults.results,
      });
    }

    if (searchType === 'book') {
      const bookResults = await searchBooks({ query: queryString, page });

      return res.status(200).json({
        page,
        totalPages: bookResults.totalPages,
        totalResults: bookResults.totalResults,
        results: bookResults.results,
      });
    }

    if (searchProvider) {
      const [id] = queryString
        .toLowerCase()
        .match(searchProvider.pattern) as RegExpMatchArray;
      results = await searchProvider.search({
        id,
        language: (req.query.language as string) ?? req.locale,
        query: queryString,
      });
    } else {
      const tmdb = new TheMovieDb();

      results = await tmdb.searchMulti({
        query: queryString,
        page: Number(req.query.page),
        language: (req.query.language as string) ?? req.locale,
      });
    }

    const media = await Media.getRelatedMedia(
      req.user,
      results.results.map((result) => ({
        tmdbId: result.id,
        mediaType: result.media_type,
      }))
    );

    // Music joins the first page when Lidarr can fulfil music requests
    const musicResults =
      !searchProvider && page === 1 && getSettings().lidarr.length > 0
        ? await searchMusic({ query: queryString }).catch(() => undefined)
        : undefined;

    // Books join the first page when Chaptarr or LazyLibrarian can fulfil
    // book requests
    const bookResults =
      !searchProvider && page === 1 && getSettings().bookService
        ? await searchBooks({
            query: queryString,
            bookLimit: 10,
            authorLimit: 3,
          }).catch(() => undefined)
        : undefined;

    return res.status(200).json({
      page: results.page,
      totalPages: results.total_pages,
      totalResults:
        results.total_results +
        (musicResults?.totalResults ?? 0) +
        (bookResults?.results.length ?? 0),
      results: [
        ...mapSearchResults(results.results, media),
        ...(musicResults?.results ?? []),
        ...(bookResults?.results ?? []),
      ],
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving search results', {
      label: 'API',
      errorMessage: e.message,
      query: req.query.query,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve search results.',
    });
  }
});

searchRoutes.get('/keyword', async (req, res, next) => {
  const tmdb = new TheMovieDb();

  try {
    const results = await tmdb.searchKeyword({
      query: req.query.query as string,
      page: Number(req.query.page),
    });

    return res.status(200).json(results);
  } catch (e) {
    logger.debug('Something went wrong retrieving keyword search results', {
      label: 'API',
      errorMessage: e.message,
      query: req.query.query,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve keyword search results.',
    });
  }
});

searchRoutes.get('/company', async (req, res, next) => {
  const tmdb = new TheMovieDb();

  try {
    const results = await tmdb.searchCompany({
      query: req.query.query as string,
      page: Number(req.query.page),
    });

    return res.status(200).json(results);
  } catch (e) {
    logger.debug('Something went wrong retrieving company search results', {
      label: 'API',
      errorMessage: e.message,
      query: req.query.query,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve company search results.',
    });
  }
});

export default searchRoutes;
