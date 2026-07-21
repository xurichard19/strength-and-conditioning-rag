export const PRIMARY_GOALS = [
  {
    value: 'balanced_hybrid',
    label: 'Balanced hybrid performance',
    description: 'Develop strength and endurance together.',
  },
  {
    value: 'strength',
    label: 'Build strength',
    description: 'Prioritize force, power, and lifting performance.',
  },
  {
    value: 'endurance',
    label: 'Build endurance',
    description: 'Improve your ability to sustain longer efforts.',
  },
  {
    value: 'conditioning',
    label: 'Improve conditioning',
    description: 'Build work capacity across varied intensities.',
  },
  {
    value: 'event_preparation',
    label: 'Prepare for an event',
    description: 'Organize training around a defined performance date.',
  },
  {
    value: 'general_fitness',
    label: 'General health and fitness',
    description: 'Create a sustainable, well-rounded routine.',
  },
] as const

export const EXPERIENCE_LEVELS = [
  {
    value: 'new',
    label: 'New',
    description: 'Less than one year of structured training.',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'One to three years of structured training.',
  },
  {
    value: 'experienced',
    label: 'Experienced',
    description: 'More than three years of structured training.',
  },
] as const

const TRAINING_DAYS = [2, 3, 4, 5, 6, 7] as const
const SESSION_DURATIONS = [30, 45, 60, 75, 90] as const
export const TRAINING_DAY_OPTIONS = TRAINING_DAYS.map((value) => ({ value, label: `${value} days` }))
export const SESSION_DURATION_OPTIONS = SESSION_DURATIONS.map((value) => ({
  value,
  label: value === 90 ? '90+ minutes' : `${value} minutes`,
}))

export const EQUIPMENT_OPTIONS = [
  {
    value: 'full_gym',
    label: 'Full gym',
    description: 'Barbells, machines, cardio equipment, and open space.',
  },
  {
    value: 'home_gym',
    label: 'Home gym',
    description: 'A rack, weights, and a focused training setup.',
  },
  {
    value: 'minimal_equipment',
    label: 'Minimal equipment',
    description: 'A few dumbbells, kettlebells, or resistance bands.',
  },
  {
    value: 'bodyweight_only',
    label: 'Bodyweight only',
    description: 'No regular equipment access required.',
  },
] as const

export type PrimaryGoal = (typeof PRIMARY_GOALS)[number]['value']
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]['value']
export type TrainingDaysPerWeek = (typeof TRAINING_DAYS)[number]
export type SessionDurationMinutes = (typeof SESSION_DURATIONS)[number]
export type EquipmentAccess = (typeof EQUIPMENT_OPTIONS)[number]['value']

export type OnboardingAnswers = {
  display_name: string | null
  primary_goal: PrimaryGoal | null
  experience_level: ExperienceLevel | null
  training_days_per_week: TrainingDaysPerWeek | null
  session_duration_minutes: SessionDurationMinutes | null
  equipment_access: EquipmentAccess | null
}

export type Profile = OnboardingAnswers & {
  onboarding_completed_at: string | null
}

export type ProfileUpdate = Partial<OnboardingAnswers>

export type ProfileAccess = {
  userId: string
  accessToken: string
}

