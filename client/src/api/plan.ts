import type { PlanResponse } from '../types'

import { ApiRequestError } from './errors'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export type PlanRequest = {
  goal: string
} & Record<string, unknown>

function apiPath(path: string) {
  const baseUrl = API_BASE_URL.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return `${baseUrl}${normalizedPath}`
}

export async function submitPlan(
  request: PlanRequest,
  accessToken?: string,
): Promise<PlanResponse> {
  const response = await fetch(apiPath('/plan/create'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new ApiRequestError('Plan request failed', response.status)
  }

  return response.json() as Promise<PlanResponse>
}
