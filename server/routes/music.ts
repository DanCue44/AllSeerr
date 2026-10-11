import CoverArtArchive, { getLargeCoverUrl } from '@server/api/coverartarchive';
import MusicBrainz from '@server/api/musicbrainz';
import type { MbRelease } from '@server/api/musicbrainz/interfaces';
import TheAudioDb from '@server/api/theaudiodb';
import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import { isOnUserWatchlist } from '@server/lib/watchlistStatus';
import logger from '@server/logger';
import {
  mapMusicDetails,
  pickRepresentativeRelease,
} from '@server/models/Music';
import { Router } from 'express';

const musicRoutes = Router();

const MBID_REGEX =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Album details, by MusicBrainz release group id
 */
musicRoutes.get<{ id: string }>('/:id', async (req, res, next) => {
  if (!MBID_REGEX.test(req.params.id)) {
    return next({ status: 404, message: 'Album not found.' });
  }

  const musicbrainz = new MusicBrainz();
  const coverArtArchive = new CoverArtArchive();
  const theAudioDb = new TheAudioDb();

  try {
    const releaseGroup = await musicbrainz.getAlbum({
      releaseGroupId: req.params.id,
    });

    const representativeRelease = pickRepresentativeRelease(
      releaseGroup.releases
    );
    const artist = releaseGroup['artist-credit']?.[0]?.artist;

    // Artwork and artist extras are optional, the album renders without them
    const [release, media, coverUrl, artistImages, artistWikipedia] =
      await Promise.all([
        representativeRelease
          ? musicbrainz
              .getRelease({ releaseId: representativeRelease.id })
              .catch((): MbRelease | undefined => undefined)
          : undefined,
        Media.getMedia(releaseGroup.id, MediaType.MUSIC),
        coverArtArchive.getFrontCoverUrl(releaseGroup.id).catch(() => null),
        artist ? theAudioDb.getArtistImages(artist.id).catch(() => null) : null,
        artist
          ? musicbrainz
              .getArtistWikipediaExtract({
                artistMbid: artist.id,
                language: req.locale,
              })
              .catch(() => null)
          : null,
      ]);

    const onUserWatchlist = await isOnUserWatchlist(
      req.user,
      MediaType.MUSIC,
      releaseGroup.id
    );

    return res.status(200).json({
      ...mapMusicDetails(releaseGroup, release, media?.filter(req.user)),
      onUserWatchlist,
      posterPath: coverUrl ? getLargeCoverUrl(coverUrl) : null,
      artistThumb: artistImages?.artistThumb ?? null,
      artistBackdrop: artistImages?.artistBackground ?? null,
      artistWikipedia,
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving album', {
      label: 'API',
      errorMessage: e.message,
      mbId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve album.',
    });
  }
});

export default musicRoutes;
