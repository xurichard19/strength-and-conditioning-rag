import { type FormEvent, useState } from "react"
import { ApiRequestError } from "../api/errors"
import { savePlan, submitPlan } from "../api/plan"
import type { PlanResponse } from "../types"

const workoutsPerPage = 3

function formatWorkoutDate(date: string) {
    const parsedDate = new Date(`${date}T00:00:00`)

    if (Number.isNaN(parsedDate.getTime())) {
        return date
    }

    return new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
    }).format(parsedDate)
}

function formatShortDate(date: string) {
    const parsedDate = new Date(`${date}T00:00:00`)

    if (Number.isNaN(parsedDate.getTime())) {
        return date
    }

    return new Intl.DateTimeFormat(undefined, {
        month: "numeric",
        day: "numeric",
    }).format(parsedDate)
}

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
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState("")
    const [saveError, setSaveError] = useState("")
    const [saveMessage, setSaveMessage] = useState("")
    const [workoutPage, setWorkoutPage] = useState(0)

    const visibleWorkouts = plan?.workouts.slice(
        workoutPage * workoutsPerPage,
        workoutPage * workoutsPerPage + workoutsPerPage,
    ) ?? []
    const totalWorkoutPages = plan ? Math.ceil(plan.workouts.length / workoutsPerPage) : 0
    const canShowPreviousWorkouts = workoutPage > 0
    const canShowNextWorkouts = totalWorkoutPages > 0 && workoutPage < totalWorkoutPages - 1

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        const trimmedGoal = goal.trim()
        const trimmedConstraints = constraints.trim()
        if (!trimmedGoal || isLoading) return

        setIsLoading(true)
        setError("")
        setSaveError("")
        setSaveMessage("")
        setPlan(null)
        setWorkoutPage(0)

        try {
            const data = await submitPlan({
                goal: trimmedGoal,
                experience_level: experienceLevel,
                ...(trimmedConstraints ? { constraints: trimmedConstraints } : {}),
            }, accessToken)
            setPlan(data)
        } catch (error) {
            if (error instanceof ApiRequestError && error.status === 401) {
                onUnauthorized()
                return
            }

            setError("Something went wrong while creating the plan. Please try again.")
            setWorkoutPage(0)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSavePlan = async () => {
        if (!plan || isSaving) return

        setIsSaving(true)
        setSaveError("")
        setSaveMessage("")

        try {
            await savePlan(plan, accessToken)
            setSaveMessage("Plan saved to your calendar.")
        } catch (error) {
            if (error instanceof ApiRequestError && error.status === 401) {
                onUnauthorized()
                return
            }

            setSaveError("The plan was generated, but it could not be saved. Please try again.")
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <main className="mx-auto min-h-[calc(100vh-4.25rem)] max-w-6xl px-4 py-8 text-left text-[var(--text)] sm:px-6 lg:px-8">
            <header className="mb-8">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-h)]">
                    Hybrid training builder
                </p>
                <h1 className="m-0 text-4xl font-semibold tracking-normal text-[var(--text-h)] sm:text-5xl">
                    Build an evidence-informed week
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-h)]">
                    Generate a Monday through Sunday training week that balances strength, conditioning, recovery, and interference risk.
                </p>
            </header>

            <div className="grid gap-5 lg:grid-cols-[minmax(14rem,0.55fr)_minmax(0,1.45fr)]">
                <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 shadow-[var(--shadow)]">
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
                            Performance goal
                            <textarea
                                id="goal"
                                value={goal}
                                onChange={(e) => setGoal(e.target.value)}
                                placeholder="Improve 10K pace while maintaining lower-body strength."
                                className="min-h-24 resize-y rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-base leading-6 text-[var(--text-h)] outline-none transition placeholder:text-[var(--text)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-bg)]"
                            />
                        </label>

                        <label htmlFor="constraints" className="flex flex-col gap-2 text-sm font-medium text-[var(--text-h)]">
                            Training context
                            <textarea
                                id="constraints"
                                value={constraints}
                                onChange={(e) => setConstraints(e.target.value)}
                                placeholder="Four training days, 60 minutes, gym access, long run Sunday, avoid heavy legs before intervals."
                                className="min-h-32 resize-y rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-base leading-6 text-[var(--text-h)] outline-none transition placeholder:text-[var(--text)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-bg)]"
                            />
                        </label>

                        <button
                            type="submit"
                            disabled={!goal.trim() || isLoading}
                            className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:border disabled:border-[var(--border)] disabled:bg-[var(--social-bg)] disabled:text-[var(--text)]"
                        >
                            {isLoading ? "Synthesizing..." : "Build week"}
                        </button>
                    </form>
                </section>

                <section className="min-h-96 rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-[var(--shadow)]">
                    <div className="relative border-b border-[var(--border)] px-14 py-4 text-center">
                        <button
                            type="button"
                            onClick={() => setWorkoutPage((page) => Math.max(page - 1, 0))}
                            disabled={!canShowPreviousWorkouts}
                            aria-label="Show previous workout days"
                            className="absolute left-4 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-[var(--border)] bg-[var(--social-bg)] text-xl font-semibold text-[var(--text-h)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-[var(--border)] disabled:hover:text-[var(--text-h)]"
                        >
                            {"<"}
                        </button>
                        <div>
                            <h2 className="m-0 text-lg font-semibold text-[var(--text-h)]">Training week</h2>
                            {plan && (
                                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text)]">
                                    Days {workoutPage * workoutsPerPage + 1}-{Math.min((workoutPage + 1) * workoutsPerPage, plan.workouts.length)} of {plan.workouts.length}
                                </p>
                            )}
                        </div>
                        {isLoading && (
                            <span className="mt-2 block text-sm font-medium text-[var(--accent)]">Retrieving evidence</span>
                        )}
                        <button
                            type="button"
                            onClick={() => setWorkoutPage((page) => Math.min(page + 1, totalWorkoutPages - 1))}
                            disabled={!canShowNextWorkouts}
                            aria-label="Show next workout days"
                            className="absolute right-4 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-[var(--border)] bg-[var(--social-bg)] text-xl font-semibold text-[var(--text-h)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-[var(--border)] disabled:hover:text-[var(--text-h)]"
                        >
                            {">"}
                        </button>
                    </div>

                    <div className="p-5">
                        {plan && !error && (
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <p className="m-0 text-sm leading-6 text-[var(--text)]">
                                    Review the generated week, then save it when it looks right.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleSavePlan}
                                    disabled={isSaving}
                                    className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:border disabled:border-[var(--border)] disabled:bg-[var(--social-bg)] disabled:text-[var(--text)]"
                                >
                                    {isSaving ? "Saving..." : "Save plan"}
                                </button>
                            </div>
                        )}
                        {saveMessage && <p className="mb-4 leading-7 text-[var(--accent)]">{saveMessage}</p>}
                        {saveError && <p className="mb-4 leading-7 text-red-700">{saveError}</p>}
                        {error ? (
                        <p className="leading-7 text-red-700">{error}</p>
                    ) : plan ? (
                        <div className="grid gap-4 xl:grid-cols-3">
                            {visibleWorkouts.map((workout, dayIndex) => (
                                <article
                                    key={`${workout.exercises[0]?.date ?? "workout"}-${dayIndex}`}
                                    className="flex min-h-80 flex-col rounded-lg border border-[var(--border)] bg-[var(--social-bg)]"
                                >
                                    <div className="border-b border-[var(--border)] bg-[var(--bg)] p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                                                    Day {workoutPage * workoutsPerPage + dayIndex + 1}
                                                </p>
                                                <h3 className="m-0 mt-1 text-lg font-semibold text-[var(--text-h)]">
                                                    {formatWorkoutDate(workout.exercises[0]?.date ?? "")}
                                                </h3>
                                            </div>
                                            <span className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--text-h)]">
                                                {formatShortDate(workout.exercises[0]?.date ?? "")}
                                            </span>
                                        </div>
                                    </div>
                                    <ul className="grid flex-1 content-start gap-2.5 p-3">
                                        {workout.exercises.map((exercise, index) => (
                                            <li
                                                key={`${exercise.name}-${index}`}
                                                className="group list-none rounded-md border border-[var(--border)] bg-[var(--bg)] text-sm leading-6 text-[var(--text)] transition hover:border-[var(--accent-border)] hover:shadow-sm focus-within:border-[var(--accent-border)] focus-within:ring-4 focus-within:ring-[var(--accent-bg)]"
                                            >
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center gap-2.5 rounded-md p-2.5 text-left focus:outline-none"
                                                >
                                                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--accent-bg)] text-xs font-semibold text-[var(--accent)]">
                                                        {index + 1}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="break-words text-sm font-semibold leading-5 text-[var(--text-h)]">
                                                            {exercise.name}
                                                        </div>
                                                    </div>
                                                </button>
                                                <div className="grid max-h-0 overflow-hidden px-2.5 text-left opacity-0 transition-all duration-200 group-hover:max-h-48 group-hover:pb-2.5 group-hover:opacity-100 group-focus-within:max-h-48 group-focus-within:pb-2.5 group-focus-within:opacity-100">
                                                    <div className="border-t border-[var(--border)] pt-2">
                                                        <div className="flex flex-wrap gap-1.5">
                                                        {exercise.sets != null && (
                                                            <span className="rounded-full bg-[var(--social-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--text-h)]">
                                                                {exercise.sets} sets
                                                            </span>
                                                        )}
                                                        {exercise.reps != null && (
                                                            <span className="rounded-full bg-[var(--social-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--text-h)]">
                                                                {exercise.reps} reps
                                                            </span>
                                                        )}
                                                        </div>
                                                        {exercise.notes && (
                                                            <p className="m-0 mt-2 text-xs leading-5 text-[var(--text)]">
                                                                {exercise.notes}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <p className="leading-7 text-[var(--text)]">
                            Your evidence-informed training week will appear here after Arcel reviews the research context.
                        </p>
                        )}
                    </div>
                </section>
            </div>
        </main>
    )
}
