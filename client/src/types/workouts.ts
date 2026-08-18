// TODO(frontend-audit): remove these legacy saved-plan types after the plan
// endpoints and supabase tables return the planned/completed workout contracts
export type SavedExercise = {
  date: string
  name: string
  reps?: number | string | null
  sets?: number | null
  notes?: string | null
}

export type SavedWorkout = {
  exercises: SavedExercise[]
}

export type SavedPlan = {
  workouts: SavedWorkout[]
}

export type PlannedExerciseSet = {
  reps?: number | null
  weight?: number | null
  distance?: number | null
  duration_minutes?: number | null
  target_rpe?: number | null
  rest_seconds?: number | null
  notes?: string | null
}

export type PlannedExercise = {
  name: string
  reps_per_side: boolean
  weight_unit?: 'kg' | 'lb' | null
  distance_unit?: 'm' | 'km' | 'mi' | null
  sets: PlannedExerciseSet[]
  notes?: string | null
}

export type PlannedWorkout = {
  name: string
  scheduled_date: string
  exercises: PlannedExercise[]
  notes?: string | null
}

export type PlannedWorkoutPlan = {
  workouts: PlannedWorkout[]
  notes?: string | null
}

export type SetResult = {
  actual_reps?: number | null
  actual_weight?: number | null
  actual_distance?: number | null
  actual_duration_minutes?: number | null
  actual_rpe?: number | null
  completed_at?: string | null
  notes?: string | null
}

export type CompletedExerciseSet = {
  id: string
  planned: PlannedExerciseSet
  result?: SetResult | null
}

export type CompletedExercise = Omit<PlannedExercise, 'sets'> & {
  id: string
  sets: CompletedExerciseSet[]
}

export type CompletedWorkout = Omit<PlannedWorkout, 'exercises'> & {
  id: string
  completed_at: string
  exercises: CompletedExercise[]
}
