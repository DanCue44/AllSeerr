// Calendar days are handled as YYYY-MM-DD strings in the local timezone
export const toDateKey = (date: Date): string =>
  [
    date.getFullYear(),
    (date.getMonth() + 1).toString().padStart(2, '0'),
    date.getDate().toString().padStart(2, '0'),
  ].join('-');

export const fromDateKey = (key: string): Date => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/**
 * Returns the 42 days (six full weeks, starting on Sunday) that make up the
 * month grid for the month containing the given date.
 */
export const getMonthGridDays = (month: Date): Date[] => {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = addDays(firstOfMonth, -firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
};
