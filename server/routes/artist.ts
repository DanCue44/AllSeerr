import ListenBrainzAPI from '@server/api/listenbrainz';
import MusicBrainz from '@server/api/musicbrainz';
import type { MbReleaseGroup } from '@server/api/musicbrainz/interfaces';
import TheAudioDb from '@server/api/theaudiodb';
import { FollowType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MetadataAlbum from '@server/entity/MetadataAlbum';
import {
  DISCOGRAPHY_RELEASE_GROUP_PAGES,
  getArtistReleaseGroups,
} from '@server/lib/catalogs';
import { isOnUserWatchlist } from '@server/lib/watchlistStatus';
import logger from '@server/logger';
import { mapAlbumResult, mapArtistDetails } from '@server/models/Music';
import type { ArtistResult } from '@server/models/Search';
import { Router } from 'express';
import { In } from 'typeorm';

const artistRoutes = Router();

// Similar artists shown on an artist page, so their images are looked up
// for one row of cards at most
const SIMILAR_ARTISTS_COUNT = 20;

const MBID_REGEX =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Groups a release group the way MusicBrainz shows discographies: by its
 * first secondary type (Live, Compilation...) and otherwise by primary type
 */
export const getReleaseGroupType = (releaseGroup: MbReleaseGroup): string =>
  releaseGroup['secondary-types']?.[0] ??
  releaseGroup['primary-type'] ??
  'Other';

// Newest first, undated release groups last
const byReleaseDate = (a: MbReleaseGroup, b: MbReleaseGroup) =>
  (b['first-release-date'] ?? '').localeCompare(a['first-release-date'] ?? '');

/**
 * Artist details and discography, by MusicBrainz artist id
 */
artistRoutes.get<{ id: string }>('/:id', async (req, res, next) => {
  if (!MBID_REGEX.test(req.params.id)) {
    return next({ status: 404, message: 'Artist not found.' });
  }

  const musicbrainz = new MusicBrainz();
  const theAudioDb = new TheAudioDb();

  try {
    const artist = await musicbrainz.getArtist({ artistId: req.params.id });
    const { releaseGroups, total } = await getArtistReleaseGroups(
      musicbrainz,
      artist.id
    );

    releaseGroups.sort(byReleaseDate);

    const releaseGroupIds = releaseGroups.map(
      (releaseGroup) => releaseGroup.id
    );

    const [media, albumMetadata, artistImages, extract] = await Promise.all([
      Media.getRelatedMusic(releaseGroupIds),
      releaseGroupIds.length > 0
        ? getRepository(MetadataAlbum).find({
            where: { mbAlbumId: In(releaseGroupIds) },
            select: ['mbAlbumId', 'caaUrl'],
          })
        : [],
      theAudioDb.getArtistImages(artist.id).catch(() => null),
      musicbrainz
        .getArtistWikipediaExtract({
          artistMbid: artist.id,
          language: req.locale,
        })
        .catch(() => null),
    ]);

    // MusicBrainz serves the Wikipedia extract from its website, which can
    // sit behind a browser check. TheAudioDB has the same text as a fallback,
    // without a Wikipedia link.
    let wikipedia = extract;

    if (!wikipedia) {
      const biography = await theAudioDb.getArtistBiography(
        artist.id,
        req.locale
      );
      wikipedia = biography
        ? { title: artist.name, url: '', content: biography }
        : null;
    }

    const onUserWatchlist = await isOnUserWatchlist(
      req.user,
      FollowType.ARTIST,
      artist.id
    );

    const mediaMap = new Map(media.map((m) => [m.mbId, m]));
    const coverMap = new Map(
      albumMetadata.map((metadata) => [metadata.mbAlbumId, metadata.caaUrl])
    );

    const typeCounts = releaseGroups.reduce<Record<string, number>>(
      (counts, releaseGroup) => {
        const type = getReleaseGroupType(releaseGroup);
        counts[type] = (counts[type] ?? 0) + 1;
        return counts;
      },
      {}
    );

    return res.status(200).json({
      ...mapArtistDetails(artist),
      wikipedia,
      artistThumb: artistImages?.artistThumb ?? null,
      artistBackdrop: artistImages?.artistBackground ?? null,
      releaseGroups: releaseGroups.map((releaseGroup) =>
        mapAlbumResult(
          releaseGroup,
          mediaMap.get(releaseGroup.id),
          coverMap.get(releaseGroup.id)
        )
      ),
      typeCounts,
      totalReleaseGroups: total,
      onUserWatchlist,
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving artist', {
      label: 'API',
      errorMessage: e.message,
      artistId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve artist.',
    });
  }
});

/**
 * The whole discography of an artist, for requesting it in one go. The
 * artist page reads only the first pages of release groups.
 */
artistRoutes.get<{ id: string }>('/:id/discography', async (req, res, next) => {
  if (!MBID_REGEX.test(req.params.id)) {
    return next({ status: 404, message: 'Artist not found.' });
  }

  const musicbrainz = new MusicBrainz();

  try {
    const artist = await musicbrainz.getArtist({ artistId: req.params.id });
    const { releaseGroups, total } = await getArtistReleaseGroups(
      musicbrainz,
      artist.id,
      DISCOGRAPHY_RELEASE_GROUP_PAGES
    );

    releaseGroups.sort(byReleaseDate);

    const media = await Media.getRelatedMusic(
      releaseGroups.map((releaseGroup) => releaseGroup.id)
    );
    const mediaMap = new Map(media.map((m) => [m.mbId, m]));

    return res.status(200).json({
      artistId: artist.id,
      artistName: artist.name,
      releaseGroups: releaseGroups.map((releaseGroup) =>
        mapAlbumResult(releaseGroup, mediaMap.get(releaseGroup.id))
      ),
      totalReleaseGroups: total,
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving artist discography', {
      label: 'API',
      errorMessage: e.message,
      artistId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve artist discography.',
    });
  }
});

/**
 * Artists similar to an artist, from ListenBrainz, with their images. An
 * empty list when ListenBrainz cannot be reached, so the artist page just
 * leaves the row out.
 */
artistRoutes.get<{ id: string }>('/:id/similar', async (req, res, next) => {
  if (!MBID_REGEX.test(req.params.id)) {
    return next({ status: 404, message: 'Artist not found.' });
  }

  try {
    const similar = (
      await new ListenBrainzAPI().getSimilarArtists(
        req.params.id.toLowerCase(),
        SIMILAR_ARTISTS_COUNT
      )
    )
      .filter((artist) => MBID_REGEX.test(artist.mbid))
      .slice(0, SIMILAR_ARTISTS_COUNT);
    // Kept in the database once looked up, so only new artists are fetched
    const images = await new TheAudioDb().batchGetArtistImages(
      similar.map((artist) => artist.mbid)
    );

    return res.status(200).json({
      results: similar.map(
        (artist): ArtistResult => ({
          id: artist.mbid,
          mediaType: 'artist',
          name: artist.name,
          type: artist.type,
          disambiguation: artist.comment,
          artistThumb: images[artist.mbid]?.artistThumb ?? null,
          artistBackdrop: images[artist.mbid]?.artistBackground ?? null,
        })
      ),
    });
  } catch (e) {
    logger.debug('Could not retrieve similar artists', {
      label: 'API',
      errorMessage: e.message,
      artistId: req.params.id,
    });
    return res.status(200).json({ results: [] });
  }
});

export default artistRoutes;
