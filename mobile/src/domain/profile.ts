import type { Profile } from './types';

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
