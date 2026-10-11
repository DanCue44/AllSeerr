import { SeasonRolloverStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import SeasonRollover from '@server/entity/SeasonRollover';
import { sonarrScanner } from '@server/lib/scanners/sonarr';
import type { SeasonRolloverAction } from '@server/lib/seasonRolloverActions';
import {
  SeasonRolloverStateError,
  updateSeasonRollover,
} from '@server/lib/seasonRolloverActions';
import logger from '@server/logger';
import { Router } from 'express';
import { EntityNotFoundError } from 'typeorm';

const rolloverRoutes = Router();

const filterStatuses: Record<string, SeasonRolloverStatus[]> = {
  pending: [SeasonRolloverStatus.PENDING, SeasonRolloverStatus.REVIEW],
  kept: [SeasonRolloverStatus.KEPT],
  completed: [SeasonRolloverStatus.COMPLETED],
};

const ACTIONS: SeasonRolloverAction[] = ['keep', 'delete-now', 'delete-all'];

rolloverRoutes.get<Record<string, string>, SeasonRollover[]>(
  '/',
  async (req, res, next) => {
    try {
      const status = req.query.status ? String(req.query.status) : 'all';
      const mediaId = req.query.mediaId ? Number(req.query.mediaId) : undefined;

      let query = getRepository(SeasonRollover)
        .createQueryBuilder('rollover')
        .leftJoinAndSelect('rollover.media', 'media')
        .leftJoinAndSelect('rollover.modifiedBy', 'modifiedBy');

      if (filterStatuses[status]) {
        query = query.where('rollover.status IN (:...statuses)', {
          statuses: filterStatuses[status],
        });
      }

      if (mediaId) {
        query = query.andWhere('media.id = :mediaId', { mediaId });
      }

      const rollovers = await query
        .orderBy('rollover.createdAt', 'DESC')
        .take(100)
        .getMany();

      return res.status(200).json(rollovers);
    } catch (e) {
      next({ status: 500, message: e.message });
    }
  }
);

rolloverRoutes.post<{ rolloverId: string; action: string }, SeasonRollover>(
  '/:rolloverId/:action',
  async (req, res, next) => {
    try {
      if (!req.user) {
        return next({ status: 401, message: 'You must be logged in.' });
      }

      const action = req.params.action as SeasonRolloverAction;

      if (!ACTIONS.includes(action)) {
        return next({
          status: 400,
          message: 'Action must be keep, delete-now or delete-all.',
        });
      }

      const rollover = await updateSeasonRollover(
        Number(req.params.rolloverId),
        action,
        req.user
      );

      // Deleting happens on the Sonarr scan, so run it now rather than
      // waiting for the next scheduled one
      if (action !== 'keep' && !sonarrScanner.status().running) {
        sonarrScanner.run().catch((e) =>
          logger.error('Failed to run the Sonarr scan for a season rollover', {
            label: 'Season Rollover',
            errorMessage: e.message,
          })
        );
      }

      return res.status(200).json(rollover);
    } catch (e) {
      if (e instanceof EntityNotFoundError) {
        return next({ status: 404, message: 'Season rollover not found.' });
      }
      if (e instanceof SeasonRolloverStateError) {
        return next({ status: 409, message: e.message });
      }
      next({ status: 500, message: e.message });
    }
  }
);

export default rolloverRoutes;
