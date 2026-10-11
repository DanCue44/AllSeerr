import MusicBrainz from '@server/api/musicbrainz';
import OpenLibrary, { getOlId } from '@server/api/openlibrary';
import { FollowType, MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import type Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import type { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import {
  getBookFormatName,
  getBookNotificationDetails,
} from '@server/lib/bookNotifications';
import { getMediaListIdField } from '@server/lib/mediaListKeys';
import { getMusicNotificationDetails } from '@server/lib/musicNotifications';
import notificationManager, { Notification } from '@server/lib/notifications';
import { alreadyNotified } from '@server/lib/watchlistNotifications';
import logger from '@server/logger';
import type { EntityManager } from 'typeorm';
import { In } from 'typeorm';

export interface FollowerRecipient {
  user: User;
  // Name of the artist or author the user follows, as it was followed
  name: string;
}

/**
 * Artists are followed for their albums, authors for their books
 */
export const getFollowType = (mediaType: MediaType): FollowType | null =>
  mediaType === MediaType.MUSIC
    ? FollowType.ARTIST
    : mediaType === MediaType.BOOK
      ? FollowType.AUTHOR
      : null;

/**
 * Whether anyone follows an artist, or an author
 */
export const hasFollowers = (
  followType: FollowType,
  manager?: EntityManager
): Promise<boolean> =>
  (manager?.getRepository(Watchlist) ?? getRepository(Watchlist)).exist({
    where: { mediaType: followType },
  });

/**
 * Whether a save made an album or book available: an album once it is
 * available, a book once its first format is. Returns the format that
 * landed, or null when nothing new became available.
 */
export const getNewlyAvailable = (
  media: Pick<Media, 'mediaType' | 'status' | 'statusAudio'>,
  previous?: Pick<Media, 'status' | 'statusAudio'> | null
): { isAudiobook: boolean } | null => {
  if (media.mediaType === MediaType.MUSIC) {
    return media.status === MediaStatus.AVAILABLE &&
      previous?.status !== MediaStatus.AVAILABLE
      ? { isAudiobook: false }
      : null;
  }

  if (media.mediaType !== MediaType.BOOK) {
    return null;
  }

  if (
    previous?.status === MediaStatus.AVAILABLE ||
    previous?.statusAudio === MediaStatus.AVAILABLE
  ) {
    return null;
  }

  if (media.status === MediaStatus.AVAILABLE) {
    return { isAudiobook: false };
  }

  return media.statusAudio === MediaStatus.AVAILABLE
    ? { isAudiobook: true }
    : null;
};

/**
 * The title of an album or book and the ids of its artists or authors
 */
const getCredits = async (
  media: Media
): Promise<{ title: string; creatorIds: string[] }> => {
  if (media.mediaType === MediaType.MUSIC && media.mbId) {
    const album = await new MusicBrainz().getAlbum({
      releaseGroupId: media.mbId,
    });

    return {
      title: album.title,
      creatorIds: (album['artist-credit'] ?? []).map(
        (credit) => credit.artist.id
      ),
    };
  }

  if (media.mediaType === MediaType.BOOK && media.olId) {
    const work = await new OpenLibrary().getWork(media.olId);

    return {
      title: work.title,
      creatorIds: (work.authors ?? []).map((author) =>
        getOlId(author.author.key)
      ),
    };
  }

  return { title: '', creatorIds: [] };
};

/**
 * Users who follow an artist of the album or an author of the book, each
 * with the name of the first one they follow. Users who requested it
 * themselves are left out, they are notified through their request.
 */
export const getFollowerRecipients = async (
  media: Media,
  creatorIds: string[]
): Promise<FollowerRecipient[]> => {
  const followType = getFollowType(media.mediaType);

  if (!followType || !creatorIds.length) {
    return [];
  }

  const field = getMediaListIdField(followType);
  const follows = await getRepository(Watchlist).find({
    where: { mediaType: followType, [field]: In(creatorIds) },
  });

  if (!follows.length) {
    return [];
  }

  const requests = media.id
    ? await getRepository(MediaRequest).find({
        where: { media: { id: media.id } },
      })
    : [];
  const requesterIds = new Set(
    requests.map((request) => request.requestedBy?.id)
  );

  const recipients = new Map<number, FollowerRecipient>();

  // Credited order, so a user following two artists of an album is told
  // about the main one
  for (const creatorId of creatorIds) {
    for (const follow of follows) {
      const user = follow.requestedBy;

      if (
        follow[field] !== creatorId ||
        !user ||
        requesterIds.has(user.id) ||
        recipients.has(user.id)
      ) {
        continue;
      }

      recipients.set(user.id, { user, name: follow.title });
    }
  }

  return [...recipients.values()];
};

/**
 * Tells the followers of an album's artists or a book's authors that it is
 * now available. Nothing is looked up unless someone follows an artist or
 * author at all.
 */
export const notifyFollowers = async (
  media: Media,
  { isAudiobook }: { isAudiobook?: boolean } = {}
): Promise<void> => {
  const followType = getFollowType(media.mediaType);

  if (!followType) {
    return;
  }

  try {
    if (!(await hasFollowers(followType))) {
      return;
    }

    const { title, creatorIds } = await getCredits(media);
    const recipients = (await getFollowerRecipients(media, creatorIds)).filter(
      ({ user }) => !alreadyNotified(media.id, user.id)
    );

    if (!recipients.length) {
      return;
    }

    const isBook = followType === FollowType.AUTHOR;
    const details = isBook
      ? await getBookNotificationDetails(media.olId ?? '')
      : await getMusicNotificationDetails(media.mbId ?? '');

    for (const { user, name } of recipients) {
      notificationManager.sendNotification(Notification.MEDIA_AVAILABLE, {
        event: isBook ? 'Followed Author' : 'Followed Artist',
        subject: `A new ${isBook ? 'book' : 'album'} by ${name} is available: ${title}`,
        message: details.message,
        image: details.image,
        media,
        notifyAdmin: false,
        notifySystem: false,
        notifyUser: user,
        extra: isBook
          ? [{ name: 'Format', value: getBookFormatName(isAudiobook) }]
          : undefined,
      });
    }

    logger.info('Sent availability notifications to followers', {
      label: 'Notifications',
      mediaId: media.id,
      users: recipients.length,
    });
  } catch (e) {
    logger.error('Failed to notify followers', {
      label: 'Notifications',
      errorMessage: e.message,
      mediaId: media.id,
    });
  }
};
