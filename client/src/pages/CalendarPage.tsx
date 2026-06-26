import { useMemo, useState } from "react"
import { getLatestPlanWorkouts } from "../lib/workoutStorage"
import type { Workout } from "../types"

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function toDateKey(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")

    return `${year}-${month}-${day}`
}

function parseDateKey(date: string) {
    return new Date(`${date}T00:00:00`)
}

function formatMonth(date: Date) {
    return new Intl.DateTimeFormat(undefined, {
        month: "long",
        year: "numeric",
    }).format(date)
}

function formatSelectedDate(date: string) {
    const parsedDate = parseDateKey(date)

    if (Number.isNaN(parsedDate.getTime())) {
        return date
    }

    return new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    }).format(parsedDate)
}

function buildCalendarDates(displayDate: Date) {
    const firstOfMonth = new Date(displayDate.getFullYear(), displayDate.getMonth(), 1)
    const firstCalendarDate = new Date(firstOfMonth)
    firstCalendarDate.setDate(firstOfMonth.getDate() - firstOfMonth.getDay())

    return Array.from({ length: 35 }, (_, index) => {
        const date = new Date(firstCalendarDate)
        date.setDate(firstCalendarDate.getDate() + index)
        return date
    })
}

function groupWorkoutsByDate(workouts: Workout[]) {
    return workouts.reduce<Record<string, Workout[]>>((groupedWorkouts, workout) => {
        groupedWorkouts[workout.date] = [...(groupedWorkouts[workout.date] ?? []), workout]
        return groupedWorkouts
    }, {})
}

export function CalendarPage() {
    const today = useMemo(() => new Date(), [])
    const todayKey = toDateKey(today)
    const [displayDate, setDisplayDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
    const [selectedDate, setSelectedDate] = useState(todayKey)
    const workouts = useMemo(() => getLatestPlanWorkouts(), [])
    const workoutsByDate = useMemo(() => groupWorkoutsByDate(workouts), [workouts])
    const calendarDates = useMemo(() => buildCalendarDates(displayDate), [displayDate])
    const selectedWorkouts = workoutsByDate[selectedDate] ?? []

    const showPreviousMonth = () => {
        setDisplayDate((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))
    }

    const showNextMonth = () => {
        setDisplayDate((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))
    }

    const showCurrentMonth = () => {
        setDisplayDate(new Date(today.getFullYear(), today.getMonth(), 1))
        setSelectedDate(todayKey)
    }

    return (
        <main className="mx-auto min-h-[calc(100vh-4.25rem)] max-w-6xl px-4 py-8 text-left text-[var(--text)] sm:px-6 lg:px-8">
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-h)]">
                        Hybrid training calendar
                    </p>
                    <h1 className="m-0 text-4xl font-semibold tracking-normal text-[var(--text-h)] sm:text-5xl">
                        Calendar
                    </h1>
                </div>
                <button
                    type="button"
                    onClick={showCurrentMonth}
                    className="w-fit rounded-md border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm font-semibold text-[var(--text-h)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
                >
                    Today
                </button>
            </header>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
                <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-[var(--shadow)]">
                    <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-4 sm:px-5">
                        <button
                            type="button"
                            onClick={showPreviousMonth}
                            aria-label="Show previous month"
                            className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--social-bg)] text-xl font-semibold text-[var(--text-h)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
                        >
                            {"<"}
                        </button>
                        <h2 className="m-0 text-xl font-semibold text-[var(--text-h)]">{formatMonth(displayDate)}</h2>
                        <button
                            type="button"
                            onClick={showNextMonth}
                            aria-label="Show next month"
                            className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--social-bg)] text-xl font-semibold text-[var(--text-h)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
                        >
                            {">"}
                        </button>
                    </div>

                    <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--social-bg)]">
                        {weekdayLabels.map((weekday) => (
                            <div
                                key={weekday}
                                className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text)]"
                            >
                                {weekday}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7">
                        {calendarDates.map((date) => {
                            const dateKey = toDateKey(date)
                            const dateWorkouts = workoutsByDate[dateKey] ?? []
                            const isCurrentMonth = date.getMonth() === displayDate.getMonth()
                            const isToday = dateKey === todayKey
                            const isSelected = dateKey === selectedDate

                            return (
                                <button
                                    key={dateKey}
                                    type="button"
                                    onClick={() => setSelectedDate(dateKey)}
                                    className={`min-h-28 border-b border-r border-[var(--border)] p-2 text-left transition last:border-r-0 hover:bg-[var(--social-bg)] focus:outline-none focus:ring-4 focus:ring-inset focus:ring-[var(--accent-bg)] ${isSelected ? "bg-[var(--accent-bg)]" : "bg-[var(--bg)]"
                                        } ${isCurrentMonth ? "" : "opacity-45"}`}
                                >
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <span
                                            className={`grid h-7 w-7 place-items-center rounded-full text-sm font-semibold ${isToday
                                                ? "bg-[var(--accent)] text-white"
                                                : "text-[var(--text-h)]"
                                                }`}
                                        >
                                            {date.getDate()}
                                        </span>
                                        {dateWorkouts.length > 0 && (
                                            <span className="rounded-full bg-[var(--accent-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--accent)]">
                                                {dateWorkouts.length}
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid gap-1">
                                        {dateWorkouts.slice(0, 2).map((workout, index) => (
                                            <span
                                                key={`${dateKey}-${index}`}
                                                className="truncate rounded-md border border-[var(--accent-border)] bg-[var(--bg)] px-2 py-1 text-xs font-semibold text-[var(--text-h)]"
                                            >
                                                {workout.exercises[0]?.name ?? "Workout"}
                                            </span>
                                        ))}
                                        {dateWorkouts.length > 2 && (
                                            <span className="text-xs font-semibold text-[var(--text)]">
                                                +{dateWorkouts.length - 2} more
                                            </span>
                                        )}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </section>

                <aside className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                        Selected date
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-[var(--text-h)]">{formatSelectedDate(selectedDate)}</h2>

                    <div className="mt-5 grid gap-3">
                        {selectedWorkouts.length > 0 ? (
                            selectedWorkouts.map((workout, workoutIndex) => (
                                <article
                                    key={`${selectedDate}-${workoutIndex}`}
                                    className="rounded-md border border-[var(--border)] bg-[var(--social-bg)] p-4"
                                >
                                    <h3 className="m-0 text-base font-semibold text-[var(--text-h)]">
                                        Session {workoutIndex + 1}
                                    </h3>
                                    <ul className="mt-3 grid gap-2 p-0">
                                        {workout.exercises.map((exercise, exerciseIndex) => (
                                            <li
                                                key={`${exercise.name}-${exerciseIndex}`}
                                                className="list-none rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-sm"
                                            >
                                                <div className="font-semibold text-[var(--text-h)]">{exercise.name}</div>
                                                <div className="mt-1 flex flex-wrap gap-2">
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
                                                    <p className="m-0 mt-2 text-sm leading-6 text-[var(--text)]">{exercise.notes}</p>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </article>
                            ))
                        ) : (
                            <p className="leading-7 text-[var(--text)]">No training sessions scheduled for this date.</p>
                        )}
                    </div>
                </aside>
            </div>
        </main>
    )
}
