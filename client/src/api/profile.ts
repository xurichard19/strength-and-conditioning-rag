import { ApiRequestError } from './errors'

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
