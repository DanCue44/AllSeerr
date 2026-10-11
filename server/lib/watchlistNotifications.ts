import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import type Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { Watchlist } from '@server/entity/Watchlist';
import { getMediaListKey } from '@server/lib/mediaListKeys';
import notificationManager, { Notification } from '@server/lib/notifications';
import type { NotificationPayload } from '@server/lib/notifications/agents/agent';
import logger from '@server/logger';

// A series can finish several requests in a row; tell each watcher once
const RECENT_TTL = 6 * 60 * 60 * 1000;
const recentlyNotified = new Map<string, number>();

/**
 * Marks the user as told about the media, and returns whether they already
 * were. Shared with the notifications to followers of an artist or author,
 * so a user who watchlisted an album and follows its artist hears once.
 */
export const alreadyNotified = (mediaId: number, userId: number): boolean => {
  const now = Date.now();
  for (const [key, at] of recentlyNotified) {
    if (now - at > RECENT_TTL) {
      recentlyNotified.delete(key);
    }
  }

  const key = `${mediaId}:${userId}`;
  if (recentlyNotified.has(key)) {
    return true;
  }
  recentlyNotified.set(key, now);
  return false;
};

/**
 * Users who want a title but did not request it, because someone else
 * already had. That is everyone with it on their watchlist, minus anyone
 * who has a request of their own, since those users are notified through
 * their request.
 */
export const getWatchlistRecipients = async (
  media: Media,
  mediaType: MediaType
) => {
  const id =
    mediaType === MediaType.MUSIC
      ? media.mbId
      : mediaType === MediaType.BOOK
        ? media.olId
        : media.tmdbId;

  if (id === null || id === undefined) {
    return [];
  }

  const watchlists = await getRepository(Watchlist).find({
    where: { ...getMediaListKey(mediaType, id), mediaType },
  });

  if (!watchlists.length) {
    return [];
  }

  const requests = await getRepository(MediaRequest).find({
    where: { media: { id: media.id } },
  });
  const requesterIds = new Set(
    requests.map((request) => request.requestedBy?.id)
  );

  const seen = new Set<number>();

  return watchlists
    .map((watchlist) => watchlist.requestedBy)
    .filter((user) => {
      if (!user || requesterIds.has(user.id) || seen.has(user.id)) {
        return false;
      }
      seen.add(user.id);
      return true;
    });
};

/**
 * Tells every watchlisting user that a title they wanted is now available.
 * The requester's own notification is sent separately and is not repeated.
 */
export const notifyWatchlistUsers = async (
  media: Media,
  mediaType: MediaType,
  payload: Omit<
    NotificationPayload,
    'notifyUser' | 'notifyAdmin' | 'notifySystem' | 'request'
  >
): Promise<void> => {
  try {
    const recipients = (await getWatchlistRecipients(media, mediaType)).filter(
      (user) => !alreadyNotified(media.id, user.id)
    );

    for (const user of recipients) {
      notificationManager.sendNotification(Notification.MEDIA_AVAILABLE, {
        ...payload,
        notifyAdmin: false,
        notifySystem: false,
        notifyUser: user,
      });
    }

    if (recipients.length) {
      logger.info('Sent availability notifications to watchlist users', {
        label: 'Notifications',
        mediaId: media.id,
        users: recipients.length,
      });
    }
  } catch (e) {
    logger.error('Failed to notify watchlist users', {
      label: 'Notifications',
      errorMessage: e.message,
      mediaId: media.id,
    });
  }
};
