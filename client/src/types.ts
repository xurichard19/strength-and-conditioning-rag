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

export type SavedPlan = {
    workouts: Workout[]
}

export type PlannedExercise = {
    name: string
    sets?: number | null
    reps?: number | null
    reps_per_side: boolean
    weight?: number | null
    weight_unit?: 'kg' | 'lb' | null
    distance?: number | null
    distance_unit?: 'm' | 'km' | 'mi' | null
    duration_minutes?: number | null
    target_rpe?: number | null
    rest_seconds?: number | null
    notes?: string | null
}

export type PlannedWorkout = {
    name: string
    scheduled_date: string
    exercises: PlannedExercise[]
}

export type WorkoutPlan = {
    workouts: PlannedWorkout[]
    notes?: string | null
}
