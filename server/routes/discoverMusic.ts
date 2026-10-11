import ListenBrainzAPI, {
  getListenBrainzCoverUrl,
} from '@server/api/listenbrainz';
import TheAudioDb from '@server/api/theaudiodb';
import Media from '@server/entity/Media';
import { getAlbumHeroes } from '@server/lib/heroBackdrops';
import {
  getMusicGenrePool,
  isMusicGenre,
  selectGenreAlbums,
} from '@server/lib/musicGenres';
import logger from '@server/logger';
import type { AlbumResult, ArtistResult } from '@server/models/Search';
import { Router } from 'express';
import { uniqBy } from 'lodash';

const discoverMusicRoutes = Router();

const PAGE_SIZE = 20;

const withMediaInfo = async (albums: AlbumResult[]): Promise<AlbumResult[]> => {
  const media = await Media.getRelatedMusic(albums.map((album) => album.id));
  const mediaMap = new Map(media.map((m) => [m.mbId, m]));

  return albums.map((album) => ({
    ...album,
    mediaInfo: mediaMap.get(album.id),
  }));
};

/**
 * Albums released in the past weeks, newest first
 */
discoverMusicRoutes.get('/', async (req, res, next) => {
  const listenbrainz = new ListenBrainzAPI();
  const page = Number(req.query.page) || 1;

  try {
    const data = await listenbrainz.getFreshReleases();
    // Singles make up most new releases, so only albums and EPs are listed
    const releases = uniqBy(
      data.payload.releases.filter(
        (release) =>
          release.release_group_mbid &&
          (release.release_group_primary_type === 'Album' ||
            release.release_group_primary_type === 'EP')
      ),
      'release_group_mbid'
    );

    const albums = releases
      .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      .map((release): AlbumResult => {
        const posterPath = getListenBrainzCoverUrl(release);

        return {
          id: release.release_group_mbid,
          mediaType: 'album',
          title: release.release_name,
          albumType: release.release_group_primary_type ?? undefined,
          secondaryTypes: release.release_group_secondary_type
            ? [release.release_group_secondary_type]
            : [],
          releaseDate: release.release_date,
          artistId: release.artist_mbids[0],
          artistName: release.artist_credit_name,
          posterPath,
          needsCoverArt: !posterPath,
        };
      });

    return res.status(200).json({
      page,
      totalPages: Math.ceil(releases.length / PAGE_SIZE),
      totalResults: releases.length,
      results: await withMediaInfo(albums),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving new music releases', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve new music releases.',
    });
  }
});

const getTopAlbums = async (page: number) => {
  const data = await new ListenBrainzAPI().getTopAlbums({
    offset: (page - 1) * PAGE_SIZE,
    count: PAGE_SIZE,
  });

  // ListenBrainz can list the same release group twice, once per edition
  const albums = uniqBy(
    data.payload.release_groups.filter(
      (releaseGroup) => releaseGroup.release_group_mbid
    ),
    'release_group_mbid'
  ).map((releaseGroup): AlbumResult => {
    const posterPath = getListenBrainzCoverUrl(releaseGroup);

    return {
      id: releaseGroup.release_group_mbid as string,
      mediaType: 'album',
      title: releaseGroup.release_group_name,
      artistId: releaseGroup.artist_mbids[0],
      artistName: releaseGroup.artist_name,
      posterPath,
      needsCoverArt: !posterPath,
    };
  });

  return {
    albums,
    totalResults: data.payload.total_release_group_count ?? data.payload.count,
  };
};

/**
 * Albums most listened to on ListenBrainz this week
 */
discoverMusicRoutes.get('/albums', async (req, res, next) => {
  const page = Number(req.query.page) || 1;

  try {
    const { albums, totalResults } = await getTopAlbums(page);

    return res.status(200).json({
      page,
      totalPages: Math.ceil(totalResults / PAGE_SIZE),
      totalResults,
      results: await withMediaInfo(albums),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving popular albums', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve popular albums.',
    });
  }
});

/**
 * The few most listened to albums shown in the featured hero banner, with
 * their artist's fanart as a backdrop or the colours of their cover
 */
discoverMusicRoutes.get('/hero', async (_req, res, next) => {
  try {
    const { albums } = await getTopAlbums(1);

    return res.status(200).json({
      results: await withMediaInfo(await getAlbumHeroes(albums)),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving the music hero', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve popular albums.',
    });
  }
});

/**
 * Artists most listened to on ListenBrainz this week
 */
discoverMusicRoutes.get('/artists', async (req, res, next) => {
  const listenbrainz = new ListenBrainzAPI();
  const page = Number(req.query.page) || 1;

  try {
    const data = await listenbrainz.getTopArtists({
      offset: (page - 1) * PAGE_SIZE,
      count: PAGE_SIZE,
    });
    const artists = uniqBy(
      data.payload.artists.filter((artist) => artist.artist_mbid),
      'artist_mbid'
    );
    // Kept in the database once looked up, so only new artists are fetched
    const images = await new TheAudioDb().batchGetArtistImages(
      artists.map((artist) => artist.artist_mbid as string)
    );
    const totalResults = data.payload.total_artist_count ?? data.payload.count;

    return res.status(200).json({
      page,
      totalPages: Math.ceil(totalResults / PAGE_SIZE),
      totalResults,
      results: artists.map(
        (artist): ArtistResult => ({
          id: artist.artist_mbid as string,
          mediaType: 'artist',
          name: artist.artist_name,
          artistThumb:
            images[artist.artist_mbid as string]?.artistThumb ?? null,
          artistBackdrop:
            images[artist.artist_mbid as string]?.artistBackground ?? null,
        })
      ),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving popular artists', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve popular artists.',
    });
  }
});

/**
 * Popular albums of a genre, from the albums most listened to on
 * ListenBrainz this month, this year and of all time
 */
discoverMusicRoutes.get<{ genre: string }>(
  '/genre/:genre',
  async (req, res, next) => {
    const { genre } = req.params;

    if (!isMusicGenre(genre)) {
      return next({ status: 404, message: 'Unknown music genre.' });
    }

    const page = Number(req.query.page) || 1;

    try {
      const items = selectGenreAlbums(await getMusicGenrePool(), genre);
      const albums = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(
        (item): AlbumResult => ({
          id: item.id,
          mediaType: 'album',
          title: item.title,
          albumType: item.albumType,
          releaseDate: item.releaseDate,
          artistId: item.artistId,
          artistName: item.artistName,
          posterPath: item.posterPath,
          needsCoverArt: !item.posterPath,
        })
      );

      return res.status(200).json({
        page,
        totalPages: Math.ceil(items.length / PAGE_SIZE),
        totalResults: items.length,
        results: await withMediaInfo(albums),
      });
    } catch (e) {
      logger.debug('Something went wrong retrieving genre albums', {
        label: 'API',
        errorMessage: e.message,
        genre,
      });
      return next({
        status: 500,
        message: 'Unable to retrieve albums for this genre.',
      });
    }
  }
);

export default discoverMusicRoutes;
