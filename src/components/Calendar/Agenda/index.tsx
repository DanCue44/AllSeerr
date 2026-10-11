import CalendarEntry from '@app/components/Calendar/CalendarEntry';
import { toDateKey } from '@app/utils/calendarHelpers';
import defineMessages from '@app/utils/defineMessages';
import type { CalendarItem } from '@server/interfaces/api/calendarInterfaces';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Calendar.Agenda', {
  today: 'Today',
  noReleases: 'No upcoming releases this month.',
});

interface AgendaProps {
  days: Date[];
  itemsByDay: Record<string, CalendarItem[]>;
}

const Agenda = ({ days, itemsByDay }: AgendaProps) => {
  const intl = useIntl();
  const todayKey = toDateKey(new Date());
  const daysWithItems = days.filter(
    (day) => (itemsByDay[toDateKey(day)] ?? []).length > 0
  );

  if (daysWithItems.length === 0) {
    return (
      <div className="mt-8 text-center text-gray-400">
        {intl.formatMessage(messages.noReleases)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {daysWithItems.map((day) => {
        const key = toDateKey(day);

        return (
          <section key={key}>
            <h3
              className={`mb-2 text-sm font-semibold uppercase tracking-wide ${
                key === todayKey ? 'text-indigo-400' : 'text-gray-400'
              }`}
            >
              {intl.formatDate(day, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
              {key === todayKey && ` - ${intl.formatMessage(messages.today)}`}
            </h3>
            <div className="space-y-2">
              {itemsByDay[key].map((item) => (
                <CalendarEntry key={item.id} item={item} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default Agenda;
