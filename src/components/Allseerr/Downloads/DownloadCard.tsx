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
import type {
  DownloadItem,
  DownloadStatus,
} from '@server/interfaces/api/downloadInterfaces';
import type { BookDetails } from '@server/models/Book';
import Link from 'next/link';
import type { ReactNode } from 'react';
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
});

const STATUS_STYLE: Record<
  DownloadStatus,
  { tone: string; bar: string; message: keyof typeof messages }
> = {
  downloading: {
    tone: statusTone.info,
    bar: 'bg-as-accent',
    message: 'statusDownloading',
  },
  queued: {
    tone: statusTone.neutral,
    bar: 'bg-as-ink-faint',
    message: 'statusQueued',
  },
  paused: {
    tone: statusTone.neutral,
    bar: 'bg-as-ink-faint',
    message: 'statusPaused',
  },
  importing: {
    tone: statusTone.ok,
    bar: 'bg-[#a8e6c4]',
    message: 'statusImporting',
  },
  importPending: {
    tone: statusTone.ok,
    bar: 'bg-[#a8e6c4]',
    message: 'statusImportPending',
  },
  completed: {
    tone: statusTone.ok,
    bar: 'bg-[#a8e6c4]',
    message: 'statusCompleted',
  },
  warning: {
    tone: statusTone.warn,
    bar: 'bg-[#f0d9a8]',
    message: 'statusWarning',
  },
  stalled: {
    tone: statusTone.warn,
    bar: 'bg-[#f0d9a8]',
    message: 'statusStalled',
  },
  failed: {
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
export const PosterImage = ({ src }: { src?: string }) => {
  if (!src) {
    return (
      <CachedImage
        type="tmdb"
        src="/images/seerr_poster_not_found.png"
        alt=""
        style={imageStyle}
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

  return <CachedImage type={type} src={src} alt="" style={imageStyle} fill />;
};

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
const Poster = ({ item }: { item: DownloadItem }) => {
  const isBook = item.mediaType === 'ebook' || item.mediaType === 'audiobook';
  const bookCover = useBookCover(
    isBook && !item.posterUrl ? item.olId : undefined
  );

  return <PosterImage src={item.posterUrl ?? bookCover} />;
};

const Badge = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${className ?? ''}`}
  >
    {children}
  </span>
);

interface DownloadCardProps {
  item: DownloadItem;
  onSearch: (item: DownloadItem) => void;
  onPickRelease: (item: DownloadItem) => void;
  onRemove: (item: DownloadItem) => void;
}

const DownloadCard = ({
  item,
  onSearch,
  onPickRelease,
  onRemove,
}: DownloadCardProps) => {
  const intl = useIntl();
  const style = STATUS_STYLE[item.status] ?? STATUS_STYLE.queued;
  const href = getMediaHref(item);
  const percent = Math.floor(item.progress * 100);
  const square = item.mediaType === 'music';

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

  return (
    <article
      className="flex flex-col gap-3 rounded-[20px] bg-as-surface p-4 sm:p-[18px]"
      data-testid="download-card"
    >
      <div className="flex gap-3">
        <div
          className={`relative flex-none overflow-hidden rounded-[10px] bg-as-tile ${
            square ? 'h-14 w-14' : 'h-[72px] w-12'
          }`}
        >
          <Poster item={item} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">{title}</div>
            <span
              className={`flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${style.tone}`}
            >
              {intl.formatMessage(messages[style.message])}
            </span>
            <Menu as="div" className="relative -mr-1.5 -mt-1 flex-none">
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
          </div>
          {detail && (
            <div className="truncate text-sm text-as-ink-soft">{detail}</div>
          )}
          {item.requester && (
            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-as-ink-muted">
              <UserAvatar
                id={item.requester.id}
                name={item.requester.displayName}
                avatar={item.requester.avatar}
                size={20}
              />
              <span className="truncate">
                {intl.formatMessage(messages.requestedBy, {
                  name: item.requester.displayName,
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
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
        <div className="flex items-center justify-between gap-3 text-xs text-as-ink-muted">
          <span className="truncate">
            {[
              sizeText,
              showTime &&
                intl.formatMessage(messages.timeLeft, {
                  time: formatDuration(item.timeLeftSeconds ?? 0),
                }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span className="flex-none font-bold tabular-nums text-as-ink-soft">
            {percent}%
          </span>
        </div>
      </div>

      {problems.length > 0 && (
        <div
          className={`flex gap-2 rounded-[14px] px-3 py-2 text-xs leading-relaxed ${
            item.status === 'failed' ? statusTone.bad : statusTone.warn
          }`}
        >
          <ExclamationTriangleIcon className="mt-px h-4 w-4 flex-none" />
          <div className="min-w-0 space-y-0.5 break-words">
            {problems.slice(0, 3).map((problem) => (
              <p key={problem}>{problem}</p>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-as-ink-muted">
        {item.protocol !== 'unknown' && (
          <Badge
            className={
              item.protocol === 'usenet'
                ? statusTone.info
                : 'bg-[#2d2a45] text-[#c9c0f5]'
            }
          >
            {intl.formatMessage(
              item.protocol === 'usenet' ? messages.usenet : messages.torrent
            )}
          </Badge>
        )}
        {[
          item.downloadClient,
          item.indexer,
          item.seeders !== undefined &&
            intl.formatMessage(messages.seeders, { count: item.seeders }),
          item.serverName,
        ]
          .filter(Boolean)
          .map((part) => (
            <span key={String(part)} className="whitespace-nowrap">
              {part}
            </span>
          ))
          .reduce<ReactNode[]>(
            (parts, part, index) =>
              index === 0
                ? [part]
                : [
                    ...parts,
                    <span key={`dot-${index}`} aria-hidden="true">
                      ·
                    </span>,
                    part,
                  ],
            []
          )}
      </div>
      {item.releaseTitle && item.releaseTitle !== item.title && (
        <div
          className="-mt-1 truncate text-[11px] text-as-ink-faint"
          title={item.releaseTitle}
        >
          {item.releaseTitle}
        </div>
      )}
    </article>
  );
};

export default DownloadCard;
