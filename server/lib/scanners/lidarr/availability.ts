import PlexAPI from '@server/api/plexapi';
import type LidarrAPI from '@server/api/servarr/lidarr';
import type { LidarrAlbum } from '@server/api/servarr/lidarr';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaRequest from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import {
  describeRequestError,
  requestErrorLogFields,
} from '@server/utils/requestError';
import { In } from 'typeorm';

const LABEL = 'Lidarr Scan';

/**
 * Whether Lidarr has given up on an album: it is not monitored and Lidarr
 * says it has no track files. An album without statistics is not.
 */
export const isAbandonedLidarrAlbum = (album: LidarrAlbum): boolean =>
  !album.monitored && album.statistics?.trackFileCount === 0;

/**
 * Tells whether Lidarr still has an album. Only an album Lidarr answers
 * it does not have (404), or one it has stopped monitoring with no track
 * files left, is gone. The library listing only nominates an album: one
 * missing from it, or listed as abandoned, is read again by its id. An
 * album id now holding another release group, an album without a Lidarr
 * id, or any error leaves the album as it is.
 */
export const checkLidarrAlbum = async (
  lidarr: LidarrAPI,
  media: Media,
  library: LidarrAlbum[]
): Promise<'present' | 'gone' | 'unknown'> => {
  const listed = library.filter((album) => album.foreignAlbumId === media.mbId);

  if (listed.some((album) => !isAbandonedLidarrAlbum(album))) {
    return 'present';
  }

  // Read again the abandoned copy, or the album the media is linked to
  const albumId = listed[0]?.id ?? media.externalServiceId;

  if (!albumId) {
    return 'unknown';
  }

  if (
    !listed.length &&
    library.some(
      (album) => album.id === albumId && album.foreignAlbumId !== media.mbId
    )
  ) {
    return 'unknown';
  }

  // Throws on anything but a 404, which keeps the album as it is
  const fresh = await lidarr.findAlbum(albumId);

  if (!fresh) {
    return 'gone';
  }

  if (fresh.foreignAlbumId !== media.mbId) {
    return 'unknown';
  }

  return isAbandonedLidarrAlbum(fresh) ? 'gone' : 'present';
};

/**
 * Whether the media server still has an album: present, gone when Plex
 * answers it has no such item (404), none when the album was never seen
 * there, or unknown when it cannot be told. Jellyfin and Emby albums are
 * always unknown, so they are kept.
 */
export const checkMediaServerAlbum = async (
  media: Media,
  getPlex: () => Promise<PlexAPI | undefined>
): Promise<'present' | 'gone' | 'none' | 'unknown'> => {
  const { mediaServerType } = getSettings().main;

  if (mediaServerType === MediaServerType.PLEX && media.ratingKey) {
    const plex = await getPlex();

    if (!plex) {
      return 'unknown';
    }

    try {
      const metadata = await plex.getMetadata(media.ratingKey);

      return metadata ? 'present' : 'unknown';
    } catch (e) {
      const { status } = describeRequestError(e);

      if (status === 404 || (status === undefined && /404/.test(e.message))) {
        return 'gone';
      }

      logger.debug('Could not check an album in Plex, keeping it', {
        label: LABEL,
        mediaId: media.id,
        mbId: media.mbId,
        ...requestErrorLogFields(e),
      });
      return 'unknown';
    }
  }

  if (
    (mediaServerType === MediaServerType.JELLYFIN ||
      mediaServerType === MediaServerType.EMBY) &&
    media.jellyfinMediaId
  ) {
    return 'unknown';
  }

  return 'none';
};

/**
 * Declines the approved requests of an album Lidarr dropped before it
 * finished, so it can be requested again
 */
const declineRequests = async (media: Media): Promise<void> => {
  const requestRepository = getRepository(MediaRequest);
  const requests = await requestRepository.find({
    where: { media: { id: media.id }, status: MediaRequestStatus.APPROVED },
  });

  for (const request of requests) {
    request.status = MediaRequestStatus.DECLINED;
    request.media = media;
    await requestRepository.save(request);
    logger.info('Declined the request of an album Lidarr no longer has', {
      label: LABEL,
      mediaId: media.id,
      mbId: media.mbId,
      requestId: request.id,
    });
  }
};

/**
 * Resets an album Lidarr no longer has. An available album is marked
 * deleted the way the availability sync does it, which completes its
 * approved requests, and its Lidarr link (and Plex link once Plex has
 * dropped it) is cleared unless an approved request is still in flight.
 * A processing album goes back to unknown and its approved requests are
 * declined, as the Radarr and Sonarr scans do for titles they lost.
 */
export const resetLidarrAlbum = async (
  media: Media,
  { clearRatingKey = false }: { clearRatingKey?: boolean } = {}
): Promise<void> => {
  const previous = media.status;
  const albumId = media.externalServiceId;

  if (previous === MediaStatus.PROCESSING) {
    media.status = MediaStatus.UNKNOWN;
    media.serviceId = null;
    media.externalServiceId = null;
    media.externalServiceSlug = null;
    await getRepository(Media).save(media);
    await declineRequests(media);

    logger.info(
      'Lidarr no longer has an album being processed. Status reset to unknown.',
      { label: LABEL, mediaId: media.id, mbId: media.mbId, albumId }
    );
    return;
  }

  const inFlight = await getRepository(MediaRequest).exist({
    where: {
      media: { id: media.id },
      status: MediaRequestStatus.APPROVED,
      is4k: false,
    },
  });

  media.status = MediaStatus.DELETED;

  if (!inFlight) {
    media.serviceId = null;
    media.externalServiceId = null;
    media.externalServiceSlug = null;

    if (clearRatingKey) {
      media.ratingKey = null;
    }
  }

  await getRepository(Media).save(media);

  logger.info(
    'Lidarr and the media server no longer have an album. Status changed to deleted.',
    {
      label: LABEL,
      mediaId: media.id,
      mbId: media.mbId,
      albumId,
      keptServiceData: inFlight,
    }
  );
};

/**
 * The Plex client of the admin, made once and only when an album needs it
 */
const plexGetter = (): (() => Promise<PlexAPI | undefined>) => {
  let plex: Promise<PlexAPI | undefined> | undefined;

  return () => {
    plex ??= getRepository(User)
      .findOne({ select: { id: true, plexToken: true }, where: { id: 1 } })
      .then((admin) =>
        admin?.plexToken
          ? new PlexAPI({ plexToken: admin.plexToken })
          : undefined
      );

    return plex;
  };
};

/**
 * Resets the available and processing albums of a Lidarr server that
 * Lidarr no longer has. Runs only on a complete, non-empty album listing;
 * Lidarr failing to list its albums ends the scan before this. An album
 * that cannot be checked is kept, and an available album the media
 * server still has (or might have) stays available.
 */
export const syncLidarrAvailability = async (
  lidarr: LidarrAPI,
  serverIds: number[],
  albums: LidarrAlbum[],
  isRunning: () => boolean = () => true
): Promise<void> => {
  if (albums.length === 0) {
    logger.info('Lidarr listed no albums, skipping its availability check', {
      label: LABEL,
    });
    return;
  }

  const tracked = await getRepository(Media).find({
    where: {
      mediaType: MediaType.MUSIC,
      serviceId: In(serverIds),
      status: In([MediaStatus.AVAILABLE, MediaStatus.PROCESSING]),
    },
  });
  const getPlex = plexGetter();

  for (const media of tracked) {
    if (!isRunning()) {
      return;
    }

    try {
      if ((await checkLidarrAlbum(lidarr, media, albums)) !== 'gone') {
        continue;
      }

      if (media.status === MediaStatus.PROCESSING) {
        await resetLidarrAlbum(media);
        continue;
      }

      const inMediaServer = await checkMediaServerAlbum(media, getPlex);

      if (inMediaServer === 'present' || inMediaServer === 'unknown') {
        logger.debug(
          'Lidarr no longer has an album the media server still has, keeping it',
          { label: LABEL, mediaId: media.id, mbId: media.mbId }
        );
        continue;
      }

      await resetLidarrAlbum(media, {
        clearRatingKey: inMediaServer === 'gone',
      });
    } catch (e) {
      logger.debug('Could not check an album in Lidarr, keeping it', {
        label: LABEL,
        mediaId: media.id,
        mbId: media.mbId,
        ...requestErrorLogFields(e),
      });
    }
  }
};
