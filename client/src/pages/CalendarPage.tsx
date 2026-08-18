import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, RotateCcw } from 'lucide-react'

import { ApiRequestError } from '../api/errors'
import { fetchCachedSavedPlan } from '../api/workoutQueries'
import { Button, EmptyState, IconButton, PageHeader, Panel } from '../components/ui'
import { formatDateKey, toDateKey } from '../lib/dates'
import type { SavedExercise, SavedWorkout } from '../types/workouts'

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date)
}

function formatSelectedDate(date: string) {
  return formatDateKey(date, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function buildCalendarDates(displayDate: Date) {
  const firstOfMonth = new Date(displayDate.getFullYear(), displayDate.getMonth(), 1)
  const firstCalendarDate = new Date(firstOfMonth)
  firstCalendarDate.setDate(firstOfMonth.getDate() - firstOfMonth.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCalendarDate)
    date.setDate(firstCalendarDate.getDate() + index)
    return date
  })
}

function groupExercisesByDate(workouts: SavedWorkout[]) {
  return workouts.reduce<Record<string, SavedExercise[]>>((groupedExercises, workout) => {
    workout.exercises.forEach((exercise) => {
      groupedExercises[exercise.date] = [...(groupedExercises[exercise.date] ?? []), exercise]
    })
    return groupedExercises
  }, {})
}

type CalendarPageProps = {
  accessToken: string
  onUnauthorized: () => void
  userId: string
}

export function CalendarPage({ accessToken, onUnauthorized, userId }: CalendarPageProps) {
  const today = useMemo(() => new Date(), [])
  const todayKey = toDateKey(today)
  const [displayDate, setDisplayDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [workouts, setWorkouts] = useState<SavedWorkout[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const exercisesByDate = useMemo(() => groupExercisesByDate(workouts), [workouts])
  const calendarDates = useMemo(() => buildCalendarDates(displayDate), [displayDate])
  const selectedExercises = exercisesByDate[selectedDate] ?? []

  useEffect(() => {
    let isMounted = true

    const loadSavedPlan = async () => {
      setIsLoading(true)
      setError('')
      try {
        const data = await fetchCachedSavedPlan(userId, accessToken)
        if (isMounted) setWorkouts(data.workouts)
      } catch (requestError) {
        if (requestError instanceof ApiRequestError && requestError.status === 401) {
          onUnauthorized()
          return
        }
        if (isMounted) {
          setWorkouts([])
          setError('Could not load saved training sessions.')
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void loadSavedPlan()
    return () => { isMounted = false }
  }, [accessToken, onUnauthorized, userId])

  const showCurrentMonth = () => {
    setDisplayDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDate(todayKey)
  }

  return (
    <main className="app-page">
      <PageHeader
        eyebrow="Saved training"
        icon={CalendarDays}
        title="Keep the week in view."
        description="Review saved sessions by date and see the training details that shape the rest of your week."
        actions={<Button variant="secondary" icon={RotateCcw} onClick={showCurrentMonth}>Today</Button>}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-4 sm:px-5">
            <IconButton
              icon={ChevronLeft}
              label="Show previous month"
              onClick={() => setDisplayDate((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
            />
            <h2 className="text-lg font-semibold sm:text-xl">{formatMonth(displayDate)}</h2>
            <IconButton
              icon={ChevronRight}
              label="Show next month"
              onClick={() => setDisplayDate((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
            />
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[46rem]">
              <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-muted)]">
                {weekdayLabels.map((weekday) => (
                  <div key={weekday} className="px-2 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">
                    {weekday}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {calendarDates.map((date) => {
                  const dateKey = toDateKey(date)
                  const dateExercises = exercisesByDate[dateKey] ?? []
                  const isCurrentMonth = date.getMonth() === displayDate.getMonth()
                  const isToday = dateKey === todayKey
                  const isSelected = dateKey === selectedDate

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => setSelectedDate(dateKey)}
                      aria-pressed={isSelected}
                      className={`min-h-28 border-b border-r border-[var(--border)] p-2.5 text-left transition hover:bg-[var(--surface-raised)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--accent)] ${
                        isSelected ? 'bg-[var(--accent-bg)]' : 'bg-[var(--surface)]'
                      } ${isCurrentMonth ? '' : 'opacity-40'}`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={`grid h-7 w-7 place-items-center rounded-md text-xs font-semibold ${
                          isToday ? 'bg-[var(--accent)] text-[#160a20]' : 'text-[var(--text-h)]'
                        }`}>
                          {date.getDate()}
                        </span>
                        {dateExercises.length > 0 && (
                          <span className="text-xs font-semibold text-[var(--accent)]">{dateExercises.length}</span>
                        )}
                      </div>
                      <div className="grid gap-1.5">
                        {dateExercises.slice(0, 2).map((exercise, index) => (
                          <span key={`${dateKey}-${index}`} className="truncate border-l-2 border-[var(--accent)] bg-[var(--bg-elevated)] px-2 py-1 text-xs font-medium text-[var(--text-h)]">
                            {exercise.name}
                          </span>
                        ))}
                        {dateExercises.length > 2 && <span className="text-xs text-[var(--text-muted)]">+{dateExercises.length - 2} more</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="overflow-hidden xl:sticky xl:top-24">
          <div className="border-b border-[var(--border)] p-5">
            <p className="page-eyebrow">Selected day</p>
            <h2 className="text-xl font-semibold leading-7">{formatSelectedDate(selectedDate)}</h2>
          </div>

          <div className="p-4">
            {isLoading ? (
              <p className="loading-pulse p-2 text-sm">Loading saved sessions...</p>
            ) : error ? (
              <p role="alert" className="feedback-error">{error}</p>
            ) : selectedExercises.length > 0 ? (
              <div className="divide-y divide-[var(--border)]">
                {selectedExercises.map((exercise, exerciseIndex) => (
                  <article key={`${exercise.name}-${exerciseIndex}`} className="py-4 first:pt-1 last:pb-1">
                    <h3 className="text-sm font-semibold">{exercise.name}</h3>
                    {(exercise.sets != null || exercise.reps != null) && (
                      <div className="mt-2 flex items-center gap-3 text-xs font-medium text-[var(--text)]">
                        <Clock3 aria-hidden="true" size={14} className="text-[var(--accent)]" />
                        {exercise.sets != null && <span>{exercise.sets} sets</span>}
                        {exercise.reps != null && <span>{exercise.reps} reps</span>}
                      </div>
                    )}
                    {exercise.notes && <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{exercise.notes}</p>}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No sessions scheduled"
                description="Choose another date or save a generated plan to populate your calendar."
              />
            )}
          </div>
        </Panel>
      </div>
    </main>
  )
}
