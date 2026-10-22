import type { DownloadsLayout } from '@app/components/Allseerr/Downloads/DownloadCard';
import {
  messages as cardMessages,
  PosterImage,
  SEEDING_LIST_GRID,
  useBookCover,
} from '@app/components/Allseerr/Downloads/DownloadCard';
import { splitDuration } from '@app/components/Allseerr/Downloads/downloadFilters';
import type { SeedingTone } from '@app/components/Allseerr/Downloads/seedingLogic';
import {
  formatRatio,
  getSeedingTone,
  getSeedProgress,
} from '@app/components/Allseerr/Downloads/seedingLogic';
import { statusTone } from '@app/components/Allseerr/Title/styles';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { formatBytes } from '@app/utils/numberHelpers';
import {
  ExclamationTriangleIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import type {
  SeedingState,
  SeedingTorrent,
} from '@server/interfaces/api/downloadInterfaces';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

export const messages = defineMessages(
  'components.Allseerr.Downloads.Seeding',
  {
    stateSeeding: 'Seeding',
    stateStalled: 'Stalled',
    stateQueued: 'Queued',
    statePaused: 'Paused',
    stateChecking: 'Checking',
    stateError: 'Error',
    stateDownloading: 'Downloading',
    atRisk: 'At Risk',
    atRiskFallback: 'May not reach the seeding time the tracker asks for',
    seededOf: '{seeded} of {target} seeded',
    seeded: '{seeded} seeded',
    timeLeft: '{time} to go',
    requirementMet: 'Minimum met',
    uploaded: '{size} uploaded',
    ratio: 'Ratio {ratio}',
    privateTracker: 'Private',
  }
);

const STATE_MESSAGES: Record<SeedingState, keyof typeof messages> = {
  seeding: 'stateSeeding',
  stalled: 'stateStalled',
  queued: 'stateQueued',
  paused: 'statePaused',
  checking: 'stateChecking',
  error: 'stateError',
  downloading: 'stateDownloading',
};

const BAR_STYLE: Record<SeedingTone, string> = {
  bad: 'bg-[#f2b0aa]',
  warn: 'bg-[#f0d9a8]',
  ok: 'bg-[#a8e6c4]',
  info: 'bg-as-accent',
  neutral: 'bg-as-ink-faint',
};

const Dotted = ({ parts }: { parts: ReactNode[] }) => (
  <>
    {parts.map((part, index) => (
      <span key={index} className="flex items-center gap-2 whitespace-nowrap">
        {index > 0 && <span aria-hidden="true">·</span>}
        {part}
      </span>
    ))}
  </>
);

/**
 * A torrent Talearr seeds, with its seeded time against the tracker's
 * minimum and why it is at risk when it is
 */
const SeedingCard = ({
  torrent,
  layout = 'cards',
}: {
  torrent: SeedingTorrent;
  layout?: DownloadsLayout;
}) => {
  const intl = useIntl();
  const cover = useBookCover(torrent.olId);
  const tone = getSeedingTone(torrent);
  const progress = getSeedProgress(torrent);
  const percent =
    progress.fraction === null ? 0 : Math.floor(progress.fraction * 100);
  const name = torrent.bookTitle ?? torrent.title;
  const href = torrent.olId ? `/book/${torrent.olId}` : undefined;

  const formatDuration = (seconds: number) =>
    splitDuration(seconds)
      .map(({ unit, value }) =>
        intl.formatMessage(
          unit === 'day'
            ? cardMessages.durationDay
            : unit === 'hour'
              ? cardMessages.durationHour
              : unit === 'minute'
                ? cardMessages.durationMinute
                : cardMessages.durationSecond,
          { value }
        )
      )
      .join(' ');

  const detail = [
    torrent.mediaType &&
      intl.formatMessage(
        torrent.mediaType === 'audiobook'
          ? globalMessages.audiobook
          : globalMessages.ebook
      ),
    torrent.authorName,
  ]
    .filter(Boolean)
    .join(' · ');

  const seededText =
    progress.targetSeconds !== null
      ? intl.formatMessage(messages.seededOf, {
          seeded: formatDuration(torrent.seedingSeconds),
          target: formatDuration(progress.targetSeconds),
        })
      : intl.formatMessage(messages.seeded, {
          seeded: formatDuration(torrent.seedingSeconds),
        });

  const title = href ? (
    <Link
      href={href}
      className="line-clamp-2 text-[16px] font-bold leading-snug text-as-ink hover:underline"
    >
      {name}
    </Link>
  ) : (
    <span className="line-clamp-2 text-[16px] font-bold leading-snug text-as-ink">
      {name}
    </span>
  );

  const stateBadge = (
    <span
      className={`flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${
        torrent.atRisk ? statusTone.bad : statusTone[tone]
      }`}
    >
      {intl.formatMessage(
        torrent.atRisk
          ? messages.atRisk
          : messages[STATE_MESSAGES[torrent.state]]
      )}
    </span>
  );

  const goalText =
    progress.targetSeconds === null
      ? undefined
      : progress.met
        ? intl.formatMessage(messages.requirementMet)
        : intl.formatMessage(messages.timeLeft, {
            time: formatDuration(progress.remainingSeconds),
          });

  const ratioText = intl.formatMessage(messages.ratio, {
    ratio: formatRatio(torrent.ratio),
  });

  if (layout === 'list') {
    return (
      <article
        className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 md:gap-y-0 ${SEEDING_LIST_GRID}`}
        data-testid="seeding-row"
      >
        <div className="relative row-span-2 h-[60px] w-10 flex-none self-start overflow-hidden rounded-[8px] bg-as-tile md:row-span-1 md:self-center">
          <PosterImage src={cover} />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 [&>*]:line-clamp-1 [&>*]:text-[15px]">
              {title}
            </div>
            {torrent.isPrivateTracker && (
              <LockClosedIcon
                className="h-3.5 w-3.5 flex-none text-[#c9c0f5]"
                title={intl.formatMessage(messages.privateTracker)}
              />
            )}
          </div>
          <div
            className="truncate text-xs text-as-ink-muted"
            title={
              torrent.atRisk ? (torrent.riskReason ?? undefined) : undefined
            }
          >
            {torrent.atRisk
              ? (torrent.riskReason ??
                intl.formatMessage(messages.atRiskFallback))
              : detail}
          </div>
        </div>
        <div className="md:contents">{stateBadge}</div>
        <div className="col-span-2 flex flex-col gap-1 md:col-span-1">
          {progress.fraction !== null && (
            <div className="flex items-center gap-2">
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-as-tile"
                role="progressbar"
                aria-label={seededText}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${BAR_STYLE[tone]}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="hidden w-10 flex-none text-right text-xs font-bold tabular-nums text-as-ink-soft md:inline">
                {percent}%
              </span>
            </div>
          )}
          <div className="truncate text-xs text-as-ink-muted md:hidden">
            {[seededText, goalText, ratioText].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="hidden min-w-0 flex-col text-xs text-as-ink-muted md:flex">
          <span className="truncate">{seededText}</span>
          {goalText && <span className="truncate">{goalText}</span>}
        </div>
        <div className="hidden min-w-0 flex-col text-xs text-as-ink-muted md:flex">
          <span className="truncate tabular-nums">{ratioText}</span>
          <span className="truncate">
            {[torrent.downloadClient, torrent.indexer]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`flex flex-col gap-3 rounded-[20px] bg-as-surface p-4 sm:p-[18px] ${
        torrent.atRisk ? 'ring-1 ring-[#f2b0aa]/40' : ''
      }`}
      data-testid="seeding-card"
    >
      <div className="flex gap-3">
        <div className="relative h-[72px] w-12 flex-none overflow-hidden rounded-[10px] bg-as-tile">
          <PosterImage src={cover} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">{title}</div>
            {torrent.atRisk && (
              <span
                className={`flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${statusTone.bad}`}
              >
                {intl.formatMessage(messages.atRisk)}
              </span>
            )}
            <span
              className={`flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${
                torrent.atRisk ? statusTone.neutral : statusTone[tone]
              }`}
            >
              {intl.formatMessage(messages[STATE_MESSAGES[torrent.state]])}
            </span>
          </div>
          {detail && (
            <div className="truncate text-sm text-as-ink-soft">{detail}</div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {progress.fraction !== null && (
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-as-tile"
            role="progressbar"
            aria-label={seededText}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-700 ${BAR_STYLE[tone]}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-3 text-xs text-as-ink-muted">
          <span className="truncate">{seededText}</span>
          {progress.targetSeconds !== null && (
            <span className="flex-none font-bold tabular-nums text-as-ink-soft">
              {progress.met
                ? intl.formatMessage(messages.requirementMet)
                : intl.formatMessage(messages.timeLeft, {
                    time: formatDuration(progress.remainingSeconds),
                  })}
            </span>
          )}
        </div>
      </div>

      {torrent.atRisk && (
        <div
          className={`flex gap-2 rounded-[14px] px-3 py-2 text-xs leading-relaxed ${statusTone.bad}`}
        >
          <ExclamationTriangleIcon className="mt-px h-4 w-4 flex-none" />
          <p className="min-w-0 break-words">
            {torrent.riskReason ?? intl.formatMessage(messages.atRiskFallback)}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-as-ink-muted">
        {torrent.isPrivateTracker && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#2d2a45] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#c9c0f5]">
            <LockClosedIcon className="h-3 w-3" />
            {intl.formatMessage(messages.privateTracker)}
          </span>
        )}
        <Dotted
          parts={[
            intl.formatMessage(messages.uploaded, {
              size: formatBytes(torrent.uploaded, 1),
            }),
            <span key="ratio" className="tabular-nums">
              {intl.formatMessage(messages.ratio, {
                ratio: formatRatio(torrent.ratio),
              })}
            </span>,
            ...[torrent.indexer, torrent.downloadClient].filter(
              (part): part is string => !!part
            ),
          ]}
        />
      </div>
      {torrent.bookTitle && torrent.title !== torrent.bookTitle && (
        <div
          className="-mt-1 truncate text-[11px] text-as-ink-faint"
          title={torrent.title}
        >
          {torrent.title}
        </div>
      )}
    </article>
  );
};

export default SeedingCard;
