export type Source = {
    id?: string | number | null
    source?: string | null
    page?: string | number | null
    text: string
}

export type Exercise = {
    date: string
    name: string
    reps?: number | string | null
    sets?: number | null
    notes?: string | null
}

export type Workout = {
    exercises: Exercise[]
}

export type PlanResponse = {
    workouts: Workout[]
}
