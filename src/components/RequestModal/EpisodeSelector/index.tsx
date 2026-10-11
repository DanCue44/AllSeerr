import Badge from '@app/components/Common/Badge';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import type { SeasonWithEpisodes } from '@server/models/Tv';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.RequestModal.EpisodeSelector', {
  episodenumber: 'E{number}',
  noepisodes: 'Episode list unavailable.',
  somethingwentwrong: 'Something went wrong while retrieving season data.',
});

interface EpisodeSelectorProps {
  tmdbId: number;
  seasonNumber: number;
  selectedEpisodes: number[];
  requestedEpisodes: number[];
  availableEpisodes: number[];
  disabled?: boolean;
  onToggle: (episodeNumber: number) => void;
}

const EpisodeSelector = ({
  tmdbId,
  seasonNumber,
  selectedEpisodes,
  requestedEpisodes,
  availableEpisodes,
  disabled = false,
  onToggle,
}: EpisodeSelectorProps) => {
  const intl = useIntl();
  const { data, error } = useSWR<SeasonWithEpisodes>(
    `/api/v1/tv/${tmdbId}/season/${seasonNumber}`
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return (
      <p className="px-4 py-3 text-sm text-gray-400">
        {intl.formatMessage(messages.somethingwentwrong)}
      </p>
    );
  }

  if (data.episodes.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-gray-400">
        {intl.formatMessage(messages.noepisodes)}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-700/60">
      {data.episodes.map((episode) => {
        const isAvailable = availableEpisodes.includes(episode.episodeNumber);
        const isRequested = requestedEpisodes.includes(episode.episodeNumber);
        const isLocked = disabled || isAvailable || isRequested;
        const inputId = `episode-${seasonNumber}-${episode.episodeNumber}`;

        return (
          <li
            key={`season-${seasonNumber}-episode-${episode.episodeNumber}`}
            className="flex items-center gap-3 px-4 py-2 text-sm"
          >
            <input
              id={inputId}
              type="checkbox"
              className="h-5 w-5 flex-shrink-0"
              checked={
                isAvailable ||
                isRequested ||
                selectedEpisodes.includes(episode.episodeNumber)
              }
              disabled={isLocked}
              onChange={() => onToggle(episode.episodeNumber)}
            />
            <label
              htmlFor={inputId}
              className={`flex min-w-0 flex-1 items-center gap-2 ${
                isLocked ? 'opacity-50' : 'cursor-pointer'
              }`}
            >
              <span className="flex-shrink-0 font-medium text-gray-100">
                {intl.formatMessage(messages.episodenumber, {
                  number: String(episode.episodeNumber).padStart(2, '0'),
                })}
              </span>
              <span className="truncate text-gray-300">{episode.name}</span>
            </label>
            {episode.airDate && (
              <span className="hidden flex-shrink-0 text-xs text-gray-400 sm:block">
                {intl.formatDate(episode.airDate, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                })}
              </span>
            )}
            {isAvailable ? (
              <Badge badgeType="success">
                {intl.formatMessage(globalMessages.available)}
              </Badge>
            ) : isRequested ? (
              <Badge badgeType="primary">
                {intl.formatMessage(globalMessages.requested)}
              </Badge>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
};

export default EpisodeSelector;
