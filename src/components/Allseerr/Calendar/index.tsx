import {
  AmbientPageHeader,
  PillButton,
  RoundIconButton,
} from '@app/components/Allseerr/ListPage';
import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import { getMonthGridDays, toDateKey } from '@app/utils/calendarHelpers';
import defineMessages from '@app/utils/defineMessages';
import {
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  UserIcon,
} from '@heroicons/react/24/solid';
import type {
  CalendarItem,
  CalendarItemType,
  CalendarResponse,
} from '@server/interfaces/api/calendarInterfaces';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Allseerr.Calendar', {
  calendar: 'Calendar',
  today: 'Today',
  previousMonth: 'Previous Month',
  nextMonth: 'Next Month',
  music: 'Music',
  myRequests: 'My Requests',
  noReleases: 'No upcoming releases this month.',
  cinema: 'In Cinemas',
  digital: 'Digital Release',
  physical: 'Physical Release',
  release: 'Album Release',
  downloaded: 'Downloaded',
  requestedByYou: 'Requested by you',
  requestedBy: 'Requested by {users}',
  showEarlier:
    'Show earlier this month ({count, plural, one {# day} other {# days}})',
});

// Small marker for each kind of release, in place of the classic colored edge
const typeDot: Record<CalendarItemType, string> = {
  movie: 'bg-as-info',
  episode: 'bg-as-accent',
  album: 'bg-as-ok',
};

const getPosterSource = (posterUrl?: string): string =>
  posterUrl
    ? posterUrl.replace(
        /^https:\/\/image\.tmdb\.org\/t\/p\/original\//,
        'https://image.tmdb.org/t/p/w300_and_h450_face/'
      )
    : '/images/allseerr_poster_not_found_logo_top.png';

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

const Poster = ({
  item,
  className,
}: {
  item: CalendarItem;
  className: string;
}) => (
  <div
    className={`relative flex-shrink-0 overflow-hidden bg-as-tile ${className}`}
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

/** One release, as a compact row in the month grid or a card in the agenda. */
const Entry = ({
  item,
  compact = false,
}: {
  item: CalendarItem;
  compact?: boolean;
}) => {
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

  const content = compact ? (
    <div
      className={`flex items-center gap-2 rounded-xl bg-as-raised p-1.5 transition ${
        href ? 'hover:bg-as-line' : ''
      }`}
      title={[item.title, details].filter(Boolean).join('\n')}
    >
      <Poster item={item} className="hidden h-9 w-6 rounded-md xl:block" />
      <span
        className={`h-2 w-2 flex-none rounded-full xl:hidden ${typeDot[item.type]}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center text-xs font-semibold text-as-ink">
          <span className="truncate">{item.title}</span>
          {item.hasFile && (
            <CheckCircleIcon className="ml-1 h-3 w-3 flex-shrink-0 text-as-ok" />
          )}
        </div>
        {details && (
          <div className="truncate text-[11px] text-as-ink-faint">
            {details}
          </div>
        )}
      </div>
    </div>
  ) : (
    <div
      className={`flex items-center gap-3.5 rounded-[18px] bg-as-surface p-2.5 transition ${
        href ? 'hover:bg-as-raised' : ''
      }`}
    >
      <Poster item={item} className="h-[4.5rem] w-12 rounded-[10px]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 flex-none rounded-full ${typeDot[item.type]}`}
          />
          <span className="truncate font-bold text-as-ink">{item.title}</span>
        </div>
        {details && (
          <div className="truncate text-sm text-as-ink-soft">{details}</div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-as-ink-faint">
          {item.airDateUtc && (
            <span>
              {intl.formatTime(item.airDateUtc, {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          )}
          {item.hasFile && (
            <span className="flex items-center text-as-ok">
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

/** Desktop month view: one soft tile per day, today in the accent. */
const MonthGrid = ({
  month,
  days,
  itemsByDay,
}: {
  month: Date;
  days: Date[];
  itemsByDay: Record<string, CalendarItem[]>;
}) => {
  const intl = useIntl();
  const todayKey = toDateKey(new Date());

  return (
    <div className="rounded-[22px] bg-as-surface p-3 lg:p-4">
      <div className="mb-2 grid grid-cols-7 gap-2">
        {days.slice(0, 7).map((day) => (
          <div
            key={`weekday-${day.getDay()}`}
            className="px-2 py-1 text-center text-xs font-bold uppercase tracking-wider text-as-ink-faint"
          >
            {intl.formatDate(day, { weekday: 'short' })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const key = toDateKey(day);
          const isCurrentMonth = day.getMonth() === month.getMonth();
          const isToday = key === todayKey;

          return (
            <div
              key={key}
              className={`min-h-[8rem] min-w-0 rounded-2xl p-1.5 ${
                isToday
                  ? 'bg-as-tile ring-2 ring-as-accent'
                  : isCurrentMonth
                    ? 'bg-as-tile'
                    : 'bg-as-tile/40'
              }`}
            >
              <div className="mb-1.5 flex justify-end">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                    isToday
                      ? 'bg-as-accent font-bold text-as-ground'
                      : isCurrentMonth
                        ? 'font-semibold text-as-ink-soft'
                        : 'text-as-mid'
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="space-y-1">
                {(itemsByDay[key] ?? []).map((item) => (
                  <Entry key={item.id} item={item} compact />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Phone view: the days of the month that have releases, as a list. */
const Agenda = ({
  days,
  itemsByDay,
}: {
  days: Date[];
  itemsByDay: Record<string, CalendarItem[]>;
}) => {
  const intl = useIntl();
  const [showEarlier, setShowEarlier] = useState(false);
  const todayKey = toDateKey(new Date());
  const allDaysWithItems = days.filter(
    (day) => (itemsByDay[toDateKey(day)] ?? []).length > 0
  );
  // In the current month the list starts at today, with earlier days a tap away
  const earlierDays = allDaysWithItems.filter(
    (day) => toDateKey(day) < todayKey
  );
  const hideEarlier =
    !showEarlier &&
    earlierDays.length > 0 &&
    earlierDays.length < allDaysWithItems.length;
  const daysWithItems = hideEarlier
    ? allDaysWithItems.filter((day) => toDateKey(day) >= todayKey)
    : allDaysWithItems;

  if (daysWithItems.length === 0) {
    return (
      <div className="mt-8 rounded-[22px] bg-as-surface px-6 py-10 text-center text-as-ink-faint">
        {intl.formatMessage(messages.noReleases)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hideEarlier && (
        <button
          type="button"
          onClick={() => setShowEarlier(true)}
          className="w-full rounded-full border border-as-line px-4 py-2.5 text-sm font-semibold text-as-ink-soft transition hover:border-as-line-strong hover:text-as-ink"
        >
          {intl.formatMessage(messages.showEarlier, {
            count: earlierDays.length,
          })}
        </button>
      )}
      {daysWithItems.map((day) => {
        const key = toDateKey(day);
        const isToday = key === todayKey;

        return (
          <section key={key}>
            <h3 className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-as-ink-faint">
              {intl.formatDate(day, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
              {isToday && (
                <span className="rounded-full bg-as-accent px-2.5 py-0.5 text-[11px] text-as-ground">
                  {intl.formatMessage(messages.today)}
                </span>
              )}
            </h3>
            <div className="space-y-2">
              {itemsByDay[key].map((item) => (
                <Entry key={item.id} item={item} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

const FilterChip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <PillButton active={active} onClick={onClick} aria-pressed={active}>
    {children}
  </PillButton>
);

/**
 * Ambient release calendar. Same data and filters as the classic calendar,
 * drawn as soft day tiles with an agenda list on phones.
 */
const AmbientCalendar = () => {
  const intl = useIntl();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [types, setTypes] = useState<CalendarItemType[]>([
    'movie',
    'episode',
    'album',
  ]);
  const [myRequestsOnly, setMyRequestsOnly] = useState(false);

  const days = useMemo(() => getMonthGridDays(month), [month]);
  const start = toDateKey(days[0]);
  const end = toDateKey(days[days.length - 1]);

  const { data, error } = useSWR<CalendarResponse>(
    `/api/v1/calendar?start=${start}&end=${end}`
  );

  const hasAlbums = !!data?.results.some((item) => item.type === 'album');

  const itemsByDay = useMemo(() => {
    const grouped: Record<string, CalendarItem[]> = {};

    (data?.results ?? [])
      .filter(
        (item) =>
          types.includes(item.type) && (!myRequestsOnly || item.requestedByMe)
      )
      .forEach((item) => {
        (grouped[item.date] ??= []).push(item);
      });

    return grouped;
  }, [data, types, myRequestsOnly]);

  const toggleType = (type: CalendarItemType) =>
    setTypes((current) =>
      current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type]
    );

  const changeMonth = (offset: number) =>
    setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1));

  const goToToday = () => {
    const now = new Date();
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  return (
    <div className="pb-10">
      <PageTitle title={intl.formatMessage(messages.calendar)} />
      <AmbientPageHeader
        title={intl.formatMessage(messages.calendar)}
        subtitle={intl.formatDate(month, { month: 'long', year: 'numeric' })}
        controls={
          <>
            <RoundIconButton
              label={intl.formatMessage(messages.previousMonth)}
              onClick={() => changeMonth(-1)}
            >
              <ChevronLeftIcon />
            </RoundIconButton>
            <RoundIconButton
              label={intl.formatMessage(messages.nextMonth)}
              onClick={() => changeMonth(1)}
            >
              <ChevronRightIcon />
            </RoundIconButton>
            <PillButton active onClick={goToToday}>
              {intl.formatMessage(messages.today)}
            </PillButton>
          </>
        }
      />
      <div className="-mt-2 mb-6 flex flex-wrap gap-2">
        <FilterChip
          active={types.includes('movie')}
          onClick={() => toggleType('movie')}
        >
          <span className={`h-2 w-2 rounded-full ${typeDot.movie}`} />
          {intl.formatMessage(globalMessages.movies)}
        </FilterChip>
        <FilterChip
          active={types.includes('episode')}
          onClick={() => toggleType('episode')}
        >
          <span className={`h-2 w-2 rounded-full ${typeDot.episode}`} />
          {intl.formatMessage(globalMessages.tvshows)}
        </FilterChip>
        {hasAlbums && (
          <FilterChip
            active={types.includes('album')}
            onClick={() => toggleType('album')}
          >
            <span className={`h-2 w-2 rounded-full ${typeDot.album}`} />
            {intl.formatMessage(messages.music)}
          </FilterChip>
        )}
        <FilterChip
          active={myRequestsOnly}
          onClick={() => setMyRequestsOnly(!myRequestsOnly)}
        >
          {intl.formatMessage(messages.myRequests)}
        </FilterChip>
      </div>
      {!data ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="hidden md:block">
            <MonthGrid month={month} days={days} itemsByDay={itemsByDay} />
          </div>
          <div className="md:hidden">
            <Agenda
              days={days.filter((day) => day.getMonth() === month.getMonth())}
              itemsByDay={itemsByDay}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default AmbientCalendar;
