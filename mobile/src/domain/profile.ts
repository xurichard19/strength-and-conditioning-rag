import type { Profile } from './types';

/** Initial account form values, before saved profile and onboarding data load. */
export const defaultProfile: Profile = {
  displayName: '',
  goal: 'Strong and fit',
  experienceLevel: 'intermediate',
  trainingDays: ['Mon', 'Tue', 'Thu', 'Sat'],
  daysPerWeek: 4,
  sessionMinutes: 45,
  equipment: 'Full gym',
  cardio: 'Running',
  theme: 'system',
  onboardingComplete: false,
};
