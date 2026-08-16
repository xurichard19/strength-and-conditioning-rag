import type { SavedPlan } from '../types'
import { getCachedQuery, invalidateCachedQueries } from '../lib/queryCache'
import { fetchSavedPlan } from './plan'

const workoutCacheStaleTimeMs = 5 * 60 * 1000

function workoutQueryPrefix(userId: string) {
  return `workouts:${userId}:`
}

export function fetchCachedSavedPlan(
  userId: string,
  accessToken: string,
): Promise<SavedPlan> {
  return getCachedQuery(
    `${workoutQueryPrefix(userId)}all`,
    () => fetchSavedPlan(accessToken),
    workoutCacheStaleTimeMs,
  )
}

export function invalidateWorkoutQueries(userId: string) {
  invalidateCachedQueries(workoutQueryPrefix(userId))
}
