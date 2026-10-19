import type { CalendarResponse, CalendarWorkout, SportsWorkout } from '../services/backend';

export type CalendarEntry = {
  id: string; kind: 'workout' | 'sport'; date: string; title: string; notes: string | null;
  status: CalendarWorkout['status'] | SportsWorkout['status'];
  startTime?: string | null; minutes?: number | null; intensity?: SportsWorkout['intensity'];
  exercises?: { id: string; name: string; notes: string | null; prescriptions: string[] }[];
};
export type CalendarSnapshot = { entries: CalendarEntry[]; revision: number | null };

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

/** Request seven local dates or the actual calendar month, never its adjacent-month padding. */
export function calendarRange(date: string, view: 'week' | 'month'): [string, string] {
  if (view === 'week') {
    const days = weekDates(date);
    return [days[0], days[6]];
  }
  const start = `${date.slice(0, 7)}-01`;
  return [start, shiftDays(shiftMonth(start, 1), -1)];
}

const duration = (seconds: number) => seconds < 60 ? `${seconds}s`
  : `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${seconds % 60}s` : ''}`;

/** Group consecutive identical sets without hiding varied targets, units, or instructions. */
function prescriptions(exercise: CalendarWorkout['exercises'][number]) {
  const groups: { target: string; first: number; last: number }[] = [];
  for (const [index, set] of (exercise.sets ?? []).entries()) {
    const target = [
      set.planned_reps == null ? null : `${set.planned_reps} ${set.planned_reps === 1 ? 'rep' : 'reps'}${exercise.reps_per_side ? ' / side' : ''}`,
      set.planned_weight == null ? null : `${set.planned_weight}${exercise.weight_unit ? ` ${exercise.weight_unit}` : ''}`,
      set.planned_distance == null ? null : `${set.planned_distance}${exercise.distance_unit ? ` ${exercise.distance_unit}` : ''}`,
      set.planned_duration_seconds == null ? null : duration(set.planned_duration_seconds),
      set.planned_rpe == null ? null : `RPE ${set.planned_rpe}`,
      set.planned_rest_seconds == null ? null : `${duration(set.planned_rest_seconds)} rest`,
      set.planned_notes,
    ].filter(Boolean).join(' · ') || 'Target not specified';
    const last = groups.at(-1);
    if (last?.target === target) last.last = index + 1;
    else groups.push({ target, first: index + 1, last: index + 1 });
  }
  return groups.map(({ target, first, last }) => `${first === last ? `Set ${first}` : `Sets ${first}–${last}`} · ${target}`);
}

/** Retain display-ready prescriptions, excluding set results and database metadata. */
export function calendarSnapshot(response: CalendarResponse): CalendarSnapshot {
  const workouts: CalendarEntry[] = response.workouts.filter(row => !row.superseded_at).map(row => ({
    id: row.id, kind: 'workout', date: row.scheduled_date, title: row.name,
    status: row.status, notes: row.notes, exercises: row.exercises.map(exercise => ({
      id: exercise.id, name: exercise.name, notes: exercise.notes ?? null, prescriptions: prescriptions(exercise),
    })),
  }));
  const sports: CalendarEntry[] = response.sports_workouts.filter(row => row.status !== 'cancelled').map(row => ({
    id: row.id, kind: 'sport', date: row.scheduled_date, title: row.sport.charAt(0).toUpperCase() + row.sport.slice(1),
    status: row.status, notes: row.notes, startTime: row.start_time, minutes: row.planned_duration_minutes, intensity: row.intensity,
  }));
  return { entries: [...workouts, ...sports].sort((a, b) => a.date.localeCompare(b.date)
    || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)),
  revision: response.revision };
}

/** Include only Sunday-first weeks that contain at least one day of this month. */
export function monthDates(date: string) {
  const month = date.slice(0, 7);
  const first = atNoon(`${month}-01`);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
  const length = Math.ceil((first.getDay() + daysInMonth) / 7) * 7;
  const start = shiftDays(`${month}-01`, -first.getDay());
  return Array.from({ length }, (_, index) => {
    const day = shiftDays(start, index);
    return { date: day, inMonth: day.startsWith(month) };
  });
}

export function calendarLabel(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', options).format(atNoon(date));
}

/** Display the saved wall-clock time without treating it as UTC or shifting timezones. */
export function calendarTime(time: string | null | undefined) {
  if (!time) return null;
  const hour = Number(time.slice(0, 2));
  return `${hour % 12 || 12}:${time.slice(3, 5)} ${hour < 12 ? 'AM' : 'PM'}`;
}
