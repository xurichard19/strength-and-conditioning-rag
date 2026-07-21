import type { Profile, ProfileAccess, ProfileUpdate } from '../types/profile'
import { apiJson } from './client'

export async function createProfile(accessToken: string): Promise<boolean> {
  return apiJson('/profile/', {
    method: 'POST',
    accessToken,
  }, 'Profile creation failed')
}

async function profileRequest(
  access: ProfileAccess,
  path: string,
  method: 'GET' | 'PATCH' | 'POST',
  fallbackMessage: string,
  body?: ProfileUpdate,
): Promise<Profile> {
  return apiJson(path, {
    method,
    cache: 'no-store',
    accessToken: access.accessToken,
    ...(body ? { body: JSON.stringify(body) } : {}),
  }, fallbackMessage)
}

export async function getProfile(access: ProfileAccess): Promise<Profile> {
  const profile = await profileRequest(
    access,
    '/profile/',
    'GET',
    'Could not load your profile. Please try again.',
  )

  try {
    window.localStorage.removeItem(`arcel:onboarding-profile:${access.userId}`)
  } catch {
    // Legacy cleanup should never prevent a successful server profile load.
  }

  return profile
}

export async function updateProfile(
  access: ProfileAccess,
  update: ProfileUpdate,
): Promise<Profile> {
  return profileRequest(
    access,
    '/profile/',
    'PATCH',
    'Could not save that answer. Please try again.',
    update,
  )
}

export async function completeOnboarding(access: ProfileAccess): Promise<Profile> {
  return profileRequest(
    access,
    '/profile/onboarding/complete',
    'POST',
    'Could not finish onboarding. Please try again.',
  )
}
