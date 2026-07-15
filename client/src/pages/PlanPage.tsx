import { type FormEvent, useState } from 'react'
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Save,
  Sparkles,
  Target,
} from 'lucide-react'

import { ApiRequestError } from '../api/errors'
import { savePlan, submitPlan } from '../api/plan'
import { Button, EmptyState, IconButton, PageHeader, Panel } from '../components/ui'
import type { PlanResponse } from '../types'

const workoutsPerPage = 3

function parseWorkoutDate(date: string) {
  return new Date(`${date}T00:00:00`)
}

function formatWorkoutDate(date: string) {
  const parsedDate = parseWorkoutDate(date)
  if (Number.isNaN(parsedDate.getTime())) return date
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(parsedDate)
}

function formatShortDate(date: string) {
  const parsedDate = parseWorkoutDate(date)
  if (Number.isNaN(parsedDate.getTime())) return date
  return new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric' }).format(parsedDate)
}

type PlanPageProps = {
  accessToken: string
  onUnauthorized: () => void
}

export function PlanPage({ accessToken, onUnauthorized }: PlanPageProps) {
  const [goal, setGoal] = useState('')
  const [additionalContext, setAdditionalContext] = useState('')
  const [plan, setPlan] = useState<PlanResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [workoutPage, setWorkoutPage] = useState(0)

  const visibleWorkouts = plan?.workouts.slice(
    workoutPage * workoutsPerPage,
    workoutPage * workoutsPerPage + workoutsPerPage,
  ) ?? []
  const totalWorkoutPages = plan ? Math.ceil(plan.workouts.length / workoutsPerPage) : 0
  const canShowPreviousWorkouts = workoutPage > 0
  const canShowNextWorkouts = totalWorkoutPages > 0 && workoutPage < totalWorkoutPages - 1

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedGoal = goal.trim()
    const trimmedAdditionalContext = additionalContext.trim()
    if (!trimmedGoal || isLoading) return

    setIsLoading(true)
    setError('')
    setSaveError('')
    setSaveMessage('')
    setPlan(null)
    setWorkoutPage(0)

    try {
      const data = await submitPlan({
        goal: trimmedGoal,
        ...(trimmedAdditionalContext ? { additional_context: trimmedAdditionalContext } : {}),
      }, accessToken)
      setPlan(data)
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        onUnauthorized()
        return
      }
      setError('Something went wrong while creating the plan. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSavePlan = async () => {
    if (!plan || isSaving) return
    setIsSaving(true)
    setSaveError('')
    setSaveMessage('')

    try {
      await savePlan(plan, accessToken)
      setSaveMessage('Plan saved to your calendar.')
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        onUnauthorized()
        return
      }
      setSaveError('The plan was generated, but it could not be saved. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="app-page">
      <PageHeader
        eyebrow="Weekly planner"
        icon={CalendarRange}
        title="Build a coherent training week."
        description="Combine a specific performance goal with the constraints that matter right now. Your profile supplies the durable context."
      />

      <div className="grid items-start gap-5 lg:grid-cols-[21rem_minmax(0,1fr)]">
        <Panel className="p-5 lg:sticky lg:top-24">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-[var(--accent-bg)] text-[var(--accent)]">
              <Target aria-hidden="true" size={18} />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Plan context</h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">Specific beats exhaustive.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <label htmlFor="goal">
              <span className="field-label">Performance goal</span>
              <textarea
                id="goal"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="Improve 10K pace while maintaining lower-body strength."
                rows={4}
                className="field-control resize-y px-3.5 py-3 text-sm leading-6"
              />
            </label>

            <label htmlFor="additional-context">
              <span className="field-label">Additional context</span>
              <textarea
                id="additional-context"
                value={additionalContext}
                onChange={(event) => setAdditionalContext(event.target.value)}
                placeholder="Race in eight weeks, long run Sunday, avoid heavy legs before intervals..."
                rows={6}
                className="field-control resize-y px-3.5 py-3 text-sm leading-6"
              />
            </label>

            <Button type="submit" icon={Sparkles} disabled={!goal.trim() || isLoading} className="w-full">
              {isLoading ? 'Building your week...' : 'Generate week'}
            </Button>
          </form>
        </Panel>

        <Panel raised className="min-h-[38rem] overflow-hidden">
          <header className="flex min-h-[4.5rem] items-center justify-between gap-4 border-b border-[var(--border)] px-4 sm:px-5">
            <div>
              <h2 className="text-base font-semibold">Training week</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {plan
                  ? `Days ${workoutPage * workoutsPerPage + 1}-${Math.min((workoutPage + 1) * workoutsPerPage, plan.workouts.length)} of ${plan.workouts.length}`
                  : 'Monday through Sunday'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <IconButton
                icon={ChevronLeft}
                label="Show previous workout days"
                disabled={!canShowPreviousWorkouts}
                onClick={() => setWorkoutPage((page) => Math.max(page - 1, 0))}
              />
              <IconButton
                icon={ChevronRight}
                label="Show next workout days"
                disabled={!canShowNextWorkouts}
                onClick={() => setWorkoutPage((page) => Math.min(page + 1, totalWorkoutPages - 1))}
              />
            </div>
          </header>

          {isLoading && (
            <div className="border-b border-[var(--border)] px-5 py-4" role="progressbar" aria-label="Generating training plan">
              <div className="mb-2 flex items-center justify-between gap-4 text-xs font-semibold">
                <span className="text-[var(--text-h)]">Balancing volume, stress, and recovery</span>
                <span className="text-[var(--accent)]">Working...</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-[var(--accent-bg)]">
                <div className="plan-loading-bar h-full w-2/5 rounded bg-[var(--accent)]" />
              </div>
            </div>
          )}

          {plan && !error && (
            <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">Review all seven days before saving the week.</p>
              <Button icon={Save} onClick={handleSavePlan} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save to calendar'}
              </Button>
            </div>
          )}

          <div className="p-4 sm:p-5">
            {saveMessage && <p className="feedback-success mb-4">{saveMessage}</p>}
            {saveError && <p role="alert" className="feedback-error mb-4">{saveError}</p>}
            {error ? (
              <p role="alert" className="feedback-error">{error}</p>
            ) : plan ? (
              <div className="grid gap-4 xl:grid-cols-3">
                {visibleWorkouts.map((workout, dayIndex) => {
                  const date = workout.exercises[0]?.date ?? ''
                  return (
                    <article key={`${date}-${dayIndex}`} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]">
                      <div className="border-b border-[var(--border)] bg-[var(--surface)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-[var(--accent)]">Day {workoutPage * workoutsPerPage + dayIndex + 1}</p>
                            <h3 className="mt-1 text-base font-semibold">{formatWorkoutDate(date)}</h3>
                          </div>
                          <span className="rounded border border-[var(--border)] px-2 py-1 text-xs font-semibold text-[var(--text)]">
                            {formatShortDate(date)}
                          </span>
                        </div>
                      </div>
                      <ol className="list-none divide-y divide-[var(--border)] p-0">
                        {workout.exercises.map((exercise, index) => (
                          <li key={`${exercise.name}-${index}`} className="p-3.5">
                            <div className="flex items-start gap-3">
                              <span className="font-mono text-xs font-semibold text-[var(--accent)]">{String(index + 1).padStart(2, '0')}</span>
                              <div className="min-w-0 flex-1">
                                <h4 className="break-words text-sm font-semibold leading-5">{exercise.name}</h4>
                                {(exercise.sets != null || exercise.reps != null) && (
                                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-[var(--text)]">
                                    {exercise.sets != null && <span>{exercise.sets} sets</span>}
                                    {exercise.reps != null && <span>{exercise.reps} reps</span>}
                                  </div>
                                )}
                                {exercise.notes && <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{exercise.notes}</p>}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </article>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                icon={Dumbbell}
                title="Your week will appear here"
                description="Add a performance goal and any immediate constraints, then generate a balanced Monday-to-Sunday plan."
              />
            )}
          </div>
        </Panel>
      </div>
    </main>
  )
}
