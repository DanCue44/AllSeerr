import CachedImage from '@app/components/Common/CachedImage';
import defineMessages from '@app/utils/defineMessages';
import { CheckCircleIcon, UserIcon } from '@heroicons/react/24/solid';
import type { CalendarItem } from '@server/interfaces/api/calendarInterfaces';
import Link from 'next/link';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Calendar.CalendarEntry', {
  cinema: 'In Cinemas',
  digital: 'Digital Release',
  physical: 'Physical Release',
  release: 'Album Release',
  downloaded: 'Downloaded',
  requestedByYou: 'Requested by you',
  requestedBy: 'Requested by {users}',
});

interface CalendarEntryProps {
  item: CalendarItem;
  compact?: boolean;
}

const typeColors: Record<CalendarItem['type'], string> = {
  movie: 'border-blue-500',
  episode: 'border-purple-500',
  album: 'border-green-500',
};

const getPosterSource = (posterUrl?: string): string =>
  posterUrl
    ? posterUrl.replace(
        /^https:\/\/image\.tmdb\.org\/t\/p\/original\//,
        'https://image.tmdb.org/t/p/w300_and_h450_face/'
      )
    : '/images/seerr_poster_not_found_logo_top.png';

const getHref = (item: CalendarItem): string | undefined => {
  if (!item.tmdbId) {
    return undefined;
  }

  if (item.type === 'movie') {
    return `/movie/${item.tmdbId}`;
  }

  if (item.type === 'episode') {
    return `/tv/${item.tmdbId}`;
  }

  return undefined;
};

const CalendarEntry = ({ item, compact = false }: CalendarEntryProps) => {
  const intl = useIntl();
  const href = getHref(item);

  const details =
    item.releaseType === 'airing'
      ? item.subtitle
      : [
          intl.formatMessage(messages[item.releaseType]),
          item.type === 'album' ? item.subtitle : undefined,
        ]
          .filter(Boolean)
          .join(' - ');

  const poster = (
    <div
      className={`relative flex-shrink-0 overflow-hidden rounded ${
        compact ? 'hidden h-9 w-6 xl:block' : 'h-[4.5rem] w-12'
      }`}
    >
      <CachedImage
        type={item.posterUrl?.includes('thetvdb.com') ? 'tvdb' : 'tmdb'}
        src={getPosterSource(item.posterUrl)}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        fill
      />
    </div>
  );

  const content = compact ? (
    <div
      className={`flex items-center space-x-2 rounded border-l-4 bg-gray-700 px-1.5 py-1 transition duration-150 ${
        typeColors[item.type]
      } ${href ? 'hover:bg-gray-600' : ''}`}
      title={[item.title, details].filter(Boolean).join('\n')}
    >
      {poster}
      <div className="min-w-0 flex-1">
        <div className="flex items-center text-xs font-semibold text-white">
          <span className="truncate">{item.title}</span>
          {item.hasFile && (
            <CheckCircleIcon className="ml-1 h-3 w-3 flex-shrink-0 text-green-500" />
          )}
        </div>
        {details && (
          <div className="truncate text-xs text-gray-400">{details}</div>
        )}
      </div>
    </div>
  ) : (
    <div
      className={`flex items-center space-x-3 rounded-lg border-l-4 bg-gray-800 p-2 ring-1 ring-gray-700 transition duration-150 ${
        typeColors[item.type]
      } ${href ? 'hover:bg-gray-700' : ''}`}
    >
      {poster}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-white">{item.title}</div>
        {details && (
          <div className="truncate text-sm text-gray-300">{details}</div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
          {item.airDateUtc && (
            <span>
              {intl.formatTime(item.airDateUtc, {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          )}
          {item.hasFile && (
            <span className="flex items-center text-green-500">
              <CheckCircleIcon className="mr-1 h-4 w-4" />
              {intl.formatMessage(messages.downloaded)}
            </span>
          )}
          {item.requestedByMe ? (
            <span className="flex items-center">
              <UserIcon className="mr-1 h-4 w-4" />
              {intl.formatMessage(messages.requestedByYou)}
            </span>
          ) : (
            item.requestedBy && (
              <span className="flex items-center">
                <UserIcon className="mr-1 h-4 w-4" />
                {intl.formatMessage(messages.requestedBy, {
                  users: item.requestedBy
                    .map((user) => user.displayName)
                    .join(', '),
                })}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {content}
    </Link>
  ) : (
    content
  );
};

export default CalendarEntry;
