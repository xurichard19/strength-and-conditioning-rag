import { ApiRequestError } from './errors'
import {
  EQUIPMENT_OPTIONS,
  EXPERIENCE_LEVELS,
  PRIMARY_GOALS,
  SESSION_DURATIONS,
  TRAINING_DAYS,
  type EquipmentAccess,
  type ExperienceLevel,
  type PrimaryGoal,
  type Profile,
  type ProfileAccess,
  type ProfileUpdate,
  type SessionDurationMinutes,
  type TrainingDaysPerWeek,
} from '../types/profile'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

function apiPath(path: string) {
  const baseUrl = API_BASE_URL.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return `${baseUrl}${normalizedPath}`
}

export async function createProfile(accessToken: string): Promise<boolean> {
  const response = await fetch(apiPath('/profile/'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new ApiRequestError('Profile creation failed', response.status)
  }

  return response.json() as Promise<boolean>
}

const PROFILE_STORAGE_PREFIX = 'arcel:onboarding-profile:'

// Temporary frontend adapter. Keep these signatures stable when replacing storage with /profile calls.
const primaryGoalValues = new Set<string>(PRIMARY_GOALS.map((option) => option.value))
const experienceLevelValues = new Set<string>(EXPERIENCE_LEVELS.map((option) => option.value))
const trainingDayValues = new Set<number>(TRAINING_DAYS)
const sessionDurationValues = new Set<number>(SESSION_DURATIONS)
const equipmentValues = new Set<string>(EQUIPMENT_OPTIONS.map((option) => option.value))

function emptyProfile(): Profile {
  return {
    display_name: null,
    primary_goal: null,
    experience_level: null,
    training_days_per_week: null,
    session_duration_minutes: null,
    equipment_access: null,
    onboarding_completed_at: null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPrimaryGoal(value: unknown): value is PrimaryGoal {
  return typeof value === 'string' && primaryGoalValues.has(value)
}

function isExperienceLevel(value: unknown): value is ExperienceLevel {
  return typeof value === 'string' && experienceLevelValues.has(value)
}

function isTrainingDays(value: unknown): value is TrainingDaysPerWeek {
  return typeof value === 'number' && trainingDayValues.has(value)
}

function isSessionDuration(value: unknown): value is SessionDurationMinutes {
  return typeof value === 'number' && sessionDurationValues.has(value)
}

function isEquipmentAccess(value: unknown): value is EquipmentAccess {
  return typeof value === 'string' && equipmentValues.has(value)
}

function normalizeProfile(value: unknown): Profile {
  if (!isRecord(value)) return emptyProfile()

  const displayName = typeof value.display_name === 'string' ? value.display_name.trim() : ''
  const normalizedProfile: Profile = {
    display_name: displayName.length >= 1 && displayName.length <= 60 ? displayName : null,
    primary_goal: isPrimaryGoal(value.primary_goal) ? value.primary_goal : null,
    experience_level: isExperienceLevel(value.experience_level)
      ? value.experience_level
      : null,
    training_days_per_week: isTrainingDays(value.training_days_per_week)
      ? value.training_days_per_week
      : null,
    session_duration_minutes: isSessionDuration(value.session_duration_minutes)
      ? value.session_duration_minutes
      : null,
    equipment_access: isEquipmentAccess(value.equipment_access) ? value.equipment_access : null,
    onboarding_completed_at: null,
  }

  if (
    hasAllOnboardingAnswers(normalizedProfile) &&
    typeof value.onboarding_completed_at === 'string' &&
    !Number.isNaN(Date.parse(value.onboarding_completed_at))
  ) {
    normalizedProfile.onboarding_completed_at = value.onboarding_completed_at
  }

  return normalizedProfile
}

function profileStorageKey(userId: string) {
  return `${PROFILE_STORAGE_PREFIX}${userId}`
}

function readStoredProfile(userId: string): Profile {
  const storedValue = window.localStorage.getItem(profileStorageKey(userId))
  if (!storedValue) return emptyProfile()

  try {
    return normalizeProfile(JSON.parse(storedValue))
  } catch {
    window.localStorage.removeItem(profileStorageKey(userId))
    return emptyProfile()
  }
}

function writeStoredProfile(userId: string, profile: Profile) {
  window.localStorage.setItem(profileStorageKey(userId), JSON.stringify(profile))
}

export function hasAllOnboardingAnswers(profile: Profile): boolean {
  return Boolean(
    profile.display_name &&
      profile.primary_goal &&
      profile.experience_level &&
      profile.training_days_per_week &&
      profile.session_duration_minutes &&
      profile.equipment_access,
  )
}

export async function getProfile(access: ProfileAccess): Promise<Profile> {
  return readStoredProfile(access.userId)
}

export async function updateProfile(
  access: ProfileAccess,
  update: ProfileUpdate,
): Promise<Profile> {
  const updatedFields = Object.keys(update) as Array<keyof ProfileUpdate>
  if (updatedFields.length === 0) {
    throw new Error('Choose an answer before continuing.')
  }

  const currentProfile = readStoredProfile(access.userId)
  const nextProfile = normalizeProfile({ ...currentProfile, ...update })

  for (const field of updatedFields) {
    if (update[field] === null || nextProfile[field] === null) {
      throw new Error('That answer is not valid. Please review it and try again.')
    }
  }

  writeStoredProfile(access.userId, nextProfile)
  return nextProfile
}

export async function completeOnboarding(access: ProfileAccess): Promise<Profile> {
  const currentProfile = readStoredProfile(access.userId)
  if (!hasAllOnboardingAnswers(currentProfile)) {
    throw new Error('Complete every onboarding question before continuing.')
  }

  const completedProfile: Profile = {
    ...currentProfile,
    onboarding_completed_at: new Date().toISOString(),
  }
  writeStoredProfile(access.userId, completedProfile)
  return completedProfile
}
