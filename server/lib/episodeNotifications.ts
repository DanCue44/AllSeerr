import TheMovieDb from '@server/api/themoviedb';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import type Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import type { User } from '@server/entity/User';
import notificationManager, { Notification } from '@server/lib/notifications';
import logger from '@server/logger';
import { truncate } from 'lodash';
import { In } from 'typeorm';

export interface NewSeasonEpisodes {
  seasonNumber: number;
  episodes: number[];
}

export interface NewEpisodeRecipient {
  user: User;
  request: MediaRequest;
  seasons: NewSeasonEpisodes[];
}

/**
 * Sorted, de-duplicated episode numbers. Media servers can list the same
 * episode more than once (multiple versions) or without an index.
 */
export const normalizeEpisodeNumbers = (
  numbers: (number | undefined | null)[]
): number[] =>
  [
    ...new Set(
      numbers.filter((n): n is number => typeof n === 'number' && n >= 0)
    ),
  ].sort((a, b) => a - b);

/**
 * Episodes present now that were not present on the previous scan. Without a
 * previous scan there is nothing to compare against, so nothing is new.
 */
export const getNewEpisodes = (
  previous: number[] | null | undefined,
  current: number[]
): number[] => {
  if (!previous) {
    return [];
  }

  const known = new Set(previous);

  return current.filter((episode) => !known.has(episode));
};

/**
 * Every episode seen so far. Episodes are never forgotten, so a show split
 * across libraries, or an episode being replaced, is not reported again.
 */
export const mergeEpisodeNumbers = (
  previous: number[] | null | undefined,
  current: number[]
): number[] => normalizeEpisodeNumbers([...(previous ?? []), ...current]);

/**
 * New episodes are only worth a notification for a season that was already
 * available in part. A season becoming fully available for the first time is
 * covered by the regular "Now Available" notification.
 */
export const shouldNotifyNewEpisodes = (
  previousStatus: MediaStatus | undefined,
  currentStatus: MediaStatus
): boolean =>
  previousStatus === MediaStatus.AVAILABLE ||
  (previousStatus === MediaStatus.PARTIALLY_AVAILABLE &&
    currentStatus === MediaStatus.PARTIALLY_AVAILABLE);

/**
 * The first episodes of a season arriving, such as a requested season that
 * has just started airing. A missing season row counts as nothing available.
 */
export const isFirstEpisodeArrival = (
  previousStatus: MediaStatus | undefined,
  currentStatus: MediaStatus
): boolean =>
  currentStatus === MediaStatus.PARTIALLY_AVAILABLE &&
  (previousStatus === undefined ||
    previousStatus === MediaStatus.UNKNOWN ||
    previousStatus === MediaStatus.PENDING ||
    previousStatus === MediaStatus.PROCESSING);

/**
 * Episodes a scan should tell requesters about. When a season gets its first
 * episodes, everything on the media server is new even without an earlier
 * episode list. Otherwise only seasons that were already available in part
 * and have an earlier episode list to compare against are considered.
 */
export const getEpisodesToNotify = (
  previousEpisodes: number[] | null | undefined,
  currentEpisodes: number[],
  previousStatus: MediaStatus | undefined,
  currentStatus: MediaStatus
): number[] => {
  if (isFirstEpisodeArrival(previousStatus, currentStatus)) {
    return getNewEpisodes(previousEpisodes ?? [], currentEpisodes);
  }

  if (shouldNotifyNewEpisodes(previousStatus, currentStatus)) {
    return getNewEpisodes(previousEpisodes, currentEpisodes);
  }

  return [];
};

const pad = (n: number) => String(n).padStart(2, '0');

export const formatNewEpisodes = (seasons: NewSeasonEpisodes[]): string =>
  [...seasons]
    .sort((a, b) => a.seasonNumber - b.seasonNumber)
    .flatMap((season) =>
      season.episodes.map(
        (episode) => `S${pad(season.seasonNumber)}E${pad(episode)}`
      )
    )
    .join(', ');

/**
 * Users who requested at least one of the seasons that received new
 * episodes. Each user is listed once with every new episode from the seasons
 * they requested, even when those seasons span several requests.
 */
export const getNewEpisodeRecipients = async (
  media: Media,
  seasons: NewSeasonEpisodes[],
  is4k: boolean
): Promise<NewEpisodeRecipient[]> => {
  if (!seasons.length) {
    return [];
  }

  const requests = await getRepository(MediaRequest).find({
    where: {
      media: { id: media.id },
      is4k,
      status: In([MediaRequestStatus.APPROVED, MediaRequestStatus.COMPLETED]),
    },
    order: { id: 'DESC' },
  });

  const recipients = new Map<number, NewEpisodeRecipient>();

  for (const request of requests) {
    if (!request.requestedBy) {
      continue;
    }

    const requestedSeasons = seasons.filter((season) =>
      request.seasons?.some(
        (requestSeason) => requestSeason.seasonNumber === season.seasonNumber
      )
    );

    if (!requestedSeasons.length) {
      continue;
    }

    const recipient = recipients.get(request.requestedBy.id);

    if (!recipient) {
      recipients.set(request.requestedBy.id, {
        user: request.requestedBy,
        request,
        seasons: requestedSeasons,
      });
      continue;
    }

    for (const season of requestedSeasons) {
      if (
        !recipient.seasons.some((s) => s.seasonNumber === season.seasonNumber)
      ) {
        recipient.seasons.push(season);
      }
    }
  }

  return [...recipients.values()];
};

/**
 * Tells requesters which new episodes of their requested seasons arrived.
 * Each user gets a single notification listing every new episode.
 */
export const notifyNewEpisodes = async (
  media: Media,
  seasons: NewSeasonEpisodes[],
  is4k: boolean
): Promise<void> => {
  try {
    const recipients = await getNewEpisodeRecipients(media, seasons, is4k);

    if (!recipients.length) {
      return;
    }

    const tmdb = new TheMovieDb();
    const tv = await tmdb.getTvShow({ tvId: media.tmdbId });

    for (const recipient of recipients) {
      notificationManager.sendNotification(
        Notification.MEDIA_EPISODES_AVAILABLE,
        {
          event: `${is4k ? '4K ' : ''}New Episodes Available`,
          subject: `${tv.name}${
            tv.first_air_date ? ` (${tv.first_air_date.slice(0, 4)})` : ''
          }`,
          message: truncate(tv.overview, {
            length: 500,
            separator: /\s/,
            omission: '…',
          }),
          notifyAdmin: false,
          notifySystem: true,
          notifyUser: recipient.user,
          image: `https://image.tmdb.org/t/p/w600_and_h900_bestv2${tv.poster_path}`,
          media,
          extra: [
            {
              name: 'New Episodes',
              value: truncate(formatNewEpisodes(recipient.seasons), {
                length: 1000,
                separator: ', ',
                omission: '…',
              }),
            },
          ],
          request: recipient.request,
        }
      );
    }

    logger.info('Sent new episode notifications', {
      label: 'Notifications',
      mediaId: media.id,
      is4k,
      users: recipients.length,
    });
  } catch (e) {
    logger.error('Failed to send new episode notifications', {
      label: 'Notifications',
      errorMessage: e.message,
      mediaId: media.id,
    });
  }
};
