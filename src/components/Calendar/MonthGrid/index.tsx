import CalendarEntry from '@app/components/Calendar/CalendarEntry';
import { toDateKey } from '@app/utils/calendarHelpers';
import type { CalendarItem } from '@server/interfaces/api/calendarInterfaces';
import { useIntl } from 'react-intl';

interface MonthGridProps {
  month: Date;
  days: Date[];
  itemsByDay: Record<string, CalendarItem[]>;
}

const MonthGrid = ({ month, days, itemsByDay }: MonthGridProps) => {
  const intl = useIntl();
  const todayKey = toDateKey(new Date());

  return (
    <div className="overflow-hidden rounded-lg border border-gray-700">
      <div className="grid grid-cols-7 border-b border-gray-700 bg-gray-800">
        {days.slice(0, 7).map((day) => (
          <div
            key={`weekday-${day.getDay()}`}
            className="px-2 py-2 text-center text-sm font-semibold text-gray-300"
          >
            {intl.formatDate(day, { weekday: 'short' })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = toDateKey(day);
          const isCurrentMonth = day.getMonth() === month.getMonth();
          const isToday = key === todayKey;

          return (
            <div
              key={key}
              className={`min-h-[8rem] border-b border-r border-gray-700 p-1 [&:nth-child(7n)]:border-r-0 ${
                isCurrentMonth ? 'bg-gray-900' : 'bg-gray-900/40'
              }`}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                    isToday
                      ? 'bg-indigo-600 font-bold text-white'
                      : isCurrentMonth
                        ? 'text-gray-300'
                        : 'text-gray-600'
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="space-y-1">
                {(itemsByDay[key] ?? []).map((item) => (
                  <CalendarEntry key={item.id} item={item} compact />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthGrid;
