import type { Profile } from '../domain/types';
import { surveyAnswers, type Answers } from '../services/backend';
import { sportOptions } from './sports-workout';
import { normalizeSessionMinutes } from './session-duration';

export const ONBOARDING_VERSION = 2;
export const TRAINING_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const SPORTS = sportOptions.map(option => option.label);
export const QUESTION_IDS = ['sport', 'sportGoal', 'balance', 'trainingDays', 'minutes', 'venue', 'lifts14', 'notes'] as const;
export type QuestionId = typeof QUESTION_IDS[number];
const BALANCES = ['only-lifting', 'lifting', 'both', 'cardio', 'only-cardio'] as const;
export type Balance = typeof BALANCES[number];
export const BALANCE_STEP = 25;
export type Venue = 'gym' | 'home' | 'dumbbells' | 'none';
export type OnboardingDraft = {
  sport: string;
  sportGoal: string;
  balance: Balance;
  trainingDays: string[];
  sessionMinutes: number;
  venue: Venue;
  lifts14: number | null;
  notes: string[];
};

export const BALANCE_LABELS: Record<Balance, string> = {
  'only-lifting': 'Only lifting', lifting: 'Mostly lifting', both: 'An even mix', cardio: 'Mostly cardio', 'only-cardio': 'Only cardio',
};
export const VENUE_LABELS: Record<Venue, string> = {
  gym: 'A full gym', home: 'A setup at home', dumbbells: 'A couple of dumbbells', none: 'Nothing but me',
};
const GOALS: Record<Balance, string> = {
  'only-lifting': 'Only lifting', lifting: 'Mostly strength', both: 'Strong and fit', cardio: 'Mostly cardio', 'only-cardio': 'Only cardio',
};
const EQUIPMENT: Record<Venue, string> = { gym: 'Full gym', home: 'Home setup', dumbbells: 'Dumbbells', none: 'Bodyweight' };

export function balanceFromValue(value: number): Balance {
  return BALANCES[Math.round(Math.max(0, Math.min(100, value)) / BALANCE_STEP)] ?? 'both';
}

export function balanceValue(balance: Balance): number {
  return BALANCES.indexOf(balance) * BALANCE_STEP;
}

/** Opening setup is read-only. Legacy completion remains valid until the user chooses to save. */
export function onboardingDraft(profile: Profile, answers: Answers): OnboardingDraft {
  const balance = BALANCES.find(value => value === answers.balance)
    ?? BALANCES.find(value => GOALS[value] === profile.goal) ?? 'both';
  const venue = ['gym', 'home', 'dumbbells', 'none'].includes(String(answers.venue))
    ? answers.venue as Venue : profile.equipment === 'Dumbbells' ? 'dumbbells' : profile.equipment === 'Bodyweight' ? 'none' : profile.equipment === 'Home setup' ? 'home' : 'gym';
  return {
    sport: typeof answers.sport === 'string' ? answers.sport : '',
    sportGoal: typeof answers.sportGoal === 'string' ? answers.sportGoal : '',
    balance,
    trainingDays: TRAINING_DAYS.filter(day => profile.trainingDays.includes(day)),
    sessionMinutes: normalizeSessionMinutes(profile.sessionMinutes),
    venue,
    // The old experience bands do not tell us an exact fortnight count.
    lifts14: typeof answers.lifts14 === 'number' && Number.isInteger(answers.lifts14) && answers.lifts14 >= 0
      ? Math.min(6, answers.lifts14) : profile.onboardingComplete ? null : 2,
    notes: Array.isArray(answers.notes)
      ? answers.notes.filter((note): note is string => typeof note === 'string' && Boolean(note.trim()))
      : typeof answers.note === 'string' && answers.note.trim() ? [answers.note.trim()] : [],
  };
}

export function questionError(question: QuestionId, draft: OnboardingDraft): string | null {
  if (question === 'sport' && !SPORTS.includes(draft.sport)) return 'Choose a sport to continue.';
  if (question === 'trainingDays' && !draft.trainingDays.length) return 'Choose at least one day to continue.';
  if (question === 'lifts14' && draft.lifts14 === null) return 'Choose how many times you lifted to continue.';
  return null;
}

/** Save the questions actually asked in v2, with compatible fields for the existing profile. */
export function onboardingSubmission(profile: Profile, draft: OnboardingDraft, pendingNote = '') {
  const trainingDays = TRAINING_DAYS.filter(day => draft.trainingDays.includes(day));
  const notes = [...draft.notes.map(note => note.trim()).filter(Boolean), ...(pendingNote.trim() ? [pendingNote.trim()] : [])];
  const nextProfile: Profile = {
    ...profile, goal: GOALS[draft.balance], trainingDays, daysPerWeek: trainingDays.length,
    sessionMinutes: draft.sessionMinutes, equipment: EQUIPMENT[draft.venue],
    experienceLevel: draft.lifts14 === null ? profile.experienceLevel : draft.lifts14 < 2 ? 'new' : draft.lifts14 < 6 ? 'intermediate' : 'experienced',
  };
  const answers = surveyAnswers(nextProfile, {
    onboardingVersion: ONBOARDING_VERSION, sport: draft.sport.trim(), sportGoal: draft.sportGoal.trim(),
    balance: draft.balance, venue: draft.venue, lifts14: draft.lifts14, notes,
  });
  return { profile: nextProfile, answers };
}
