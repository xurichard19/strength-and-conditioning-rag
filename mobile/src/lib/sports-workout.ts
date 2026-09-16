import type { SportsWorkoutInput } from '@/services/backend';

export const sportOptions = ['Boxing', 'Running', 'Swimming', 'Tennis', 'Basketball', 'Football']
  .map(label => ({ label, value: label.toLowerCase() }));
export const intensityOptions = ['Easy', 'Moderate', 'Hard', 'Variable']
  .map(label => ({ label, value: label.toLowerCase() }));
export const startTimeOptions = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 ? '30' : '00';
  return { value: `${String(hour).padStart(2, '0')}:${minute}`, label: `${hour % 12 || 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}` };
});
export const durationOptions = Array.from({ length: 36 }, (_, index) => {
  const minutes = (index + 1) * 5;
  return { value: String(minutes), label: `${minutes} min` };
});

/** Reject missing/invalid route dates instead of silently saving a workout on another day. */
export function validScheduledDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return date.getFullYear() === Number(value.slice(0, 4))
    && date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8, 10));
}

/** Keep date/time local and send only editable fields; the backend supplies ownership/status. */
export function sportsWorkoutInput(date: string, sport: string, startTime: string, duration: string, intensity: string, notes: string): SportsWorkoutInput {
  if (!validScheduledDate(date)) throw new Error('Select a valid day from the calendar.');
  for (const [value, options] of [[sport, sportOptions], [startTime, startTimeOptions], [duration, durationOptions], [intensity, intensityOptions]] as const) {
    if (!options.some(option => option.value === value)) throw new Error('Choose a valid value for each workout field.');
  }
  return { sport, scheduled_date: date, start_time: `${startTime}:00`, planned_duration_minutes: Number(duration),
    intensity: intensity as SportsWorkoutInput['intensity'], notes: notes.trim() || null };
}
