import type { Workout } from "../types"

const latestPlanWorkoutsKey = "shingo:latest-plan-workouts"

export function saveLatestPlanWorkouts(workouts: Workout[]) {
    window.localStorage.setItem(latestPlanWorkoutsKey, JSON.stringify(workouts))
}

export function getLatestPlanWorkouts(): Workout[] {
    const storedWorkouts = window.localStorage.getItem(latestPlanWorkoutsKey)

    if (!storedWorkouts) {
        return []
    }

    try {
        const parsedWorkouts = JSON.parse(storedWorkouts)

        if (!Array.isArray(parsedWorkouts)) {
            return []
        }

        return parsedWorkouts as Workout[]
    } catch {
        return []
    }
}
