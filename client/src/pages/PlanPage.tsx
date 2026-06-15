import { type FormEvent, useState } from "react"
import { ApiRequestError } from "../api/errors"
import { submitPlan } from "../api/plan"
import type { PlanResponse } from "../types"

const dayLabels: Array<{ key: keyof PlanResponse; label: string }> = [
    { key: "Mon", label: "Monday" },
    { key: "Tue", label: "Tuesday" },
    { key: "Wed", label: "Wednesday" },
    { key: "Thu", label: "Thursday" },
    { key: "Fri", label: "Friday" },
    { key: "Sat", label: "Saturday" },
    { key: "Sun", label: "Sunday" },
]

type PlanPageProps = {
    accessToken: string
    onUnauthorized: () => void
}

export function PlanPage({ accessToken, onUnauthorized }: PlanPageProps) {
    const [experienceLevel, setExperienceLevel] = useState("intermediate")
    const [goal, setGoal] = useState("")
    const [constraints, setConstraints] = useState("")
    const [plan, setPlan] = useState<PlanResponse | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        const trimmedGoal = goal.trim()
        const trimmedConstraints = constraints.trim()
        if (!trimmedGoal || !trimmedConstraints || isLoading) return

        setIsLoading(true)
        setError("")
        setPlan(null)

        try {
            const data = await submitPlan({
                experienceLevel,
                goal: trimmedGoal,
                constraints: trimmedConstraints,
            }, accessToken)
            setPlan(data)
        } catch (error) {
            if (error instanceof ApiRequestError && error.status === 401) {
                onUnauthorized()
                return
            }

            setError("Something went wrong while creating the plan. Please try again.")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <main className="mx-auto min-h-[calc(100vh-4.25rem)] max-w-5xl px-4 py-8 text-left text-[var(--text)] sm:px-6 lg:px-8">
            <header className="mb-8">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-h)]">
                    Weekly workout planner
                </p>
                <h1 className="m-0 text-4xl font-semibold tracking-normal text-[var(--text-h)] sm:text-5xl">
                    Build a training week
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-h)]">
                    Generate a structured Monday through Sunday plan from your experience level, goal, and constraints.
                </p>
            </header>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 shadow-[var(--shadow)] sm:p-5">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <label className="flex flex-col gap-2 text-sm font-medium text-[var(--text-h)]">
                            Experience level
                            <select
                                value={experienceLevel}
                                onChange={(e) => setExperienceLevel(e.target.value)}
                                className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-base text-[var(--text-h)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-bg)]"
                            >
                                <option value="beginner">Beginner</option>
                                <option value="intermediate">Intermediate</option>
                                <option value="advanced">Advanced</option>
                            </select>
                        </label>

                        <label htmlFor="goal" className="flex flex-col gap-2 text-sm font-medium text-[var(--text-h)]">
                            Goal
                            <textarea
                                id="goal"
                                value={goal}
                                onChange={(e) => setGoal(e.target.value)}
                                placeholder="Improve acceleration and lower-body power for soccer."
                                className="min-h-24 resize-y rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-base leading-6 text-[var(--text-h)] outline-none transition placeholder:text-[var(--text)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-bg)]"
                            />
                        </label>

                        <label htmlFor="constraints" className="flex flex-col gap-2 text-sm font-medium text-[var(--text-h)]">
                            Needs and constraints
                            <textarea
                                id="constraints"
                                value={constraints}
                                onChange={(e) => setConstraints(e.target.value)}
                                placeholder="Four training days, 60 minutes, gym access, avoid high-impact work on Friday."
                                className="min-h-32 resize-y rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-base leading-6 text-[var(--text-h)] outline-none transition placeholder:text-[var(--text)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-bg)]"
                            />
                        </label>

                        <button
                            type="submit"
                            disabled={!goal.trim() || !constraints.trim() || isLoading}
                            className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:border disabled:border-[var(--border)] disabled:bg-[var(--social-bg)] disabled:text-[var(--text)]"
                        >
                            {isLoading ? "Creating..." : "Create plan"}
                        </button>
                    </form>
                </section>

                <section className="min-h-96 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow)]">
                    <div className="mb-4 flex items-center justify-between gap-4">
                        <h2 className="m-0 text-lg font-semibold text-[var(--text-h)]">Workout plan</h2>
                        {isLoading && (
                            <span className="text-sm font-medium text-[var(--accent)]">Retrieving context</span>
                        )}
                    </div>

                    {error ? (
                        <p className="leading-7 text-red-700">{error}</p>
                    ) : plan ? (
                        <div className="grid gap-3">
                            {dayLabels.map((day) => (
                                <article
                                    key={day.key}
                                    className="rounded-md border border-[var(--border)] bg-[var(--social-bg)] p-4"
                                >
                                    <h3 className="m-0 text-base font-semibold text-[var(--text-h)]">{day.label}</h3>
                                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text)]">
                                        {plan[day.key]}
                                    </p>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <p className="leading-7 text-[var(--text)]">
                            Your weekly plan will appear here after the backend generates it.
                        </p>
                    )}
                </section>
            </div>
        </main>
    )
}
