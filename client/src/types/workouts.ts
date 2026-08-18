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

export type ExerciseSetRecord = {
  id: string
  order_index: number
  planned: PlannedExerciseSet
  result?: SetResult | null
  missed_at?: string | null
}

export type ExerciseRecord = Omit<PlannedExercise, 'sets'> & {
  id: string
  order_index: number
  sets: ExerciseSetRecord[]
}

export type WorkoutRecord = Omit<PlannedWorkout, 'exercises'> & {
  id: string
  version: number
  completed_at?: string | null
  superseded_at?: string | null
  created_by_change_id?: string | null
  superseded_by_change_id?: string | null
  exercises: ExerciseRecord[]
}

export type CompletedExerciseSet = ExerciseSetRecord

export type CompletedExercise = Omit<ExerciseRecord, 'sets'> & {
  sets: CompletedExerciseSet[]
}

export type CompletedWorkout = Omit<WorkoutRecord, 'completed_at' | 'exercises'> & {
  completed_at: string
  exercises: CompletedExercise[]
}
