import { useState } from 'react'
import {
  Activity,
  CheckCircle2,
  Clock3,
  Construction,
  Dumbbell,
  Play,
  Repeat2,
  Sparkles,
} from 'lucide-react'

import { FocusedWorkoutMode, type FocusedExercise } from '../components/FocusedWorkoutMode'
import { Button, PageHeader, Panel } from '../components/ui'

// TODO: Remove this feature gate when the Today workout experience is ready for users.
const TODAY_PAGE_UNDER_DEVELOPMENT = true

const previewExercises: FocusedExercise[] = [
  {
    id: 'back-squat',
    kind: 'strength',
    name: 'Back squat',
    prescription: '4 × 5 @ 100 kg',
    targetLoad: '100',
    targetReps: '5',
    sets: 4,
    restSeconds: 90,
  },
  {
    id: 'romanian-deadlift',
    kind: 'strength',
    name: 'Romanian deadlift',
    prescription: '3 × 8 @ 70 kg',
    targetLoad: '70',
    targetReps: '8',
    sets: 3,
    restSeconds: 75,
  },
  {
    id: 'walking-lunge',
    kind: 'strength',
    name: 'Walking lunge',
    prescription: '3 × 10 / side',
    targetLoad: '20',
    targetReps: '10',
    sets: 3,
    restSeconds: 60,
  },
  {
    id: 'easy-run',
    kind: 'conditioning',
    name: 'Easy run',
    prescription: '4 km · easy effort',
    targetLoad: '4',
    targetReps: '24',
    sets: 1,
    restSeconds: 0,
  },
]

export function TodayPage() {
  const [isFocusedWorkoutOpen, setIsFocusedWorkoutOpen] = useState(false)

  return (
    <>
      <div className="relative isolate">
        <main
          className="app-page"
          inert={TODAY_PAGE_UNDER_DEVELOPMENT}
          aria-hidden={TODAY_PAGE_UNDER_DEVELOPMENT}
        >
        <PageHeader
          eyebrow="Today's training"
          icon={Dumbbell}
          title="Lower body + aerobic finish."
          description="A frontend-only preview of the session execution and focused workout experience."
          actions={(
            <span className="rounded-md border border-[var(--accent-border)] bg-[var(--accent-bg)] px-3 py-2 text-xs font-semibold text-[var(--accent)]">
              Interactive preview
            </span>
          )}
        />

        <section className="mb-5 flex flex-wrap items-center justify-between gap-4 border border-[var(--accent-border)] bg-[var(--accent-bg)] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--surface)] text-[var(--accent)]">
              <Activity aria-hidden="true" size={18} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-h)]">Quick readiness check-in</h2>
              <p className="mt-1 text-sm leading-6">Optional in the final product. This prototype keeps the full session unchanged.</p>
            </div>
          </div>
          <Button variant="secondary" disabled>Check in later</Button>
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
              <div>
                <p className="page-eyebrow mb-1">Session</p>
                <h2 className="text-lg font-semibold text-[var(--text-h)]">4 movements · about 55 minutes</h2>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]">
                <Clock3 aria-hidden="true" size={15} />
                Build week 2
              </div>
            </div>

            <ol className="m-0 list-none divide-y divide-[var(--border)] p-0">
              {previewExercises.map((exercise, index) => (
                <li key={exercise.id} className="flex items-center gap-4 px-5 py-4">
                  <span className="font-mono text-xs font-semibold text-[var(--text-muted)]">{String(index + 1).padStart(2, '0')}</span>
                  <span className={`h-8 w-1 shrink-0 rounded ${exercise.kind === 'strength' ? 'bg-[var(--accent)]' : 'bg-[var(--success)]'}`} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-[var(--text-h)]">{exercise.name}</h3>
                    <p className="mt-1 text-xs text-[var(--text)]">{exercise.kind === 'strength' ? 'Strength' : 'Conditioning'}</p>
                  </div>
                  <span className="hidden font-mono text-sm font-semibold text-[var(--text-h)] sm:block">{exercise.prescription}</span>
                  <button type="button" title="Exercise swaps are not active in this preview" aria-label={`Swap ${exercise.name}`} className="icon-button" disabled>
                    <Repeat2 aria-hidden="true" size={16} />
                  </button>
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] bg-[var(--surface-muted)] p-4 sm:p-5">
              <p className="max-w-md text-xs leading-5 text-[var(--text-muted)]">Progress lives in React state for this preview and resets when the page refreshes.</p>
              <Button icon={Play} onClick={() => setIsFocusedWorkoutOpen(true)}>Start focused workout</Button>
            </div>
          </Panel>

          <div className="grid gap-4 xl:sticky xl:top-24">
            <Panel className="p-5">
              <p className="page-eyebrow">This block</p>
              <h2 className="text-lg font-semibold text-[var(--text-h)]">Build · week 2 of 6</h2>
              <dl className="mt-5 grid gap-4 text-sm">
                <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-3">
                  <dt>Next milestone</dt>
                  <dd className="font-semibold text-[var(--text-h)]">Long run · Sat</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-3">
                  <dt>Sessions done</dt>
                  <dd className="font-semibold text-[var(--text-h)]">11 of 16</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt>Current emphasis</dt>
                  <dd className="font-semibold text-[var(--text-h)]">Strength base</dd>
                </div>
              </dl>
            </Panel>

            <Panel className="p-5">
              <Sparkles aria-hidden="true" size={19} className="text-[var(--accent)]" />
              <h2 className="mt-5 text-sm font-semibold text-[var(--text-h)]">What this prototype tests</h2>
              <ul className="mt-3 grid list-none gap-2 p-0 text-sm leading-6">
                <li className="flex gap-2"><CheckCircle2 aria-hidden="true" size={15} className="mt-1 shrink-0 text-[var(--accent)]" /> One-set-at-a-time focus</li>
                <li className="flex gap-2"><CheckCircle2 aria-hidden="true" size={15} className="mt-1 shrink-0 text-[var(--accent)]" /> Actual load, reps, and RPE</li>
                <li className="flex gap-2"><CheckCircle2 aria-hidden="true" size={15} className="mt-1 shrink-0 text-[var(--accent)]" /> Rest timer and session progress</li>
              </ul>
            </Panel>
          </div>
        </div>
        </main>

        {TODAY_PAGE_UNDER_DEVELOPMENT && (
          <div className="absolute inset-0 z-20 flex items-start justify-center bg-[color:rgba(8,9,12,0.32)] px-4 pt-16 sm:pt-24">
            <div role="status" className="panel panel-raised w-full max-w-lg border-[var(--accent-border)] bg-[color:rgba(26,27,36,0.9)] p-5 shadow-[var(--shadow)] sm:p-6">
              <div className="flex items-start gap-4 text-left">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent)]">
                  <Construction aria-hidden="true" size={20} />
                </span>
                <div>
                  <p className="page-eyebrow mb-1">Feature preview</p>
                  <h1 className="text-xl font-semibold text-[var(--text-h)] sm:text-2xl">Today is under development</h1>
                  <p className="mt-2 text-sm leading-6">
                    You can preview the upcoming workout experience, but its controls are temporarily unavailable.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {isFocusedWorkoutOpen && (
        <FocusedWorkoutMode exercises={previewExercises} onClose={() => setIsFocusedWorkoutOpen(false)} />
      )}
    </>
  )
}
