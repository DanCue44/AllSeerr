import type { DownloadsLayout } from '@app/components/Allseerr/Downloads/DownloadCard';
import {
  CardBackdrop,
  messages as cardMessages,
  Detail,
  MEDIA_ICON,
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
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  BookOpenIcon,
  ClockIcon,
  PauseIcon,
  ExclamationTriangleIcon as WarningSolidIcon,
} from '@heroicons/react/24/solid';
import type {
  SeedingState,
  SeedingTorrent,
} from '@server/interfaces/api/downloadInterfaces';
import Link from 'next/link';
import type { ComponentType } from 'react';
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
    labelService: 'Service',
    labelClient: 'Client',
    labelFormat: 'Format',
    labelSize: 'Size',
    labelStatus: 'Status',
    labelIndexer: 'Indexer',
    labelRatio: 'Ratio',
    labelSeedTime: 'Seed Time',
    labelUploaded: 'Uploaded',
    talearr: 'Talearr',
  }
);

const STATE_ICON: Record<
  SeedingState,
  ComponentType<{ className?: string }>
> = {
  seeding: ArrowUpTrayIcon,
  stalled: WarningSolidIcon,
  queued: ClockIcon,
  paused: PauseIcon,
  checking: ArrowPathIcon,
  error: WarningSolidIcon,
  downloading: ArrowPathIcon,
};

const TONE_TEXT: Record<SeedingTone, string> = {
  bad: 'text-[#f2b0aa]',
  warn: 'text-[#f0d9a8]',
  ok: 'text-[#a8e6c4]',
  info: 'text-as-accent',
  neutral: 'text-as-ink-soft',
};

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

  const StateIcon = torrent.atRisk
    ? WarningSolidIcon
    : (STATE_ICON[torrent.state] ?? ArrowUpTrayIcon);
  const MediaIcon = torrent.mediaType
    ? MEDIA_ICON[torrent.mediaType]
    : BookOpenIcon;
  const stateText = torrent.atRisk ? TONE_TEXT.bad : TONE_TEXT[tone];

  return (
    <article className="flex flex-col gap-2" data-testid="seeding-card">
      <div
        className={`relative overflow-hidden rounded-[18px] bg-as-surface ${
          torrent.atRisk ? 'ring-1 ring-[#f2b0aa]/40' : ''
        }`}
      >
        <CardBackdrop src={cover} />
        <div className="relative flex gap-4 p-3 sm:p-4">
          <div className="relative h-[150px] w-[100px] flex-none overflow-hidden rounded-[10px] bg-as-tile shadow-lg shadow-black/40 sm:h-[168px] sm:w-[112px]">
            <PosterImage src={cover} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
            <dl className="flex min-w-0 flex-col gap-1">
              <Detail label={intl.formatMessage(messages.labelService)}>
                {intl.formatMessage(messages.talearr)}
              </Detail>
              {torrent.downloadClient && (
                <Detail label={intl.formatMessage(messages.labelClient)}>
                  {torrent.downloadClient}
                </Detail>
              )}
              {torrent.mediaType && (
                <Detail label={intl.formatMessage(messages.labelFormat)}>
                  {intl.formatMessage(
                    torrent.mediaType === 'audiobook'
                      ? globalMessages.audiobook
                      : globalMessages.ebook
                  )}
                </Detail>
              )}
              <Detail label={intl.formatMessage(messages.labelSize)}>
                {formatBytes(torrent.size, 1)}
              </Detail>
              <Detail label={intl.formatMessage(messages.labelStatus)}>
                <span className={`font-semibold ${stateText}`}>
                  {intl.formatMessage(
                    torrent.atRisk
                      ? messages.atRisk
                      : messages[STATE_MESSAGES[torrent.state]]
                  )}
                </span>
              </Detail>
              {torrent.indexer && (
                <Detail label={intl.formatMessage(messages.labelIndexer)}>
                  <span className="inline-flex min-w-0 items-center gap-1">
                    {torrent.isPrivateTracker && (
                      <LockClosedIcon
                        className="h-3 w-3 flex-none text-[#c9c0f5]"
                        title={intl.formatMessage(messages.privateTracker)}
                      />
                    )}
                    <span className="truncate">{torrent.indexer}</span>
                  </span>
                </Detail>
              )}
              <Detail label={intl.formatMessage(messages.labelRatio)}>
                <span className="tabular-nums">
                  {formatRatio(torrent.ratio)}
                </span>
              </Detail>
              <Detail label={intl.formatMessage(messages.labelSeedTime)}>
                {seededText}
              </Detail>
            </dl>
            {torrent.atRisk && (
              <div
                className={`flex gap-2 rounded-[12px] px-2.5 py-1.5 text-xs leading-relaxed ${statusTone.bad}`}
              >
                <ExclamationTriangleIcon className="mt-px h-4 w-4 flex-none" />
                <p className="min-w-0 break-words">
                  {torrent.riskReason ??
                    intl.formatMessage(messages.atRiskFallback)}
                </p>
              </div>
            )}
            <div className="flex flex-col items-end text-right text-xs leading-snug text-as-ink-soft">
              {goalText && (
                <span className="font-semibold text-as-ink">{goalText}</span>
              )}
              <span className="tabular-nums">
                {intl.formatMessage(messages.uploaded, {
                  size: formatBytes(torrent.uploaded, 1),
                })}
              </span>
            </div>
          </div>
        </div>
        {progress.fraction !== null && (
          <div
            className="relative h-1 w-full bg-black/40"
            role="progressbar"
            aria-label={seededText}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className="h-full bg-as-accent transition-[width] duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <StateIcon
            className={`h-4 w-4 flex-none ${stateText}`}
            aria-hidden="true"
          />
          <div className="min-w-0 [&>*]:line-clamp-1 [&>*]:text-[15px]">
            {title}
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-as-ink-muted">
          <MediaIcon className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
          <span className="truncate" title={torrent.title}>
            {torrent.authorName ?? torrent.title}
          </span>
        </div>
      </div>
    </article>
  );
};

export default SeedingCard;
