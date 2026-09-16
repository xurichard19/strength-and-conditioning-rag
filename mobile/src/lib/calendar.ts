// Calendar arithmetic uses local noon and date parts, never UTC conversion.
const atNoon = (date: string) => new Date(`${date}T12:00:00`);
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function shiftDays(date: string, days: number) {
  const result = atNoon(date);
  result.setDate(result.getDate() + days);
  return dateKey(result);
}

/** Move a month, keeping the selected day where possible and clamping at month end. */
export function shiftMonth(date: string, months: number) {
  const current = atNoon(date);
  const result = new Date(current.getFullYear(), current.getMonth() + months, 1, 12);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0, 12).getDate();
  result.setDate(Math.min(current.getDate(), lastDay));
  return dateKey(result);
}

export function weekDates(date: string) {
  const start = shiftDays(date, -atNoon(date).getDay());
  return Array.from({ length: 7 }, (_, index) => shiftDays(start, index));
}

/** Six Sunday-first rows keep the calendar height stable between months. */
export function monthDates(date: string) {
  const month = date.slice(0, 7);
  const start = weekDates(`${month}-01`)[0];
  return Array.from({ length: 42 }, (_, index) => {
    const day = shiftDays(start, index);
    return { date: day, inMonth: day.startsWith(month) };
  });
}

export function calendarLabel(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', options).format(atNoon(date));
}
