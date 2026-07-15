import { ApiRequestError } from './errors'
import type { Profile, ProfileAccess, ProfileUpdate } from '../types/profile'

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

type FastApiErrorBody = {
  detail?: unknown
}

function profileStorageKey(userId: string) {
  return `${PROFILE_STORAGE_PREFIX}${userId}`
}

function validationDetail(detail: unknown): string | null {
  if (!Array.isArray(detail)) return null

  for (const issue of detail) {
    if (typeof issue !== 'object' || issue === null || !('msg' in issue)) continue
    const message = issue.msg
    if (typeof message !== 'string' || !message.trim()) continue
    return message.replace(/^Value error,\s*/i, '')
  }

  return null
}

async function responseError(response: Response, fallbackMessage: string): Promise<ApiRequestError> {
  let message = fallbackMessage

  try {
    const body = (await response.json()) as FastApiErrorBody
    if (typeof body.detail === 'string' && body.detail.trim()) {
      message = body.detail
    } else {
      message = validationDetail(body.detail) ?? fallbackMessage
    }
  } catch {
    // Use the safe fallback when the server does not return FastAPI JSON.
  }

  return new ApiRequestError(message, response.status)
}

async function profileRequest(
  access: ProfileAccess,
  path: string,
  method: 'GET' | 'PATCH' | 'POST',
  fallbackMessage: string,
  body?: ProfileUpdate,
): Promise<Profile> {
  const response = await fetch(apiPath(path), {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${access.accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (!response.ok) {
    throw await responseError(response, fallbackMessage)
  }

  return response.json() as Promise<Profile>
}

export async function getProfile(access: ProfileAccess): Promise<Profile> {
  const profile = await profileRequest(
    access,
    '/profile/',
    'GET',
    'Could not load your profile. Please try again.',
  )

  try {
    window.localStorage.removeItem(profileStorageKey(access.userId))
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
