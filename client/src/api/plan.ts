import type { PlanResponse } from '../types'

import { ApiRequestError } from './errors'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export type PlanRequest = {
  goal: string
  additional_context?: string
}

function apiPath(path: string) {
  const baseUrl = API_BASE_URL.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return `${baseUrl}${normalizedPath}`
}

export async function submitPlan(
  request: PlanRequest,
  accessToken?: string,
): Promise<PlanResponse> {
  const response = await fetch(apiPath('/plan/generate'), {
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

export async function savePlan(
  plan: PlanResponse,
  accessToken?: string,
): Promise<boolean> {
  const response = await fetch(apiPath('/plan/'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(plan),
  })

  if (!response.ok) {
    throw new ApiRequestError('Plan save failed', response.status)
  }

  return response.json() as Promise<boolean>
}

export async function fetchSavedPlan(accessToken?: string): Promise<PlanResponse> {
  const response = await fetch(apiPath('/plan/'), {
    method: 'GET',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  })

  if (!response.ok) {
    throw new ApiRequestError('Plan load failed', response.status)
  }

  return response.json() as Promise<PlanResponse>
}
