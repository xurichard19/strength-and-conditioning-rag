export type Source = {
    title?: string | null
    doi?: string | null
    url?: string | null
    source_type: 'research' | 'web'
    content: string
    score?: number | null
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
