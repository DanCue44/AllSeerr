import Badge from '@app/components/Common/Badge';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { MediaRequestMonitorMode } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.RequestSeasonBadges', {
  seasonepisodes: 'S{seasonNumber} · {episodes}',
  specialepisodes: '{specials} · {episodes}',
  futureepisodes: 'Future episodes only',
  currentseason: 'Current season only',
  seasonlist: '{count, plural, one {Season} other {Seasons}} {seasons}',
});

/**
 * Episode numbers as shown on requests, such as "E03, E05"
 */
export const formatEpisodeNumbers = (episodes: number[]): string =>
  episodes.map((ep) => `E${String(ep).padStart(2, '0')}`).join(', ');

interface RequestSeasonBadgesProps {
  request: Pick<NonFunctionProperties<MediaRequest>, 'seasons' | 'monitorMode'>;
  className?: string;
  // Plain text for cards: "Seasons 1, 2", "S02 · E03, E05"
  variant?: 'badges' | 'text';
}

const RequestSeasonBadges = ({
  request,
  className = 'mr-2',
  variant = 'badges',
}: RequestSeasonBadgesProps) => {
  const intl = useIntl();

  if (variant === 'text') {
    const wholeSeasons = request.seasons.filter(
      (season) => !season.episodes?.length
    );
    const parts = [
      ...(wholeSeasons.length
        ? [
            intl.formatMessage(messages.seasonlist, {
              count: wholeSeasons.length,
              seasons: wholeSeasons
                .map((season) =>
                  season.seasonNumber === 0
                    ? intl.formatMessage(globalMessages.specials)
                    : season.seasonNumber
                )
                .join(', '),
            }),
          ]
        : []),
      ...request.seasons
        .filter((season) => season.episodes?.length)
        .map((season) =>
          season.seasonNumber === 0
            ? intl.formatMessage(messages.specialepisodes, {
                specials: intl.formatMessage(globalMessages.specials),
                episodes: formatEpisodeNumbers(season.episodes ?? []),
              })
            : intl.formatMessage(messages.seasonepisodes, {
                seasonNumber: String(season.seasonNumber).padStart(2, '0'),
                episodes: formatEpisodeNumbers(season.episodes ?? []),
              })
        ),
      ...(request.monitorMode === MediaRequestMonitorMode.FUTURE
        ? [intl.formatMessage(messages.futureepisodes)]
        : []),
      ...(request.monitorMode === MediaRequestMonitorMode.CURRENT
        ? [intl.formatMessage(messages.currentseason)]
        : []),
    ];

    return <span className={className}>{parts.join(' · ')}</span>;
  }

  return (
    <>
      {request.seasons.map((season) => (
        <span key={`season-${season.id}`} className={className}>
          <Badge>
            {season.episodes?.length
              ? season.seasonNumber === 0
                ? intl.formatMessage(messages.specialepisodes, {
                    specials: intl.formatMessage(globalMessages.specials),
                    episodes: formatEpisodeNumbers(season.episodes),
                  })
                : intl.formatMessage(messages.seasonepisodes, {
                    seasonNumber: String(season.seasonNumber).padStart(2, '0'),
                    episodes: formatEpisodeNumbers(season.episodes),
                  })
              : season.seasonNumber === 0
                ? intl.formatMessage(globalMessages.specials)
                : season.seasonNumber}
          </Badge>
        </span>
      ))}
      {request.monitorMode === MediaRequestMonitorMode.FUTURE && (
        <span className={className}>
          <Badge badgeType="primary">
            {intl.formatMessage(messages.futureepisodes)}
          </Badge>
        </span>
      )}
      {request.monitorMode === MediaRequestMonitorMode.CURRENT && (
        <span className={className}>
          <Badge badgeType="primary">
            {intl.formatMessage(messages.currentseason)}
          </Badge>
        </span>
      )}
    </>
  );
};

export default RequestSeasonBadges;
