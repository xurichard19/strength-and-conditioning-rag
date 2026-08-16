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
import { invalidateWorkoutQueries } from '../api/workoutQueries'
import { Button, EmptyState, IconButton, PageHeader, Panel } from '../components/ui'
import { formatDateKey } from '../lib/dates'
import { useSessionState } from '../lib/sessionState'
import type { PlannedExercise, WorkoutPlan } from '../types'

const workoutsPerPage = 3

function formatWorkoutDate(date: string) {
  return formatDateKey(date, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function formatShortDate(date: string) {
  return formatDateKey(date, { month: 'numeric', day: 'numeric' })
}

function formatExercisePrescription(exercise: PlannedExercise) {
  const details: string[] = []

  if (exercise.sets != null && exercise.reps != null) {
    details.push(`${exercise.sets} x ${exercise.reps}${exercise.reps_per_side ? ' / side' : ''}`)
  } else if (exercise.sets != null) {
    details.push(`${exercise.sets} sets`)
  } else if (exercise.reps != null) {
    details.push(`${exercise.reps} reps${exercise.reps_per_side ? ' / side' : ''}`)
  }

  if (exercise.weight != null) details.push(`${exercise.weight} ${exercise.weight_unit ?? ''}`.trim())
  if (exercise.distance != null) details.push(`${exercise.distance} ${exercise.distance_unit ?? ''}`.trim())
  if (exercise.duration_minutes != null) details.push(`${exercise.duration_minutes} min`)
  if (exercise.target_rpe != null) details.push(`RPE ${exercise.target_rpe}`)
  if (exercise.rest_seconds != null) details.push(`${exercise.rest_seconds}s rest`)

  return details
}

type PlanPageProps = {
  accessToken: string
  onUnauthorized: () => void
  userId: string
}

type PlanState = {
  additionalContext: string
  goal: string
  plan: WorkoutPlan | null
  workoutPage: number
}

const initialPlan: PlanState = { additionalContext: '', goal: '', plan: null, workoutPage: 0 }

export function PlanPage({ accessToken, onUnauthorized, userId }: PlanPageProps) {
  const [state, setState] = useSessionState(userId, 'plan', initialPlan)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const { additionalContext, goal, plan, workoutPage } = state
  const updateState = (update: Partial<PlanState>) => setState((current) => ({ ...current, ...update }))

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
    updateState({ plan: null, workoutPage: 0 })

    try {
      const data = await submitPlan({
        goal: trimmedGoal,
        ...(trimmedAdditionalContext ? { additional_context: trimmedAdditionalContext } : {}),
      }, accessToken)
      updateState({ plan: data })
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
      invalidateWorkoutQueries(userId)
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
                onChange={(event) => updateState({ goal: event.target.value })}
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
                onChange={(event) => updateState({ additionalContext: event.target.value })}
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
                onClick={() => updateState({ workoutPage: Math.max(workoutPage - 1, 0) })}
              />
              <IconButton
                icon={ChevronRight}
                label="Show next workout days"
                disabled={!canShowNextWorkouts}
                onClick={() => updateState({ workoutPage: Math.min(workoutPage + 1, totalWorkoutPages - 1) })}
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
            {plan?.notes && <p className="mb-4 text-sm leading-6 text-[var(--text-muted)]">{plan.notes}</p>}
            {error ? (
              <p role="alert" className="feedback-error">{error}</p>
            ) : plan ? (
              <div className="grid gap-4 xl:grid-cols-3">
                {visibleWorkouts.map((workout, dayIndex) => {
                  const date = workout.scheduled_date
                  return (
                    <article key={`${date}-${dayIndex}`} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]">
                      <div className="border-b border-[var(--border)] bg-[var(--surface)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-[var(--accent)]">Day {workoutPage * workoutsPerPage + dayIndex + 1}</p>
                            <h3 className="mt-1 text-base font-semibold">{workout.name}</h3>
                            <p className="mt-1 text-xs text-[var(--text-muted)]">{formatWorkoutDate(date)}</p>
                          </div>
                          <span className="rounded border border-[var(--border)] px-2 py-1 text-xs font-semibold text-[var(--text)]">
                            {formatShortDate(date)}
                          </span>
                        </div>
                      </div>
                      <ol className="list-none divide-y divide-[var(--border)] p-0">
                        {workout.exercises.map((exercise, index) => {
                          const prescription = formatExercisePrescription(exercise)
                          return (
                            <li key={`${exercise.name}-${index}`} className="p-3.5">
                              <div className="flex items-start gap-3">
                                <span className="font-mono text-xs font-semibold text-[var(--accent)]">{String(index + 1).padStart(2, '0')}</span>
                                <div className="min-w-0 flex-1">
                                  <h4 className="break-words text-sm font-semibold leading-5">{exercise.name}</h4>
                                  {prescription.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-[var(--text)]">
                                      {prescription.map((detail) => <span key={detail}>{detail}</span>)}
                                    </div>
                                  )}
                                  {exercise.notes && <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{exercise.notes}</p>}
                                </div>
                              </div>
                            </li>
                          )
                        })}
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
