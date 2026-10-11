import TheMovieDb from '@server/api/themoviedb';
import { SeasonRolloverStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import SeasonRollover from '@server/entity/SeasonRollover';
import type { User } from '@server/entity/User';
import notificationManager, { Notification } from '@server/lib/notifications';
import {
  formatRolloverDate,
  getRolloverMessage,
} from '@server/lib/seasonRollover';
import logger from '@server/logger';

export class SeasonRolloverStateError extends Error {}

export type SeasonRolloverAction = 'keep' | 'delete-now' | 'delete-all';

/**
 * Tells admins that older seasons of a current season request are about to
 * be deleted.
 */
export const sendSeasonRolloverNotification = async (
  rollover: SeasonRollover,
  fallbackTitle: string
): Promise<void> => {
  const tmdb = new TheMovieDb();
  const { media } = rollover;

  try {
    let title = fallbackTitle;
    let year: string | undefined;
    let image: string | undefined;

    try {
      const details = await tmdb.getTvShow({ tvId: media.tmdbId });
      title = details.name;
      year = details.first_air_date?.slice(0, 4);
      image = details.poster_path
        ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${details.poster_path}`
        : undefined;
    } catch {
      // The notice matters more than the poster
    }

    notificationManager.sendNotification(Notification.SEASON_ROLLOVER_PENDING, {
      event: `${rollover.is4k ? '4K ' : ''}Seasons Scheduled for Deletion`,
      subject: `${title}${year ? ` (${year})` : ''}`,
      message: getRolloverMessage({
        title,
        currentSeason: rollover.currentSeason,
        seasons: rollover.seasons,
        preexistingSeasons: rollover.preexistingSeasons,
        deleteAfter: rollover.deleteAfter,
      }),
      image,
      media,
      rollover,
      notifyAdmin: true,
      notifySystem: true,
      extra: [
        { name: 'New Season', value: String(rollover.currentSeason) },
        ...(rollover.seasons.length > 0
          ? [
              {
                name: 'Seasons to Delete',
                value: rollover.seasons.join(', '),
              },
              {
                name: 'Deletion Date',
                value: formatRolloverDate(rollover.deleteAfter),
              },
            ]
          : []),
        ...(rollover.preexistingSeasons.length > 0
          ? [
              {
                name: 'Seasons Held for Review',
                value: rollover.preexistingSeasons.join(', '),
              },
            ]
          : []),
      ],
    });
  } catch (e) {
    logger.error('Something went wrong sending season rollover notification', {
      label: 'Notifications',
      errorMessage: e.message,
      seasonRolloverId: rollover.id,
    });
  }
};

/**
 * Keep holds every season for good. Delete now ends the notice period for the
 * seasons the request brought in, and delete all also approves deleting the
 * seasons that were already there. Deletions happen on the next Sonarr
 * scan.
 */
export const updateSeasonRollover = async (
  id: number,
  action: SeasonRolloverAction,
  user: User
): Promise<SeasonRollover> => {
  const rolloverRepository = getRepository(SeasonRollover);
  const rollover = await rolloverRepository.findOneOrFail({ where: { id } });

  const isOpen =
    rollover.status === SeasonRolloverStatus.PENDING ||
    rollover.status === SeasonRolloverStatus.REVIEW;

  if (!isOpen) {
    throw new SeasonRolloverStateError(
      'Only pending season rollovers can be changed.'
    );
  }

  switch (action) {
    case 'keep':
      rollover.status = SeasonRolloverStatus.KEPT;
      break;
    case 'delete-now':
      if (rollover.status !== SeasonRolloverStatus.PENDING) {
        throw new SeasonRolloverStateError(
          'The seasons scheduled for deletion are already deleted.'
        );
      }
      rollover.deleteAfter = new Date();
      break;
    case 'delete-all':
      rollover.status = SeasonRolloverStatus.PENDING;
      rollover.deletePreexisting = true;
      rollover.deleteAfter = new Date();
      break;
  }

  rollover.modifiedBy = user;
  await rolloverRepository.save(rollover);

  logger.info(
    `Season rollover ${rollover.id} updated by ${user.displayName}: ${action}`,
    { label: 'Season Rollover', mediaId: rollover.media.id }
  );

  return rollover;
};
