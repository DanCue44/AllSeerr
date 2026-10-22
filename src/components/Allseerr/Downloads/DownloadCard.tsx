import {
  episodeLabel,
  splitDuration,
} from '@app/components/Allseerr/Downloads/downloadFilters';
import UserAvatar from '@app/components/Allseerr/RequestList/UserAvatar';
import { statusTone } from '@app/components/Allseerr/Title/styles';
import CachedImage from '@app/components/Common/CachedImage';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { formatBytes } from '@app/utils/numberHelpers';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import {
  ArrowTopRightOnSquareIcon,
  EllipsisVerticalIcon,
  ExclamationTriangleIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ClockIcon,
  FilmIcon,
  MusicalNoteIcon,
  PauseIcon,
  SpeakerWaveIcon,
  TvIcon,
  ExclamationTriangleIcon as WarningSolidIcon,
} from '@heroicons/react/24/solid';
import type {
  DownloadItem,
  DownloadStatus,
} from '@server/interfaces/api/downloadInterfaces';
import type { BookDetails } from '@server/models/Book';
import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

export const messages = defineMessages('components.Allseerr.Downloads', {
  statusDownloading: 'Downloading',
  statusQueued: 'Queued',
  statusPaused: 'Paused',
  statusImporting: 'Importing',
  statusImportPending: 'Waiting to import',
  statusCompleted: 'Imported',
  statusWarning: 'Warning',
  statusFailed: 'Failed',
  statusStalled: 'Stalled',
  usenet: 'Usenet',
  torrent: 'Torrent',
  sizeProgress: '{done} of {size}',
  timeLeft: '{time} left',
  durationDay: '{value} d',
  durationHour: '{value} h',
  durationMinute: '{value} min',
  durationSecond: '{value} s',
  seasonPack: 'Season {season} · {count} episodes',
  byName: 'by {name}',
  requestedBy: 'Requested by {name}',
  seeders: '{count, plural, one {# seeder} other {# seeders}}',
  actions: 'Actions for {title}',
  searchAgain: 'Search Again',
  pickRelease: 'Pick a Release',
  removeFromQueue: 'Remove from Queue',
  openTitle: 'Open Title Page',
  labelService: 'Service',
  labelClient: 'Client',
  labelQuality: 'Quality',
  labelFormat: 'Format',
  labelSize: 'Size',
  labelStatus: 'Status',
  labelIndexer: 'Indexer',
  labelRelease: 'Release',
  labelPath: 'Path',
  eta: 'ETA: {time}',
  sizeOfTotal: '{done} / {size}',
});

const STATUS_STYLE: Record<
  DownloadStatus,
  { tone: string; bar: string; text: string; message: keyof typeof messages }
> = {
  downloading: {
    text: 'text-as-accent',
    tone: statusTone.info,
    bar: 'bg-as-accent',
    message: 'statusDownloading',
  },
  queued: {
    text: 'text-as-ink-soft',
    tone: statusTone.neutral,
    bar: 'bg-as-ink-faint',
    message: 'statusQueued',
  },
  paused: {
    text: 'text-as-ink-soft',
    tone: statusTone.neutral,
    bar: 'bg-as-ink-faint',
    message: 'statusPaused',
  },
  importing: {
    text: 'text-[#a8e6c4]',
    tone: statusTone.ok,
    bar: 'bg-[#a8e6c4]',
    message: 'statusImporting',
  },
  importPending: {
    text: 'text-[#a8e6c4]',
    tone: statusTone.ok,
    bar: 'bg-[#a8e6c4]',
    message: 'statusImportPending',
  },
  completed: {
    text: 'text-[#a8e6c4]',
    tone: statusTone.ok,
    bar: 'bg-[#a8e6c4]',
    message: 'statusCompleted',
  },
  warning: {
    text: 'text-[#f0d9a8]',
    tone: statusTone.warn,
    bar: 'bg-[#f0d9a8]',
    message: 'statusWarning',
  },
  stalled: {
    text: 'text-[#f0d9a8]',
    tone: statusTone.warn,
    bar: 'bg-[#f0d9a8]',
    message: 'statusStalled',
  },
  failed: {
    text: 'text-[#f2b0aa]',
    tone: statusTone.bad,
    bar: 'bg-[#f2b0aa]',
    message: 'statusFailed',
  },
};

export const getMediaHref = (item: DownloadItem): string | undefined => {
  if (!item.mediaId) {
    return undefined;
  }

  switch (item.mediaType) {
    case 'movie':
      return item.tmdbId ? `/movie/${item.tmdbId}` : undefined;
    case 'tv':
      return item.tmdbId ? `/tv/${item.tmdbId}` : undefined;
    case 'music':
      return item.mbId ? `/music/${item.mbId}` : undefined;
    default:
      return item.olId ? `/book/${item.olId}` : undefined;
  }
};

const imageStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover' as const,
};

/**
 * A poster or cover through the image cache when it is one Allseerr
 * caches, or the placeholder without one
 */
export const PosterImage = ({
  src,
  className,
}: {
  src?: string;
  className?: string;
}) => {
  if (!src) {
    return (
      <CachedImage
        type="tmdb"
        src="/images/allseerr_poster_not_found.png"
        alt=""
        style={imageStyle}
        className={className}
        fill
      />
    );
  }

  const type = src.startsWith('https://image.tmdb.org/')
    ? 'tmdb'
    : src.startsWith('https://artworks.thetvdb.com/')
      ? 'tvdb'
      : src.startsWith('https://covers.openlibrary.org/')
        ? 'book'
        : src.startsWith('https://archive.org/')
          ? 'music'
          : 'avatar';

  return (
    <CachedImage
      type={type}
      src={src}
      alt=""
      style={imageStyle}
      className={className}
      fill
    />
  );
};

/**
 * The card's backdrop: the art blurred and darkened behind the details
 */
export const CardBackdrop = ({ src }: { src?: string }) => (
  <div className="pointer-events-none absolute inset-0" aria-hidden="true">
    {src && <PosterImage src={src} className="scale-110 blur-2xl" />}
    <div className="absolute inset-0 bg-gradient-to-r from-as-surface via-as-surface/85 to-as-surface/70" />
  </div>
);

/**
 * A small uppercase label over its value, the rows of the card details
 */
export const Detail = ({
  label,
  children,
  title,
}: {
  label: string;
  children: ReactNode;
  title?: string;
}) => (
  <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-2">
    <dt className="text-[11px] font-bold uppercase tracking-wider text-as-ink-faint">
      {label}
    </dt>
    <dd className="truncate text-[13px] text-as-ink" title={title}>
      {children}
    </dd>
  </div>
);

/**
 * The cover of a book in Allseerr, from its OpenLibrary work
 */
export const useBookCover = (olId?: string | null): string | undefined => {
  const { data: book } = useSWR<BookDetails>(
    olId ? `/api/v1/book/${olId}` : null,
    { revalidateOnFocus: false }
  );

  return book?.posterPath ?? undefined;
};

/**
 * The poster or cover the arr sent. Books Chaptarr has no cover for use
 * the OpenLibrary one.
 */
const usePosterSrc = (item: DownloadItem) => {
  const isBook = item.mediaType === 'ebook' || item.mediaType === 'audiobook';
  const bookCover = useBookCover(
    isBook && !item.posterUrl ? item.olId : undefined
  );

  return item.posterUrl ?? bookCover;
};

const Poster = ({ item }: { item: DownloadItem }) => (
  <PosterImage src={usePosterSrc(item)} />
);

const STATUS_ICON: Record<
  DownloadStatus,
  ComponentType<{ className?: string }>
> = {
  downloading: ArrowDownTrayIcon,
  queued: ClockIcon,
  paused: PauseIcon,
  importing: ArrowPathIcon,
  importPending: ArrowPathIcon,
  completed: CheckCircleIcon,
  warning: WarningSolidIcon,
  stalled: WarningSolidIcon,
  failed: WarningSolidIcon,
};

export const MEDIA_ICON: Record<
  DownloadItem['mediaType'],
  ComponentType<{ className?: string }>
> = {
  movie: FilmIcon,
  tv: TvIcon,
  music: MusicalNoteIcon,
  audiobook: SpeakerWaveIcon,
  ebook: BookOpenIcon,
};

export type DownloadsLayout = 'cards' | 'list';

export const DOWNLOADS_LAYOUTS: DownloadsLayout[] = ['cards', 'list'];

// Shared by the list rows and their column headings so the columns line up
export const QUEUE_LIST_GRID =
  'md:grid-cols-[2.5rem_minmax(0,1fr)_8.5rem_minmax(8rem,12rem)_9rem_11rem]';
export const SEEDING_LIST_GRID =
  'md:grid-cols-[2.5rem_minmax(0,1fr)_8.5rem_minmax(8rem,12rem)_9rem_9rem]';

interface DownloadCardProps {
  item: DownloadItem;
  layout?: DownloadsLayout;
  onSearch: (item: DownloadItem) => void;
  onPickRelease: (item: DownloadItem) => void;
  onRemove: (item: DownloadItem) => void;
}

const DownloadCard = ({
  item,
  layout = 'cards',
  onSearch,
  onPickRelease,
  onRemove,
}: DownloadCardProps) => {
  const intl = useIntl();
  const style = STATUS_STYLE[item.status] ?? STATUS_STYLE.queued;
  const href = getMediaHref(item);
  const percent = Math.floor(item.progress * 100);
  const square = item.mediaType === 'music';
  const posterSrc = usePosterSrc(item);

  const formatDuration = (seconds: number) =>
    splitDuration(seconds)
      .map(({ unit, value }) =>
        intl.formatMessage(
          unit === 'day'
            ? messages.durationDay
            : unit === 'hour'
              ? messages.durationHour
              : unit === 'minute'
                ? messages.durationMinute
                : messages.durationSecond,
          { value }
        )
      )
      .join(' ');

  const episodes = episodeLabel(item.seasonNumber, item.episodeNumbers);
  const detail = (() => {
    switch (item.mediaType) {
      case 'tv':
        if (
          item.seasonNumber !== undefined &&
          (item.episodeNumbers?.length ?? 0) > 3
        ) {
          return intl.formatMessage(messages.seasonPack, {
            season: item.seasonNumber,
            count: item.episodeNumbers?.length,
          });
        }
        return [episodes, item.episodeTitle].filter(Boolean).join(' · ');
      case 'music':
        return item.artistName
          ? intl.formatMessage(messages.byName, { name: item.artistName })
          : undefined;
      case 'ebook':
      case 'audiobook':
        return [
          intl.formatMessage(
            item.mediaType === 'audiobook'
              ? globalMessages.audiobook
              : globalMessages.ebook
          ),
          item.authorName,
        ]
          .filter(Boolean)
          .join(' · ');
      default:
        return item.year ? String(item.year) : undefined;
    }
  })();

  const problems = [
    ...(item.errorMessage ? [item.errorMessage] : []),
    ...(item.needsAttention || item.status === 'importPending'
      ? item.statusMessages
      : []),
  ];
  const showTime =
    item.status === 'downloading' && item.timeLeftSeconds !== undefined;
  const sizeText =
    item.size > 0 && item.sizeLeft >= item.size
      ? formatBytes(item.size, 1)
      : item.size > 0
        ? intl.formatMessage(messages.sizeProgress, {
            done: formatBytes(Math.max(0, item.size - item.sizeLeft), 1),
            size: formatBytes(item.size, 1),
          })
        : undefined;

  const title = href ? (
    <Link
      href={href}
      className="line-clamp-2 text-[16px] font-bold leading-snug text-as-ink hover:underline"
    >
      {item.title}
    </Link>
  ) : (
    <span className="line-clamp-2 text-[16px] font-bold leading-snug text-as-ink">
      {item.title}
    </span>
  );

  const menuItem = (
    icon: ReactNode,
    label: string,
    onClick: () => void,
    danger = false
  ) => (
    <MenuItem>
      {({ focus }) => (
        <button
          type="button"
          onClick={onClick}
          className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold ${
            focus ? 'bg-as-raised' : ''
          } ${danger ? 'text-[#f2b0aa]' : 'text-as-ink'}`}
        >
          {icon}
          {label}
        </button>
      )}
    </MenuItem>
  );

  const actionsMenu = (className: string) => (
    <Menu as="div" className={`relative flex-none ${className}`}>
      <MenuButton
        className="flex h-8 w-8 items-center justify-center rounded-full text-as-ink-soft transition hover:bg-as-raised hover:text-as-ink focus:outline-none"
        aria-label={intl.formatMessage(messages.actions, {
          title: item.title,
        })}
      >
        <EllipsisVerticalIcon className="h-5 w-5" />
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        className="z-50 w-56 rounded-2xl bg-as-surface p-1.5 shadow-xl shadow-black/40 ring-1 ring-as-line [--anchor-gap:4px] focus:outline-none"
      >
        {item.canSearch &&
          menuItem(
            <MagnifyingGlassIcon className="h-5 w-5" />,
            intl.formatMessage(messages.searchAgain),
            () => onSearch(item)
          )}
        {item.mediaId &&
          item.target &&
          menuItem(
            <ListBulletIcon className="h-5 w-5" />,
            intl.formatMessage(messages.pickRelease),
            () => onPickRelease(item)
          )}
        {href && (
          <MenuItem>
            {({ focus }) => (
              <Link
                href={href}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-as-ink ${
                  focus ? 'bg-as-raised' : ''
                }`}
              >
                <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                {intl.formatMessage(messages.openTitle)}
              </Link>
            )}
          </MenuItem>
        )}
        {menuItem(
          <TrashIcon className="h-5 w-5" />,
          intl.formatMessage(messages.removeFromQueue),
          () => onRemove(item),
          true
        )}
      </MenuItems>
    </Menu>
  );

  const statusBadge = (
    <span
      className={`flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${style.tone}`}
    >
      {intl.formatMessage(messages[style.message])}
    </span>
  );

  const progressBar = (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-as-tile"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700 ${style.bar}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );

  const timeText = showTime
    ? intl.formatMessage(messages.timeLeft, {
        time: formatDuration(item.timeLeftSeconds ?? 0),
      })
    : undefined;

  if (layout === 'list') {
    return (
      <article
        className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 md:gap-y-0 ${QUEUE_LIST_GRID}`}
        data-testid="download-row"
      >
        <div
          className={`relative row-span-2 flex-none self-start overflow-hidden rounded-[8px] bg-as-tile md:row-span-1 md:self-center ${
            square ? 'h-10 w-10' : 'h-[60px] w-10'
          }`}
        >
          <Poster item={item} />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 [&>*]:line-clamp-1 [&>*]:text-[15px]">
              {title}
            </div>
            {problems.length > 0 && (
              <ExclamationTriangleIcon
                className={`h-4 w-4 flex-none ${
                  item.status === 'failed' ? 'text-[#f2b0aa]' : 'text-[#f0d9a8]'
                }`}
                title={problems.join(' ')}
              />
            )}
          </div>
          <div className="truncate text-xs text-as-ink-muted">
            {[detail, item.serverName].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="flex items-center gap-1 md:contents">
          <div className="hidden md:flex">{statusBadge}</div>
          <div className="md:hidden">{actionsMenu('')}</div>
        </div>
        <div className="col-span-2 flex flex-col gap-1 md:col-span-1">
          <div className="flex items-center gap-2 md:hidden">
            {statusBadge}
            <span className="ml-auto text-xs font-bold tabular-nums text-as-ink-soft">
              {percent}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            {progressBar}
            <span className="hidden w-10 flex-none text-right text-xs font-bold tabular-nums text-as-ink-soft md:inline">
              {percent}%
            </span>
          </div>
          <div className="truncate text-xs text-as-ink-muted md:hidden">
            {[sizeText, timeText, item.downloadClient]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div className="hidden min-w-0 flex-col text-xs text-as-ink-muted md:flex">
          <span className="truncate">{sizeText}</span>
          {timeText && <span className="truncate">{timeText}</span>}
        </div>
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <span className="min-w-0 truncate text-xs text-as-ink-muted">
            {[item.downloadClient, item.indexer].filter(Boolean).join(' · ')}
          </span>
          {actionsMenu('ml-auto')}
        </div>
      </article>
    );
  }

  const StatusIcon = STATUS_ICON[item.status] ?? ClockIcon;
  const MediaIcon = MEDIA_ICON[item.mediaType] ?? FilmIcon;
  const doneText =
    item.size > 0
      ? intl.formatMessage(messages.sizeOfTotal, {
          done: formatBytes(Math.max(0, item.size - item.sizeLeft), 1),
          size: formatBytes(item.size, 1),
        })
      : undefined;
  const isBook = item.mediaType === 'ebook' || item.mediaType === 'audiobook';
  const subline = [
    detail,
    item.year && item.mediaType !== 'movie' ? item.year : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="flex flex-col gap-2" data-testid="download-card">
      <div className="relative overflow-hidden rounded-[18px] bg-as-surface">
        <CardBackdrop src={item.backdropUrl ?? posterSrc} />
        <div className="relative flex gap-4 p-3 sm:p-4">
          <div
            className={`relative flex-none overflow-hidden rounded-[10px] bg-as-tile shadow-lg shadow-black/40 ${
              square
                ? 'h-[120px] w-[120px] self-center'
                : 'min-h-[150px] w-[104px] self-stretch sm:w-[128px]'
            }`}
          >
            <PosterImage src={posterSrc} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
            <dl className="flex min-w-0 flex-col gap-1">
              <Detail label={intl.formatMessage(messages.labelService)}>
                {item.serverName}
              </Detail>
              {item.downloadClient && (
                <Detail label={intl.formatMessage(messages.labelClient)}>
                  {[
                    item.downloadClient,
                    item.protocol !== 'unknown' &&
                      intl.formatMessage(
                        item.protocol === 'usenet'
                          ? messages.usenet
                          : messages.torrent
                      ),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Detail>
              )}
              {item.quality && (
                <Detail
                  label={intl.formatMessage(
                    isBook ? messages.labelFormat : messages.labelQuality
                  )}
                >
                  {item.quality}
                </Detail>
              )}
              <Detail label={intl.formatMessage(messages.labelStatus)}>
                <span className={`font-semibold ${style.text}`}>
                  {intl.formatMessage(messages[style.message])}
                </span>
                {item.seeders !== undefined && (
                  <span className="text-as-ink-muted">
                    {' · '}
                    {intl.formatMessage(messages.seeders, {
                      count: item.seeders,
                    })}
                  </span>
                )}
              </Detail>
              {item.indexer && (
                <Detail label={intl.formatMessage(messages.labelIndexer)}>
                  {item.indexer}
                </Detail>
              )}
              {item.releaseTitle && item.releaseTitle !== item.title && (
                <Detail
                  label={intl.formatMessage(messages.labelRelease)}
                  title={item.releaseTitle}
                >
                  {item.releaseTitle}
                </Detail>
              )}
              {item.outputPath && (
                <Detail
                  label={intl.formatMessage(messages.labelPath)}
                  title={item.outputPath}
                >
                  {item.outputPath}
                </Detail>
              )}
            </dl>
            {problems.length > 0 && (
              <div
                className={`flex gap-2 rounded-[12px] px-2.5 py-1.5 text-xs leading-relaxed ${
                  item.status === 'failed' ? statusTone.bad : statusTone.warn
                }`}
              >
                <ExclamationTriangleIcon className="mt-px h-4 w-4 flex-none" />
                <div className="min-w-0 space-y-0.5 break-words">
                  {problems.slice(0, 2).map((problem) => (
                    <p key={problem}>{problem}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="absolute right-2 top-2">{actionsMenu('')}</div>
        </div>
        <div
          className="relative h-1 w-full bg-black/40"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className="h-full bg-as-accent transition-[width] duration-700"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <div className="flex min-w-0 items-start gap-3 px-1">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <StatusIcon
              className={`h-4 w-4 flex-none ${style.text}`}
              aria-hidden="true"
            />
            <div className="min-w-0 [&>*]:line-clamp-1 [&>*]:text-[15px]">
              {title}
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-as-ink-muted">
            <MediaIcon className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
            <span className="truncate">
              {subline || (item.year ? String(item.year) : '')}
            </span>
          </div>
        </div>
        {(timeText || doneText) && (
          <div className="flex flex-none flex-col items-end gap-0.5 text-right text-xs leading-snug text-as-ink-soft">
            {timeText && (
              <span className="text-[13px] font-semibold text-as-ink">
                {intl.formatMessage(messages.eta, {
                  time: formatDuration(item.timeLeftSeconds ?? 0),
                })}
              </span>
            )}
            {doneText && <span className="tabular-nums">{doneText}</span>}
          </div>
        )}
        {item.requester && (
          <div
            className="flex flex-none items-center gap-2 pt-0.5 text-xs text-as-ink-soft"
            title={intl.formatMessage(messages.requestedBy, {
              name: item.requester.displayName,
            })}
          >
            <span className="hidden max-w-[8rem] truncate sm:inline">
              {item.requester.displayName}
            </span>
            <UserAvatar
              id={item.requester.id}
              name={item.requester.displayName}
              avatar={item.requester.avatar}
              size={28}
            />
          </div>
        )}
      </div>
    </article>
  );
};

export default DownloadCard;
