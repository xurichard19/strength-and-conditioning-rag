export type Page =
    | "home"
    | "chat"
    | "plan"
    | "settings"
    | "about"
    | "terms"
    | "privacy"
    | "disclaimer"
    | "accessibility"

export type Source = {
    id?: string | number | null
    source?: string | null
    page?: string | number | null
    text: string
}

export type ChatResponse = {
    text?: string
    sources?: Source[]
}

export type Exercise = {
    name: string
    reps?: number | string | null
    sets?: number | null
    notes?: string | null
}

export type Workout = {
    exercises: Exercise[]
}

export type PlanResponse = {
    Mon: Workout
    Tue: Workout
    Wed: Workout
    Thu: Workout
    Fri: Workout
    Sat: Workout
    Sun: Workout
}
