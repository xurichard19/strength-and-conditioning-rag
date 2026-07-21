import type { PlanResponse } from '../types'
import { apiJson } from './client'

export type PlanRequest = {
  goal: string
  additional_context?: string
}

export async function submitPlan(
  request: PlanRequest,
  accessToken?: string,
): Promise<PlanResponse> {
  return apiJson('/plan/generate', {
    method: 'POST',
    accessToken,
    body: JSON.stringify(request),
  }, 'Plan request failed')
}

export async function savePlan(
  plan: PlanResponse,
  accessToken?: string,
): Promise<boolean> {
  return apiJson('/plan/', {
    method: 'POST',
    accessToken,
    body: JSON.stringify(plan),
  }, 'Plan save failed')
}

export async function fetchSavedPlan(accessToken?: string): Promise<PlanResponse> {
  return apiJson('/plan/', { accessToken }, 'Plan load failed')
}
