import CachedImage from '@app/components/Common/CachedImage';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import { addDays, fromDateKey, toDateKey } from '@app/utils/calendarHelpers';
import defineMessages from '@app/utils/defineMessages';
import { getCalendarItemHref } from '@app/utils/upcoming';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import type { CalendarItem } from '@server/interfaces/api/calendarInterfaces';
import Link from 'next/link';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.ComingUpSlider', {
  today: 'Today',
  tomorrow: 'Tomorrow',
});

const getPosterSource = (posterUrl?: string): string =>
  posterUrl
    ? posterUrl.replace(
        /^https:\/\/image\.tmdb\.org\/t\/p\/original\//,
        'https://image.tmdb.org/t/p/w300_and_h450_face/'
      )
    : '/images/seerr_poster_not_found_logo_top.png';

const getImageType = (item: CalendarItem): 'tmdb' | 'tvdb' | 'music' =>
  item.type === 'album'
    ? 'music'
    : item.posterUrl?.includes('thetvdb.com')
      ? 'tvdb'
      : 'tmdb';

/** Today, Tomorrow, or a short weekday and date. */
export const useReleaseDayLabel = () => {
  const intl = useIntl();

  return (date: string): string => {
    const today = new Date();

    if (date === toDateKey(today)) {
      return intl.formatMessage(messages.today);
    }

    if (date === toDateKey(addDays(today, 1))) {
      return intl.formatMessage(messages.tomorrow);
    }

    return intl.formatDate(fromDateKey(date), {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };
};

interface ReleaseCardProps {
  title: string;
  /** Line under the title, such as the year, the episode or the artist */
  caption?: string;
  posterSrc: string;
  imageType: 'tmdb' | 'tvdb' | 'music' | 'book';
  /** Square artwork, for albums */
  square?: boolean;
  /** The day shown on the artwork, left out for lists grouped by day */
  dayLabel?: string;
  hasFile?: boolean;
  href?: string;
  /** Fill the grid cell instead of a slider's fixed width */
  canExpand?: boolean;
}

/**
 * Artwork with the day a title comes out, its title and a caption, for
 * releases from the calendar and books from followed authors.
 */
export const ReleaseCard = ({
  title,
  caption,
  posterSrc,
  imageType,
  square = false,
  dayLabel,
  hasFile = false,
  href,
  canExpand = false,
}: ReleaseCardProps) => {
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';

  const width = canExpand
    ? 'w-full'
    : ambient
      ? 'w-[150px] sm:w-[176px]'
      : 'w-36 sm:w-36 md:w-44';

  const content = (
    <>
      <div
        className={`relative overflow-hidden ${
          ambient
            ? 'rounded-[18px] bg-as-tile'
            : 'rounded-xl bg-gray-800 ring-1 ring-gray-700'
        }`}
        style={{ paddingBottom: square ? '100%' : '150%' }}
      >
        <CachedImage
          type={imageType}
          src={posterSrc}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          fill
        />
        {dayLabel && (
          <span
            className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-xs font-bold ${
              ambient
                ? 'bg-as-ground/90 text-as-ink'
                : 'bg-gray-900/90 text-white'
            }`}
          >
            {dayLabel}
          </span>
        )}
        {hasFile && (
          <CheckCircleIcon
            className={`absolute right-2 top-2 h-6 w-6 drop-shadow ${
              ambient ? 'text-as-ok' : 'text-green-400'
            }`}
          />
        )}
      </div>
      <div className="mt-2.5">
        <div
          className={`line-clamp-2 whitespace-normal break-words font-bold ${
            ambient ? 'text-as-ink' : 'text-sm text-white'
          } ${href ? 'group-hover:underline' : ''}`}
        >
          {title}
        </div>
        {caption && (
          <div
            className={`truncate text-[13px] ${
              ambient ? 'text-as-ink-faint' : 'text-gray-400'
            }`}
          >
            {caption}
          </div>
        )}
      </div>
    </>
  );

  return href ? (
    <Link href={href} className={`group block ${width}`}>
      {content}
    </Link>
  ) : (
    <div className={width}>{content}</div>
  );
};

interface UpcomingCardProps {
  item: CalendarItem;
  /** Fill the grid cell instead of a slider's fixed width */
  canExpand?: boolean;
  /** Leave out the day, for lists already grouped by day */
  hideDate?: boolean;
}

/**
 * A release from the calendar: its artwork with the day it comes out, for
 * the Coming Up rows and the Upcoming pages of the spaces.
 */
const UpcomingCard = ({
  item,
  canExpand = false,
  hideDate = false,
}: UpcomingCardProps) => {
  const dayLabel = useReleaseDayLabel();

  // The day is on the artwork (or in the heading above), so the caption
  // carries the year, the episode or the artist
  return (
    <ReleaseCard
      title={item.title}
      caption={item.subtitle}
      posterSrc={getPosterSource(item.posterUrl)}
      imageType={getImageType(item)}
      square={item.type === 'album'}
      dayLabel={hideDate ? undefined : dayLabel(item.date)}
      hasFile={item.hasFile}
      href={getCalendarItemHref(item)}
      canExpand={canExpand}
    />
  );
};

export default UpcomingCard;
