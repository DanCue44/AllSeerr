import { ambientGrid } from '@app/components/AllSeerr/ListPage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import { getUpcomingRange } from '@app/components/Discover/ComingUpSlider';
import UpcomingCard, {
  ReleaseCard,
  useReleaseDayLabel,
} from '@app/components/Discover/ComingUpSlider/UpcomingCard';
import { sliderTitles } from '@app/components/Discover/constants';
import MediaSlider from '@app/components/MediaSlider';
import SpaceLayout, { spaceMessages } from '@app/components/Space';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import { fromDateKey } from '@app/utils/calendarHelpers';
import defineMessages from '@app/utils/defineMessages';
import type { UpcomingMediaType } from '@app/utils/upcoming';
import { groupByDate, selectUpcomingItems } from '@app/utils/upcoming';
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import type { CalendarResponse } from '@server/interfaces/api/calendarInterfaces';
import type {
  BookRelease,
  UpcomingBooksResponse,
} from '@server/interfaces/api/discoverInterfaces';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Space.SpaceUpcoming', {
  comingsoon: 'Coming Soon',
  comingsoonDescription:
    'Books from the authors you follow that are not out yet.',
  comingsoonEmpty: 'No upcoming books from the authors you follow.',
  newreleases: 'New Releases',
  newreleasesDescription:
    'Books from the authors you follow, out in the last {days} days.',
  newreleasesEmpty: 'Nothing new from the authors you follow lately.',
  newthisyear: 'New This Year',
  newthisyearDescription:
    'Books from the authors you follow first published this year. OpenLibrary only knows the year a book came out, so books still to come are not listed.',
  newthisyearEmpty: 'Nothing new from the authors you follow this year.',
  noauthors:
    'Follow authors from their pages to see their upcoming books here.',
  someauthors:
    'Showing books from the {count} authors you followed most recently.',
});

// The calendar API allows a little over two months at a time
const UPCOMING_DAYS = 60;

/** Releases from the servers' calendars, a heading per day. */
const CalendarReleases = ({ mediaType }: { mediaType: UpcomingMediaType }) => {
  const intl = useIntl();
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';
  const dayLabel = useReleaseDayLabel();
  const { start, end } = getUpcomingRange(UPCOMING_DAYS);
  const { data, error } = useSWR<CalendarResponse>(
    `/api/v1/calendar?start=${start}&end=${end}`
  );

  const days = data
    ? groupByDate(
        selectUpcomingItems(data.results, { mediaType, from: start })
      ).map((day) => ({
        ...day,
        // Several episodes of a series on one day show as one card
        items: selectUpcomingItems(day.items, { onePerTitle: true }),
      }))
    : [];

  return (
    <section className="mb-10">
      <div className="slider-header">
        <Link href="/calendar" className="slider-title">
          <span>{intl.formatMessage(spaceMessages.oncalendar)}</span>
          <ArrowRightCircleIcon />
        </Link>
      </div>
      {!data && !error ? (
        <LoadingSpinner />
      ) : days.length === 0 ? (
        <p className={ambient ? 'text-as-ink-faint' : 'text-gray-400'}>
          {intl.formatMessage(spaceMessages.calendarempty)}
        </p>
      ) : (
        days.map((day) => (
          <div key={`upcoming-${day.date}`} className="mb-8">
            <h3
              className={`mb-3 text-sm font-semibold uppercase tracking-wider ${
                ambient ? 'text-as-accent' : 'text-indigo-400'
              }`}
            >
              {dayLabel(day.date)}
            </h3>
            <ul className={ambient ? ambientGrid : 'cards-vertical'}>
              {day.items.map((item) => (
                <li key={`upcoming-${item.id}`}>
                  <UpcomingCard item={item} canExpand hideDate />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
};

// Authors looked up for the page, as the server has it
const MAX_AUTHORS = 20;

/** The release day, or the month or year when that is all that is known. */
const useBookDateLabel = () => {
  const intl = useIntl();
  const dayLabel = useReleaseDayLabel();

  return (date: string): string => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return dayLabel(date);
    }

    if (/^\d{4}-\d{2}$/.test(date)) {
      return intl.formatDate(fromDateKey(`${date}-01`), {
        month: 'short',
        year: 'numeric',
      });
    }

    return date;
  };
};

const BookReleaseGrid = ({
  title,
  description,
  empty,
  releases,
}: {
  title: string;
  description: string;
  empty: string;
  releases: BookRelease[];
}) => {
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';
  const dateLabel = useBookDateLabel();

  return (
    <section className="mb-10">
      <div className="slider-header">
        <div className="slider-title">
          <span>{title}</span>
        </div>
      </div>
      <p
        className={`-mt-1 mb-4 text-sm ${
          ambient ? 'text-as-ink-faint' : 'text-gray-400'
        }`}
      >
        {description}
      </p>
      {releases.length === 0 ? (
        <p className={ambient ? 'text-as-ink-faint' : 'text-gray-400'}>
          {empty}
        </p>
      ) : (
        <ul className={ambient ? ambientGrid : 'cards-vertical'}>
          {releases.map((release) => (
            <li key={`book-release-${release.id}`}>
              <ReleaseCard
                title={release.title}
                caption={release.authorName}
                posterSrc={
                  release.posterUrl ??
                  '/images/seerr_poster_not_found_logo_top.png'
                }
                imageType="book"
                dayLabel={dateLabel(release.date)}
                // Books found on Google Books have no page here, their
                // author has
                href={
                  release.olId
                    ? `/book/${release.olId}`
                    : `/author/${release.authorId}`
                }
                canExpand
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/**
 * Books from the authors the user follows: coming soon and out lately from
 * Google Books, or this year's from OpenLibrary when there is no key.
 */
const BookReleases = () => {
  const intl = useIntl();
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';
  const { data, error } = useSWR<UpcomingBooksResponse>(
    '/api/v1/discover/books/upcoming',
    { revalidateOnFocus: false }
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data || data.followedAuthors === 0) {
    return (
      <p className={`mb-10 ${ambient ? 'text-as-ink-faint' : 'text-gray-400'}`}>
        {intl.formatMessage(messages.noauthors)}
      </p>
    );
  }

  return (
    <>
      {data.followedAuthors > MAX_AUTHORS && (
        <p
          className={`mb-6 text-sm ${
            ambient ? 'text-as-ink-faint' : 'text-gray-400'
          }`}
        >
          {intl.formatMessage(messages.someauthors, { count: MAX_AUTHORS })}
        </p>
      )}
      {data.source === 'googlebooks' ? (
        <>
          <BookReleaseGrid
            title={intl.formatMessage(messages.comingsoon)}
            description={intl.formatMessage(messages.comingsoonDescription)}
            empty={intl.formatMessage(messages.comingsoonEmpty)}
            releases={data.comingSoon}
          />
          <BookReleaseGrid
            title={intl.formatMessage(messages.newreleases)}
            description={intl.formatMessage(messages.newreleasesDescription, {
              days: data.recentDays,
            })}
            empty={intl.formatMessage(messages.newreleasesEmpty)}
            releases={data.newReleases}
          />
        </>
      ) : (
        <BookReleaseGrid
          title={intl.formatMessage(messages.newthisyear)}
          description={intl.formatMessage(messages.newthisyearDescription)}
          empty={intl.formatMessage(messages.newthisyearEmpty)}
          releases={data.newReleases}
        />
      )}
    </>
  );
};

/**
 * The Upcoming section of a space: what the Radarr, Sonarr or Lidarr
 * servers expect in the next two months, then what is coming out in
 * general. Books have no release calendar, so their section lists books
 * from the authors the user follows.
 */
const SpaceUpcoming = ({
  space,
}: {
  space: 'movies' | 'series' | 'music' | 'books';
}) => {
  const intl = useIntl();

  return (
    <SpaceLayout space={space} section="upcoming">
      {space === 'movies' && (
        <>
          <CalendarReleases mediaType="movie" />
          <MediaSlider
            sliderKey="space-upcoming-movies"
            title={intl.formatMessage(sliderTitles.upcoming)}
            url="/api/v1/discover/movies/upcoming"
            linkUrl="/discover/movies/upcoming"
          />
        </>
      )}
      {space === 'series' && (
        <>
          <CalendarReleases mediaType="tv" />
          <MediaSlider
            sliderKey="space-upcoming-tv"
            title={intl.formatMessage(sliderTitles.upcomingtv)}
            url="/api/v1/discover/tv/upcoming"
            linkUrl="/discover/tv/upcoming"
          />
        </>
      )}
      {space === 'music' && (
        <>
          <CalendarReleases mediaType="music" />
          <MediaSlider
            sliderKey="space-new-music"
            title={intl.formatMessage(sliderTitles.newmusic)}
            url="/api/v1/discover/music"
            linkUrl="/music/browse?list=new"
          />
        </>
      )}
      {space === 'books' && <BookReleases />}
      <div className="extra-bottom-space relative" />
    </SpaceLayout>
  );
};

export default SpaceUpcoming;
