import type { SavedPlan, WorkoutPlan } from '../types'
import { apiJson } from './client'

export type PlanRequest = {
  goal: string
  additional_context?: string
}

export async function submitPlan(
  request: PlanRequest,
  accessToken?: string,
): Promise<WorkoutPlan> {
  return apiJson('/plan/generate', {
    method: 'POST',
    accessToken,
    body: JSON.stringify(request),
  }, 'Plan request failed')
}

export async function savePlan(
  plan: WorkoutPlan,
  accessToken?: string,
): Promise<boolean> {
  // temporary adapter until supabase and the saved-plan endpoints use WorkoutPlan
  const savedPlan: SavedPlan = {
    workouts: plan.workouts.map((workout) => ({
      exercises: workout.exercises.map((exercise) => ({
        date: workout.scheduled_date,
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.reps,
        notes: exercise.notes,
      })),
    })),
  }

  return apiJson('/plan/', {
    method: 'POST',
    accessToken,
    body: JSON.stringify(savedPlan),
  }, 'Plan save failed')
}

export async function fetchSavedPlan(accessToken?: string): Promise<SavedPlan> {
  return apiJson('/plan/', { accessToken }, 'Plan load failed')
}
