import type { PlanResponse } from '../types'

import { QueryRequestError } from './query'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

type PlanRequest = {
  experienceLevel: string
  goal: string
  constraints: string
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
  const response = await fetch(apiPath('/plan/create'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      experience_level: request.experienceLevel,
      goal: request.goal,
      constraints: request.constraints,
    }),
  })

  if (!response.ok) {
    throw new QueryRequestError('Plan request failed', response.status)
  }

  return response.json() as Promise<PlanResponse>
}
