import Agenda from '@app/components/Calendar/Agenda';
import MonthGrid from '@app/components/Calendar/MonthGrid';
import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import { getMonthGridDays, toDateKey } from '@app/utils/calendarHelpers';
import defineMessages from '@app/utils/defineMessages';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import type {
  CalendarItem,
  CalendarItemType,
  CalendarResponse,
} from '@server/interfaces/api/calendarInterfaces';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Calendar', {
  calendar: 'Calendar',
  today: 'Today',
  previousMonth: 'Previous Month',
  nextMonth: 'Next Month',
  music: 'Music',
  myRequests: 'My Requests',
});

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const FilterChip = ({ active, onClick, children }: FilterChipProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`rounded-full border px-3 py-1 text-sm font-medium transition duration-150 ease-in-out focus:outline-none ${
      active
        ? 'border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-500'
        : 'border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700'
    }`}
  >
    {children}
  </button>
);

const Calendar = () => {
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
    <>
      <PageTitle title={intl.formatMessage(messages.calendar)} />
      <div className="mb-4 flex flex-col justify-between lg:flex-row lg:items-end">
        <Header>{intl.formatMessage(messages.calendar)}</Header>
        <div className="mt-2 flex items-center space-x-2">
          <Button
            buttonSize="md"
            onClick={() => changeMonth(-1)}
            aria-label={intl.formatMessage(messages.previousMonth)}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-[10rem] text-center text-lg font-semibold text-white">
            {intl.formatDate(month, { month: 'long', year: 'numeric' })}
          </span>
          <Button
            buttonSize="md"
            onClick={() => changeMonth(1)}
            aria-label={intl.formatMessage(messages.nextMonth)}
          >
            <ChevronRightIcon />
          </Button>
          <Button buttonType="primary" buttonSize="md" onClick={goToToday}>
            {intl.formatMessage(messages.today)}
          </Button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip
          active={types.includes('movie')}
          onClick={() => toggleType('movie')}
        >
          {intl.formatMessage(globalMessages.movies)}
        </FilterChip>
        <FilterChip
          active={types.includes('episode')}
          onClick={() => toggleType('episode')}
        >
          {intl.formatMessage(globalMessages.tvshows)}
        </FilterChip>
        {hasAlbums && (
          <FilterChip
            active={types.includes('album')}
            onClick={() => toggleType('album')}
          >
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
    </>
  );
};

export default Calendar;
