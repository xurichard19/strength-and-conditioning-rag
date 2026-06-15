export type Page = "home" | "chat" | "plan"

export type Source = {
    id?: string | number | null
    source?: string | null
    page?: string | number | null
    text: string
}

export type QueryResponse = {
    text?: string
    sources?: Source[]
}

export type PlanResponse = {
    Mon: string
    Tue: string
    Wed: string
    Thu: string
    Fri: string
    Sat: string
    Sun: string
}
