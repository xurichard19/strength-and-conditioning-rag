export function formatDay(dateString: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(`${dateString}T12:00:00`));
}

export function isToday(dateString: string) {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return dateString === local;
}

export function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function rangeAroundToday(before = 7, after = 14) {
  const start = new Date();
  start.setDate(start.getDate() - before);
  const end = new Date();
  end.setDate(end.getDate() + after);
  const toLocalIso = (value: Date) =>
    new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return { start: toLocalIso(start), end: toLocalIso(end) };
}
