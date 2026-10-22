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
  InformationCircleIcon,
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
  SeedingMediaType,
  SeedingState,
  SeedingTorrent,
} from '@server/interfaces/api/downloadInterfaces';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { useState } from 'react';
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
    comic: 'Comic',
    stateSeedingFiller: 'Seeding (Filler)',
    fillerExplain:
      'Ratio filler: not in your library. Talearr downloaded this freeleech torrent from MyAnonamouse only to seed it and keep your ratio healthy.',
    fillerTurnOff:
      'Turn this off in Talearr: Settings > Indexers > MyAnonamouse > Freeleech Seeding Filler.',
    fillerOpenSettings: 'Open Talearr indexer settings',
    goalHint:
      'Time left until this torrent reaches the seeding time {indexer} asks for: {target} ({done} done). Removing it before then counts against your account as a hit and run.',
    goalMetHint:
      'This torrent has seeded the {target} {indexer} asks for. You can remove it without a penalty.',
    indexerFallback: 'the tracker',
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

const SEEDING_MEDIA_ICON: Record<
  SeedingMediaType,
  ComponentType<{ className?: string }>
> = {
  audiobook: MEDIA_ICON.audiobook,
  ebook: MEDIA_ICON.ebook,
  comic: BookOpenIcon,
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
  talearrUrl,
  layout = 'cards',
}: {
  torrent: SeedingTorrent;
  talearrUrl?: string | null;
  layout?: DownloadsLayout;
}) => {
  const intl = useIntl();
  const [fillerOpen, setFillerOpen] = useState(false);
  const bookCover = useBookCover(torrent.posterUrl ? undefined : torrent.olId);
  const cover = torrent.posterUrl ?? bookCover;
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

  const formatText = torrent.mediaType
    ? intl.formatMessage(
        torrent.mediaType === 'audiobook'
          ? globalMessages.audiobook
          : torrent.mediaType === 'comic'
            ? messages.comic
            : globalMessages.ebook
      )
    : undefined;

  const isFillerSeeding = torrent.isFiller && torrent.state === 'seeding';
  const fillerText = `${intl.formatMessage(messages.fillerExplain)} ${intl.formatMessage(messages.fillerTurnOff)}`;
  const stateLabel = intl.formatMessage(
    torrent.atRisk
      ? messages.atRisk
      : isFillerSeeding
        ? messages.stateSeedingFiller
        : messages[STATE_MESSAGES[torrent.state]]
  );

  // Hover shows the explanation, a tap (touch) opens it, and screen readers
  // read it as the button's description
  const fillerStatus = (className: string) => (
    <button
      type="button"
      className={`inline-flex items-center gap-1 ${className}`}
      title={fillerText}
      aria-expanded={fillerOpen}
      aria-label={`${stateLabel}. ${fillerText}`}
      onClick={() => setFillerOpen((open) => !open)}
    >
      {stateLabel}
      <InformationCircleIcon className="h-3.5 w-3.5 flex-none" />
    </button>
  );

  const fillerPanel = fillerOpen ? (
    <div className="rounded-[12px] bg-black/40 px-2.5 py-2 text-xs leading-relaxed text-as-ink-soft">
      <p>{intl.formatMessage(messages.fillerExplain)}</p>
      <p className="mt-1">{intl.formatMessage(messages.fillerTurnOff)}</p>
      {talearrUrl && (
        <a
          href={`${talearrUrl}/settings/indexers`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block font-semibold text-as-accent hover:underline"
        >
          {intl.formatMessage(messages.fillerOpenSettings)}
        </a>
      )}
    </div>
  ) : null;

  const detail = [formatText, torrent.authorName].filter(Boolean).join(' · ');

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

  const badgeClass = `flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${
    torrent.atRisk ? statusTone.bad : statusTone[tone]
  }`;
  const stateBadge = isFillerSeeding ? (
    fillerStatus(badgeClass)
  ) : (
    <span className={badgeClass}>{stateLabel}</span>
  );

  const goalText =
    progress.targetSeconds === null
      ? undefined
      : progress.met
        ? intl.formatMessage(messages.requirementMet)
        : intl.formatMessage(messages.timeLeft, {
            time: formatDuration(progress.remainingSeconds),
          });

  const goalHint =
    progress.targetSeconds === null
      ? undefined
      : intl.formatMessage(
          progress.met ? messages.goalMetHint : messages.goalHint,
          {
            indexer:
              torrent.indexer ?? intl.formatMessage(messages.indexerFallback),
            target: formatDuration(progress.targetSeconds),
            done: formatDuration(torrent.seedingSeconds),
          }
        );

  // Same treatment as the filler status: hover title, a tap opens the
  // explanation, and screen readers get it in the label
  const [goalOpen, setGoalOpen] = useState(false);
  const goalButton = (className: string) =>
    goalText && goalHint ? (
      <button
        type="button"
        className={`text-right ${className}`}
        title={goalHint}
        aria-expanded={goalOpen}
        aria-label={`${goalText}. ${goalHint}`}
        onClick={() => setGoalOpen((open) => !open)}
      >
        {goalText}
      </button>
    ) : null;
  const goalPanel =
    goalOpen && goalHint ? (
      <p className="rounded-[12px] bg-black/40 px-2.5 py-2 text-left text-xs leading-relaxed text-as-ink-soft">
        {goalHint}
      </p>
    ) : null;

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
                title={goalHint}
                aria-label={goalHint ?? seededText}
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
          <div
            className="truncate text-xs text-as-ink-muted md:hidden"
            title={goalHint}
          >
            {[seededText, goalText, ratioText].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="hidden min-w-0 flex-col text-xs text-as-ink-muted md:flex">
          <span className="truncate">{seededText}</span>
          {goalButton('truncate text-left hover:underline')}
        </div>
        <div className="hidden min-w-0 flex-col text-xs text-as-ink-muted md:flex">
          <span className="truncate tabular-nums">{ratioText}</span>
          <span className="truncate">
            {[torrent.downloadClient, torrent.indexer]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        {fillerPanel && <div className="col-span-full">{fillerPanel}</div>}
        {goalPanel && <div className="col-span-full">{goalPanel}</div>}
      </article>
    );
  }

  const StateIcon = torrent.atRisk
    ? WarningSolidIcon
    : (STATE_ICON[torrent.state] ?? ArrowUpTrayIcon);
  const MediaIcon = torrent.mediaType
    ? SEEDING_MEDIA_ICON[torrent.mediaType]
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
          <div className="relative min-h-[150px] w-[104px] flex-none self-stretch overflow-hidden rounded-[10px] bg-as-tile shadow-lg shadow-black/40 sm:w-[128px]">
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
              {formatText && (
                <Detail label={intl.formatMessage(messages.labelFormat)}>
                  {formatText}
                </Detail>
              )}
              <Detail label={intl.formatMessage(messages.labelSize)}>
                {formatBytes(torrent.size, 1)}
              </Detail>
              <Detail label={intl.formatMessage(messages.labelStatus)}>
                {isFillerSeeding ? (
                  fillerStatus(`font-semibold ${stateText} hover:underline`)
                ) : (
                  <span className={`font-semibold ${stateText}`}>
                    {stateLabel}
                  </span>
                )}
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
            {fillerPanel}
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
          </div>
        </div>
        {progress.fraction !== null && (
          <div
            className="relative h-1 w-full bg-black/40"
            role="progressbar"
            title={goalHint}
            aria-label={goalHint ?? seededText}
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
      <div className="flex min-w-0 items-start gap-3 px-1">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
              {torrent.authorName ??
                (name !== torrent.title ? formatText : undefined) ??
                torrent.title}
            </span>
          </div>
          {goalPanel}
        </div>
        <div className="flex flex-none flex-col items-end gap-0.5 text-right text-xs leading-snug text-as-ink-soft">
          {goalButton('text-[13px] font-semibold text-as-ink hover:underline')}
          <span className="tabular-nums">
            {intl.formatMessage(messages.uploaded, {
              size: formatBytes(torrent.uploaded, 1),
            })}
          </span>
        </div>
      </div>
    </article>
  );
};

export default SeedingCard;
