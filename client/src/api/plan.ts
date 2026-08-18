import type { PlannedWorkoutPlan } from '../types/workouts'
import { apiJson } from './client'

export type PlanRequest = {
  goal: string
  additional_context?: string
}

type PlanResponse = {
  plan: PlannedWorkoutPlan
}

type SavePlanRequest = {
  plan: PlannedWorkoutPlan
}

type SavePlanResponse = {
  saved: boolean
}

export async function submitPlan(
  request: PlanRequest,
  accessToken?: string,
): Promise<PlannedWorkoutPlan> {
  const response = await apiJson<PlanResponse>('/plan/generate', {
    method: 'POST',
    accessToken,
    body: JSON.stringify(request),
  }, 'Plan request failed')
  return response.plan
}

export async function savePlan(
  plan: PlannedWorkoutPlan,
  accessToken?: string,
): Promise<boolean> {
  const request: SavePlanRequest = { plan }
  const response = await apiJson<SavePlanResponse>('/plan/', {
    method: 'POST',
    accessToken,
    body: JSON.stringify(request),
  }, 'Plan save failed')
  return response.saved
}

export async function fetchSavedPlan(accessToken?: string): Promise<PlannedWorkoutPlan> {
  const response = await apiJson<PlanResponse>('/plan/', { accessToken }, 'Plan load failed')
  return response.plan
}
