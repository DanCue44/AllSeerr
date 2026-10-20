import AmbientCalendar from '@app/components/Allseerr/Calendar';
import Calendar from '@app/components/Calendar';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import type { NextPage } from 'next';

const CalendarPage: NextPage = () => {
  const [interfaceStyle] = useInterfaceStyle();

  return interfaceStyle === 'ambient' ? <AmbientCalendar /> : <Calendar />;
};

export default CalendarPage;
