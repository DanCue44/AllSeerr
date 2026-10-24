import { Card } from '@app/components/Allseerr/Title';
import { statusTone } from '@app/components/Allseerr/Title/styles';
import CachedImage from '@app/components/Common/CachedImage';
import defineMessages from '@app/utils/defineMessages';
import { BookOpenIcon } from '@heroicons/react/24/solid';
import type { ComicVolumeInfo, ComicVolumeState } from '@server/models/Comic';
import { useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.ComicDetails.ComicVolumes', {
  volumes: 'Volumes ({count})',
  volumenumber: 'Vol. {number}',
  showall: 'Show all {count} volumes',
  showless: 'Show fewer',
  downloaded: 'In library',
  downloading: 'Downloading',
  missing: 'Missing',
  unreleased: 'Unreleased',
  unmonitored: 'Not wanted',
});

// A long running series starts with its first volumes only
const FIRST_SHOWN = 24;

const stateTone: Record<ComicVolumeState, string> = {
  downloaded: statusTone.ok,
  downloading: statusTone.info,
  missing: statusTone.warn,
  unreleased: statusTone.neutral,
  unmonitored: statusTone.neutral,
};

const VolumeCard = ({ volume }: { volume: ComicVolumeInfo }) => {
  const intl = useIntl();
  const number = intl.formatNumber(volume.number);
  const label = intl.formatMessage(messages.volumenumber, { number });

  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      <div className="relative aspect-[2/3] overflow-hidden rounded-[5px_12px_12px_5px] bg-as-tile">
        {volume.coverUrl ? (
          <CachedImage
            type="book"
            src={volume.coverUrl}
            alt={label}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fill
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-as-ink-faint">
            <BookOpenIcon className="h-1/4 w-1/4" />
            <span className="font-display text-lg font-bold text-as-ink-muted">
              {number}
            </span>
          </div>
        )}
        {volume.state && (
          <span
            className={`absolute left-1.5 top-1.5 max-w-[calc(100%-12px)] truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              stateTone[volume.state]
            }`}
          >
            {intl.formatMessage(messages[volume.state])}
          </span>
        )}
      </div>
      <span className="truncate text-sm font-semibold text-as-ink">
        {label}
      </span>
      {volume.title && (
        <span className="line-clamp-2 text-xs text-as-ink-soft">
          {volume.title}
        </span>
      )}
      {volume.releaseDate && (
        <span className="text-xs text-as-ink-faint">
          {intl.formatDate(`${volume.releaseDate}T00:00:00Z`, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
      )}
    </li>
  );
};

/**
 * Every volume of a series, with what Talearr has of each once the series
 * is in its library
 */
const ComicVolumes = ({
  volumes,
  count,
}: {
  volumes: ComicVolumeInfo[];
  // The series' volume count, when it differs from the listed volumes
  count?: number;
}) => {
  const intl = useIntl();
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? volumes : volumes.slice(0, FIRST_SHOWN);

  return (
    <Card
      title={intl.formatMessage(messages.volumes, {
        count: intl.formatNumber(Math.max(count ?? 0, volumes.length)),
      })}
    >
      <ul className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
        {shown.map((volume) => (
          <VolumeCard key={`volume-${volume.number}`} volume={volume} />
        ))}
      </ul>
      {volumes.length > FIRST_SHOWN && (
        <button
          type="button"
          className="self-start text-sm font-semibold text-as-accent hover:text-as-accent-soft"
          onClick={() => setShowAll((value) => !value)}
          aria-expanded={showAll}
        >
          {showAll
            ? intl.formatMessage(messages.showless)
            : intl.formatMessage(messages.showall, {
                count: volumes.length,
              })}
        </button>
      )}
    </Card>
  );
};

export default ComicVolumes;
