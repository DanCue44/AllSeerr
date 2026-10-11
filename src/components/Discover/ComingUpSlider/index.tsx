import UpcomingCard from '@app/components/Discover/ComingUpSlider/UpcomingCard';
import Slider from '@app/components/Slider';
import { addDays, toDateKey } from '@app/utils/calendarHelpers';
import defineMessages from '@app/utils/defineMessages';
import type { UpcomingMediaType } from '@app/utils/upcoming';
import { selectUpcomingItems } from '@app/utils/upcoming';
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import type { CalendarResponse } from '@server/interfaces/api/calendarInterfaces';
import Link from 'next/link';
import { useInView } from 'react-intersection-observer';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Discover.ComingUpSlider', {
  comingup: 'Coming Up',
});

const MAX_ITEMS = 20;

/** The calendar range of the next few weeks, from today. */
export const getUpcomingRange = (days: number) => {
  const today = new Date();

  return { start: toDateKey(today), end: toDateKey(addDays(today, days)) };
};

interface ComingUpSliderProps {
  /** Only show this media type */
  mediaType?: UpcomingMediaType;
  title?: string;
  linkUrl?: string;
  /** How far ahead to look */
  days?: number;
}

/**
 * The next releases from the calendar of the Radarr, Sonarr and Lidarr
 * servers: new episodes, movie releases and albums, one card per title.
 */
const ComingUpSlider = ({
  mediaType,
  title,
  linkUrl = '/calendar',
  days = 21,
}: ComingUpSliderProps) => {
  const intl = useIntl();
  // The calendar asks every server, so it waits until the row is close
  const { ref, inView } = useInView({ triggerOnce: true, rootMargin: '400px' });
  const { start, end } = getUpcomingRange(days);
  const { data, error } = useSWR<CalendarResponse>(
    inView ? `/api/v1/calendar?start=${start}&end=${end}` : null
  );

  const items = data
    ? selectUpcomingItems(data.results, {
        mediaType,
        from: start,
        onePerTitle: true,
        limit: MAX_ITEMS,
      })
    : undefined;

  if (error || (items && items.length === 0)) {
    return null;
  }

  return (
    <div ref={ref}>
      <div className="slider-header">
        <Link href={linkUrl} className="slider-title">
          <span>{title ?? intl.formatMessage(messages.comingup)}</span>
          <ArrowRightCircleIcon />
        </Link>
      </div>
      <Slider
        sliderKey={`coming-up-${mediaType ?? 'all'}`}
        isLoading={!items}
        items={(items ?? []).map((item) => (
          <UpcomingCard key={`coming-up-${item.id}`} item={item} />
        ))}
      />
    </div>
  );
};

export default ComingUpSlider;
