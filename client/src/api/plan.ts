import type { PlannedWorkoutPlan, SavedPlan } from '../types/workouts'
import { apiJson } from './client'

export type PlanRequest = {
  goal: string
  additional_context?: string
}

// TODO(frontend-audit): remove this legacy conversion with SavedPlan support
function legacyReps(exercise: PlannedWorkoutPlan['workouts'][number]['exercises'][number]) {
  const reps = exercise.sets.map((set) => set.reps)
  if (!reps.some((value) => value != null)) return null

  const first = reps[0]
  return reps.every((value) => value === first)
    ? first
    : reps.map((value) => value ?? '-').join('/')
}

export async function submitPlan(
  request: PlanRequest,
  accessToken?: string,
): Promise<PlannedWorkoutPlan> {
  return apiJson('/plan/generate', {
    method: 'POST',
    accessToken,
    body: JSON.stringify(request),
  }, 'Plan request failed')
}

export async function savePlan(
  plan: PlannedWorkoutPlan,
  accessToken?: string,
): Promise<boolean> {
  // TODO(frontend-audit): remove this adapter when saved plans use tracked workouts
  const savedPlan: SavedPlan = {
    workouts: plan.workouts.map((workout) => ({
      exercises: workout.exercises.map((exercise) => ({
        date: workout.scheduled_date,
        name: exercise.name,
        sets: exercise.sets.length || null,
        reps: legacyReps(exercise),
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
