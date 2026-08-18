import { useEffect, useState } from 'react'
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Minus,
  Plus,
  SkipForward,
  X,
} from 'lucide-react'

import { classes } from '../lib/classes'
import { Button, IconButton } from './ui'

export type FocusedExercise = {
  id: string
  kind: 'strength' | 'conditioning'
  name: string
  planned: string
  targetLoad?: string
  targetReps?: string
  sets: number
  restSeconds: number
}

type SetLog = {
  load: string
  reps: string
  rpe: string
  done: boolean
}

type FocusedWorkoutModeProps = {
  exercises: FocusedExercise[]
  onClose: () => void
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function buildInitialLogs(exercises: FocusedExercise[]) {
  return Object.fromEntries(
    exercises.map((exercise) => [
      exercise.id,
      Array.from({ length: exercise.sets }, () => ({
        load: exercise.targetLoad ?? '',
        reps: exercise.targetReps ?? '',
        rpe: '',
        done: false,
      })),
    ]),
  ) as Record<string, SetLog[]>
}

export function FocusedWorkoutMode({ exercises, onClose }: FocusedWorkoutModeProps) {
  const [exerciseIndex, setExerciseIndex] = useState(0)
  const [setIndex, setSetIndex] = useState(0)
  const [phase, setPhase] = useState<'work' | 'rest' | 'complete'>('work')
  const [restSeconds, setRestSeconds] = useState(0)
  const [logs, setLogs] = useState(() => buildInitialLogs(exercises))
  const exercise = exercises[exerciseIndex]
  const currentLog = exercise ? logs[exercise.id][setIndex] : null
  const totalSets = exercises.reduce((total, item) => total + item.sets, 0)
  const completedSets = Object.values(logs).flat().filter((log) => log.done).length
  const completion = Math.round((completedSets / totalSets) * 100)
  const logFields = [
    { field: 'load', label: exercise.kind === 'strength' ? 'Actual load' : 'Distance', placeholder: exercise.kind === 'strength' ? 'kg' : 'km' },
    { field: 'reps', label: exercise.kind === 'strength' ? 'Reps' : 'Minutes', placeholder: '0' },
    { field: 'rpe', label: 'RPE', placeholder: '1-10' },
  ] as const

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    if (phase !== 'rest') return

    const timer = window.setTimeout(() => {
      if (restSeconds <= 1) {
        setSetIndex((currentSet) => currentSet + 1)
        setPhase('work')
        setRestSeconds(0)
        return
      }
      setRestSeconds(restSeconds - 1)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [phase, restSeconds])

  const updateCurrentLog = <Field extends keyof SetLog>(field: Field, value: SetLog[Field]) => {
    setLogs((currentLogs) => ({
      ...currentLogs,
      [exercise.id]: currentLogs[exercise.id].map((log, index) => (
        index === setIndex ? { ...log, [field]: value } : log
      )),
    }))
  }

  const completeSet = () => {
    updateCurrentLog('done', true)

    if (setIndex < exercise.sets - 1) {
      setRestSeconds(exercise.restSeconds)
      setPhase('rest')
      return
    }

    if (exerciseIndex < exercises.length - 1) {
      setExerciseIndex((currentExercise) => currentExercise + 1)
      setSetIndex(0)
      return
    }

    setPhase('complete')
  }

  const skipRest = () => {
    setSetIndex((currentSet) => currentSet + 1)
    setPhase('work')
  }

  const returnToPreviousExercise = () => {
    if (exerciseIndex === 0) return
    const previousIndex = exerciseIndex - 1
    setExerciseIndex(previousIndex)
    setSetIndex(exercises[previousIndex].sets - 1)
    setPhase('work')
  }

  return (
    <div className="fixed inset-0 z-[70] bg-[color:rgba(6,6,9,0.94)] p-2 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true" aria-label="Focused workout">
      <section className="panel panel-raised mx-auto flex h-full max-h-[52rem] w-full max-w-6xl flex-col overflow-hidden">
        <header className="flex items-center gap-4 border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase text-[var(--accent)]">Focused workout</p>
              <p className="text-xs font-semibold text-[var(--text-muted)]">Local preview</p>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded bg-[var(--surface-muted)]" role="progressbar" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${completion}%` }} />
            </div>
          </div>
          <IconButton icon={X} label="Close focused workout" onClick={onClose} />
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="hidden overflow-y-auto border-r border-[var(--border)] bg-[var(--surface-muted)] p-3 md:block">
            <p className="px-2 pb-3 text-xs font-semibold text-[var(--text-muted)]">SESSION</p>
            <ol className="grid list-none gap-1 p-0">
              {exercises.map((listedExercise, index) => {
                const isCurrent = phase !== 'complete' && index === exerciseIndex
                const isComplete = logs[listedExercise.id].every((log) => log.done)
                return (
                  <li key={listedExercise.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setExerciseIndex(index)
                        setSetIndex(Math.max(0, logs[listedExercise.id].findIndex((log) => !log.done)))
                        setPhase('work')
                      }}
                      className={classes(
                        'flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition',
                        isCurrent
                          ? 'bg-[var(--accent-bg)] text-[var(--text-h)]'
                          : 'text-[var(--text)] hover:bg-[var(--surface-raised)]',
                      )}
                    >
                      <span className={classes(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-md border text-xs font-semibold',
                        isComplete
                          ? 'border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]'
                          : isCurrent
                            ? 'border-[var(--accent-border)] text-[var(--accent)]'
                            : 'border-[var(--border)] text-[var(--text-muted)]',
                      )}>
                        {isComplete ? <Check size={14} /> : index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{listedExercise.name}</span>
                        <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{listedExercise.planned}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </aside>

          <main className="min-h-0 overflow-y-auto">
            {phase === 'complete' ? (
              <div className="flex min-h-full flex-col items-center justify-center px-5 py-10 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-lg border border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]">
                  <CheckCircle2 aria-hidden="true" size={30} />
                </span>
                <p className="page-eyebrow mt-6">Session complete</p>
                <h2 className="text-3xl font-semibold text-[var(--text-h)]">Strong work.</h2>
                <p className="mt-3 max-w-md leading-7">You completed {completedSets} sets across {exercises.length} movements. This preview is local, so no workout data was saved.</p>
                <Button className="mt-7" onClick={onClose}>Return to Today</Button>
              </div>
            ) : phase === 'rest' ? (
              <div className="flex min-h-full flex-col items-center justify-center px-5 py-10 text-center">
                <Clock3 aria-hidden="true" size={24} className="text-[var(--accent)]" />
                <p className="page-eyebrow mt-5">Rest before set {setIndex + 2}</p>
                <p className="font-mono text-7xl font-semibold text-[var(--text-h)] sm:text-8xl">{formatTime(restSeconds)}</p>
                <p className="mt-4 text-sm text-[var(--text)]">{exercise.name} · target {exercise.targetReps} reps</p>
                <div className="mt-7 flex items-center gap-3">
                  <IconButton icon={Minus} label="Reduce rest by 15 seconds" onClick={() => setRestSeconds((seconds) => Math.max(0, seconds - 15))} />
                  <Button variant="secondary" icon={SkipForward} onClick={skipRest}>Skip rest</Button>
                  <IconButton icon={Plus} label="Add 15 seconds of rest" onClick={() => setRestSeconds((seconds) => seconds + 15)} />
                </div>
              </div>
            ) : (
              <div className="mx-auto flex min-h-full max-w-2xl flex-col px-5 py-7 sm:px-8 sm:py-9">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="page-eyebrow">Exercise {exerciseIndex + 1} of {exercises.length}</p>
                    <h2 className="text-3xl font-semibold text-[var(--text-h)]">{exercise.name}</h2>
                  </div>
                  <span className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--text)]">
                    Set {setIndex + 1} / {exercise.sets}
                  </span>
                </div>

                <div className="mt-8 border-y border-[var(--border)] py-8 text-center">
                  <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">Target</p>
                  <p className="mt-3 text-4xl font-semibold text-[var(--text-h)] sm:text-5xl">{exercise.planned}</p>
                  <p className="mt-3 text-sm text-[var(--text)]">
                    {exercise.kind === 'strength' ? 'Controlled reps · leave about 2 reps in reserve' : 'Conversational aerobic effort'}
                  </p>
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  {logFields.map(({ field, label, placeholder }) => (
                    <label key={field}>
                      <span className="field-label">{label}</span>
                      <input
                        className="field-control h-12 px-3 text-center font-mono text-base"
                        inputMode={field === 'load' ? undefined : 'decimal'}
                        value={currentLog?.[field] ?? ''}
                        onChange={(event) => updateCurrentLog(field, event.target.value)}
                        placeholder={placeholder}
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-10">
                  <Button variant="ghost" icon={ChevronLeft} disabled={exerciseIndex === 0} onClick={returnToPreviousExercise}>Previous</Button>
                  <Button icon={Check} onClick={completeSet}>
                    {exercise.kind === 'conditioning'
                      ? 'Complete effort'
                      : setIndex === exercise.sets - 1
                        ? 'Complete final set'
                        : 'Complete set'}
                  </Button>
                </div>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  )
}
