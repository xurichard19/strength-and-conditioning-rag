export const SESSION_MINUTES_MIN = 15;
export const SESSION_MINUTES_MAX = 120;
export const SESSION_DURATIONS = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 105, 120];

export function sessionDurationAtIndex(index: number): number {
  return SESSION_DURATIONS[Math.max(0, Math.min(SESSION_DURATIONS.length - 1, Math.round(index)))] ?? 45;
}

export function normalizeSessionMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 45;
  return SESSION_DURATIONS.reduce((nearest, value) => Math.abs(value - minutes) <= Math.abs(nearest - minutes) ? value : nearest);
}

export function formatSessionDuration(minutes: number): string {
  if (minutes >= SESSION_MINUTES_MAX) return '2 hours+';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}${remainder ? ` ${remainder} min` : ''}`;
}
