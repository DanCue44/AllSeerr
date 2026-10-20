import { Card } from '@app/components/Allseerr/Title';
import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { SeasonRolloverStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type SeasonRollover from '@server/entity/SeasonRollover';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.SeasonRolloverNotice', {
  title: 'Seasons Scheduled for Deletion',
  title4k: '4K Seasons Scheduled for Deletion',
  started: 'Season {season} has started.',
  scheduled:
    '{count, plural, one {Season} other {Seasons}} {seasons} will be deleted on {date} unless you keep {count, plural, one {it} other {them}}.',
  scheduledNow:
    '{count, plural, one {Season} other {Seasons}} {seasons} will be deleted on the next Sonarr scan.',
  preexisting:
    '{count, plural, one {Season {seasons} was} other {Seasons {seasons} were}} already here and {count, plural, one {is} other {are}} kept unless you approve deleting {count, plural, one {it} other {them}}.',
  preexistingApproved:
    '{count, plural, one {Season} other {Seasons}} {seasons} will also be deleted on the next Sonarr scan.',
  keepSeasons: 'Keep Seasons',
  deleteNow: 'Delete Now',
  deleteAll: 'Delete All Older Seasons',
  kept: 'The older seasons will be kept.',
  deleting: 'The older seasons will be deleted on the Sonarr scan.',
  error: 'Something went wrong while updating the season rollover.',
});

interface SeasonRolloverNoticeProps {
  media?: Media;
  ambient?: boolean;
  onUpdate?: () => void;
}

type RolloverAction = 'keep' | 'delete-now' | 'delete-all';

/**
 * Tells admins on the series page that older seasons of a current season
 * request are about to be deleted, with the choice to keep them.
 */
const SeasonRolloverNotice = ({
  media,
  ambient = false,
  onUpdate,
}: SeasonRolloverNoticeProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { hasPermission } = useUser();
  const [updating, setUpdating] = useState<number | null>(null);
  const canManage = hasPermission(Permission.MANAGE_REQUESTS);

  const { data: rollovers, mutate } = useSWR<SeasonRollover[]>(
    canManage && media?.id
      ? `/api/v1/rollover?status=pending&mediaId=${media.id}`
      : null
  );

  if (!canManage || !rollovers?.length) {
    return null;
  }

  const update = async (rollover: SeasonRollover, action: RolloverAction) => {
    setUpdating(rollover.id);

    try {
      await axios.post(`/api/v1/rollover/${rollover.id}/${action}`);
      addToast(
        intl.formatMessage(
          action === 'keep' ? messages.kept : messages.deleting
        ),
        { appearance: 'success', autoDismiss: true }
      );
      await mutate();
      onUpdate?.();
    } catch {
      addToast(intl.formatMessage(messages.error), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setUpdating(null);
    }
  };

  return (
    <>
      {rollovers.map((rollover) => {
        const isPending = rollover.status === SeasonRolloverStatus.PENDING;
        const deleteAfter = new Date(rollover.deleteAfter);
        const isDue = deleteAfter <= new Date();
        const showScheduled = isPending && rollover.seasons.length > 0;
        const showPreexisting = rollover.preexistingSeasons.length > 0;
        const isBusy = updating === rollover.id;
        const title = intl.formatMessage(
          rollover.is4k ? messages.title4k : messages.title
        );

        const body = (
          <p>
            {intl.formatMessage(messages.started, {
              season: rollover.currentSeason,
            })}{' '}
            {showScheduled &&
              intl.formatMessage(
                isDue ? messages.scheduledNow : messages.scheduled,
                {
                  count: rollover.seasons.length,
                  seasons: rollover.seasons.join(', '),
                  date: intl.formatDate(deleteAfter, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  }),
                }
              )}{' '}
            {showPreexisting &&
              intl.formatMessage(
                rollover.deletePreexisting
                  ? messages.preexistingApproved
                  : messages.preexisting,
                {
                  count: rollover.preexistingSeasons.length,
                  seasons: rollover.preexistingSeasons.join(', '),
                }
              )}
          </p>
        );

        const actions = (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              buttonType="default"
              buttonSize="sm"
              disabled={isBusy}
              onClick={() => update(rollover, 'keep')}
            >
              {intl.formatMessage(messages.keepSeasons)}
            </Button>
            {showScheduled && !isDue && (
              <Button
                buttonType="danger"
                buttonSize="sm"
                disabled={isBusy}
                onClick={() => update(rollover, 'delete-now')}
              >
                {intl.formatMessage(messages.deleteNow)}
              </Button>
            )}
            {showPreexisting && !rollover.deletePreexisting && (
              <Button
                buttonType="danger"
                buttonSize="sm"
                disabled={isBusy}
                onClick={() => update(rollover, 'delete-all')}
              >
                {intl.formatMessage(messages.deleteAll)}
              </Button>
            )}
          </div>
        );

        return ambient ? (
          <Card key={`season-rollover-${rollover.id}`} title={title}>
            <div className="text-sm text-as-ink-soft">
              {body}
              {actions}
            </div>
          </Card>
        ) : (
          <div key={`season-rollover-${rollover.id}`} className="mt-6">
            <Alert title={title} type="warning">
              {body}
              {actions}
            </Alert>
          </div>
        );
      })}
    </>
  );
};

export default SeasonRolloverNotice;
