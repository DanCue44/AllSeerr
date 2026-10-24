import { Card } from '@app/components/Allseerr/Title';
import { statusTone } from '@app/components/Allseerr/Title/styles';
import CachedImage from '@app/components/Common/CachedImage';
import defineMessages from '@app/utils/defineMessages';
import { BookOpenIcon, CheckIcon } from '@heroicons/react/24/solid';
import type { ComicVolumeInfo, ComicVolumeState } from '@server/models/Comic';
import type { ReactNode } from 'react';
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
  notyetreleased: 'Not yet released',
  requested: 'Requested',
  selectvolume: 'Select Vol. {number}',
  selectall: 'Select all available',
  clear: 'Clear',
});

// Hardcover dates volumes it has no date for in 2100
const isPlaceholderDate = (date: string) => Number(date.slice(0, 4)) >= 2100;

// A long running series starts with its first volumes only
const FIRST_SHOWN = 24;

/**
 * The volumes a series page lists. A "Vol. 0" next to a full numbered run
 * is usually another edition of the first volume, so it is left out when
 * the series count says so.
 */
export const listComicVolumes = (
  volumes: ComicVolumeInfo[],
  count?: number
): ComicVolumeInfo[] =>
  count && volumes.length === count + 1 && volumes[0]?.number === 0
    ? volumes.slice(1)
    : volumes;

const stateTone: Record<ComicVolumeState, string> = {
  downloaded: statusTone.ok,
  downloading: statusTone.info,
  missing: statusTone.warn,
  unreleased: statusTone.neutral,
  unmonitored: statusTone.neutral,
};

const VolumeCard = ({
  volume,
  requested,
  selectable,
  selected,
  onToggle,
}: {
  volume: ComicVolumeInfo;
  requested: boolean;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
}) => {
  const intl = useIntl();
  const number = intl.formatNumber(volume.number);
  const label = intl.formatMessage(messages.volumenumber, { number });
  // A volume asked for already says so, unless Talearr has it by now
  const badge =
    requested && volume.state !== 'downloaded' && volume.state !== 'downloading'
      ? {
          text: intl.formatMessage(messages.requested),
          tone: statusTone.info,
        }
      : volume.state
        ? {
            text: intl.formatMessage(messages[volume.state]),
            tone: stateTone[volume.state],
          }
        : undefined;

  const cover = (
    <div
      className={`relative aspect-[2/3] overflow-hidden rounded-[5px_12px_12px_5px] bg-as-tile transition ${
        selected
          ? 'ring-[3px] ring-as-accent'
          : selectable
            ? 'group-hover:ring-2 group-hover:ring-as-line-strong'
            : ''
      } ${
        selectable
          ? 'peer-focus-visible:ring-[3px] peer-focus-visible:ring-as-accent-soft'
          : ''
      }`}
    >
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
      {badge && (
        <span
          className={`absolute left-1.5 top-1.5 max-w-[calc(100%-44px)] truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.tone}`}
        >
          {badge.text}
        </span>
      )}
      {selectable && (
        <span
          aria-hidden="true"
          className={`absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-[0_2px_6px_rgba(0,0,0,0.45)] transition ${
            selected
              ? 'border-as-accent bg-as-accent text-as-ground'
              : 'border-white/80 bg-black/40 text-transparent'
          }`}
        >
          <CheckIcon className="h-4 w-4" />
        </span>
      )}
    </div>
  );

  const text = (
    <>
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
          {isPlaceholderDate(volume.releaseDate)
            ? intl.formatMessage(messages.notyetreleased)
            : intl.formatDate(`${volume.releaseDate}T00:00:00Z`, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })}
        </span>
      )}
    </>
  );

  if (!selectable) {
    return (
      <li className="flex min-w-0 flex-col gap-1.5">
        {cover}
        {text}
      </li>
    );
  }

  // The whole card is the checkbox's label, so a tap anywhere on it picks
  // the volume and the keyboard reaches it as a checkbox
  return (
    <li className="min-w-0">
      <label className="group flex min-w-0 cursor-pointer select-none flex-col gap-1.5">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={selected}
          onChange={onToggle}
          aria-label={intl.formatMessage(messages.selectvolume, { number })}
        />
        {cover}
        {text}
      </label>
    </li>
  );
};

export interface ComicVolumeSelection {
  // The volume numbers that can be picked: not in the library and not
  // asked for already
  selectable: number[];
  // The volume numbers standing requests ask for
  requested: number[];
  selected: number[];
  onChange: (selected: number[]) => void;
  // Shown in a bar that stays in view while volumes are picked
  requestBar?: ReactNode;
}

/**
 * Every volume of a series, with what Talearr has of each once the series
 * is in its library. With a selection, the volumes that can be requested
 * are picked by tapping them.
 */
const ComicVolumes = ({
  volumes,
  count,
  selection,
}: {
  volumes: ComicVolumeInfo[];
  // The series' volume count, when it differs from the listed volumes
  count?: number;
  selection?: ComicVolumeSelection;
}) => {
  const intl = useIntl();
  const [showAll, setShowAll] = useState(false);
  const listed = listComicVolumes(volumes, count);
  const shown = showAll ? listed : listed.slice(0, FIRST_SHOWN);
  const selected = new Set(selection?.selected ?? []);
  const selectable = new Set(selection?.selectable ?? []);
  const requested = new Set(selection?.requested ?? []);

  const toggle = (number: number) => {
    if (!selection) {
      return;
    }

    const next = new Set(selected);
    if (next.has(number)) {
      next.delete(number);
    } else {
      next.add(number);
    }
    selection.onChange([...next].sort((a, b) => a - b));
  };

  const allSelected =
    selectable.size > 0 &&
    [...selectable].every((number) => selected.has(number));

  return (
    <Card
      title={intl.formatMessage(messages.volumes, {
        count: intl.formatNumber(Math.max(count ?? 0, listed.length)),
      })}
      action={
        selection && selectable.size > 0 ? (
          <div className="flex flex-none items-center gap-3 text-sm font-semibold">
            <button
              type="button"
              className="text-as-accent hover:text-as-accent-soft disabled:text-as-ink-faint"
              onClick={() => selection.onChange([...selectable])}
              disabled={allSelected}
            >
              {intl.formatMessage(messages.selectall)}
            </button>
            <button
              type="button"
              className="text-as-ink-soft hover:text-as-ink disabled:text-as-ink-faint"
              onClick={() => selection.onChange([])}
              disabled={selected.size === 0}
            >
              {intl.formatMessage(messages.clear)}
            </button>
          </div>
        ) : undefined
      }
    >
      <ul className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
        {shown.map((volume) => (
          <VolumeCard
            key={`volume-${volume.number}`}
            volume={volume}
            requested={requested.has(volume.number)}
            selectable={selectable.has(volume.number)}
            selected={selected.has(volume.number)}
            onToggle={() => toggle(volume.number)}
          />
        ))}
      </ul>
      {listed.length > FIRST_SHOWN && (
        <button
          type="button"
          className="self-start text-sm font-semibold text-as-accent hover:text-as-accent-soft"
          onClick={() => setShowAll((value) => !value)}
          aria-expanded={showAll}
        >
          {showAll
            ? intl.formatMessage(messages.showless)
            : intl.formatMessage(messages.showall, {
                count: listed.length,
              })}
        </button>
      )}
      {selection?.requestBar && selected.size > 0 && (
        // Above the phone tab bar, which floats over the bottom of the page
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+92px)] z-30 -mx-2 flex flex-wrap items-center justify-between gap-3 rounded-full bg-as-raised py-2 pl-5 pr-2 shadow-[0_10px_30px_rgba(0,0,0,0.45)] ring-1 ring-as-line-strong lg:bottom-4">
          {selection.requestBar}
        </div>
      )}
    </Card>
  );
};

export default ComicVolumes;
