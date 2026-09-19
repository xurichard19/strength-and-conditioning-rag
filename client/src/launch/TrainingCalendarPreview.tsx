import { useId, useState } from 'react'
import { ArrowRight, Check, CheckCheck, Plus } from 'lucide-react'
import './TrainingCalendarPreview.css'

type Scenario = 'original' | 'changed' | 'adapted'
type SessionTone = 'complete' | 'planned' | 'added' | 'review' | 'adjusted'

interface TrainingDay {
  day: string
  title: string
  detail: string
  status: string
  tone: SessionTone
}

const scenarios: Array<{ id: Scenario; label: string; shortLabel: string; title: string; description: string }> = [
  {
    id: 'original',
    label: 'The original week',
    shortLabel: 'Original',
    title: 'A plan with a little breathing room.',
    description: 'Strength, easy running, and recovery share the week. Two sessions are already in the books.',
  },
  {
    id: 'changed',
    label: 'Life changes',
    shortLabel: 'Life changes',
    title: 'Wednesday just became a football night.',
    description: 'An extra sport session adds training load. Thursday’s strength session is now worth reviewing.',
  },
  {
    id: 'adapted',
    label: 'The plan adapts',
    shortLabel: 'Plan adapts',
    title: 'Move what’s next. Keep what’s done.',
    description: 'In this example, strength moves to Friday. Thursday becomes recovery; completed sessions stay intact.',
  },
]

const completedDays: TrainingDay[] = [
  {
    day: 'Mon',
    title: 'Strength A',
    detail: 'Squat 3 × 5 · Romanian deadlift 3 × 8',
    status: 'Completed',
    tone: 'complete',
  },
  {
    day: 'Tue',
    title: 'Easy run',
    detail: '35 min · conversational pace',
    status: 'Completed',
    tone: 'complete',
  },
]

function getTrainingDays(scenario: Scenario): TrainingDay[] {
  const hasChanged = scenario !== 'original'
  const hasAdapted = scenario === 'adapted'

  return [
    ...completedDays,
    {
      day: 'Wed',
      title: hasChanged ? 'Football training' : 'Recovery',
      detail: hasChanged ? '90 min · added sport session' : '15 min · easy mobility',
      status: hasChanged ? 'Added' : 'Planned',
      tone: hasChanged ? 'added' : 'planned',
    },
    {
      day: 'Thu',
      title: hasAdapted ? 'Recovery' : 'Full-body strength',
      detail: hasAdapted ? '15 min · easy mobility' : '45 min · squat, press, and row',
      status: hasAdapted ? 'Adjusted' : hasChanged ? 'Review timing' : 'Planned',
      tone: hasAdapted ? 'adjusted' : hasChanged ? 'review' : 'planned',
    },
    {
      day: 'Fri',
      title: hasAdapted ? 'Full-body strength' : 'Rest day',
      detail: hasAdapted ? '45 min · moved from Thursday' : 'No session scheduled',
      status: hasAdapted ? 'Moved' : 'Planned',
      tone: hasAdapted ? 'adjusted' : 'planned',
    },
    {
      day: 'Sat',
      title: 'Long run',
      detail: '70 min · comfortable effort',
      status: 'Planned',
      tone: 'planned',
    },
  ]
}

export default function TrainingCalendarPreview() {
  const [scenario, setScenario] = useState<Scenario>('original')
  const previewId = useId()
  const trainingDays = getTrainingDays(scenario)

  return (
    <section className="training-preview" aria-label="Illustrative training calendar">
      <div className="training-preview-controls" role="group" aria-label="Explore an example training week">
        {scenarios.map((item, index) => (
          <button
            className="training-preview-control"
            type="button"
            key={item.id}
            aria-pressed={scenario === item.id}
            aria-label={item.label}
            aria-controls={`${previewId}-calendar`}
            onClick={() => setScenario(item.id)}
          >
            <span className="training-preview-control-number" aria-hidden="true">{index + 1}</span>
            <span className="training-preview-control-full" aria-hidden="true">{item.label}</span>
            <span className="training-preview-control-short" aria-hidden="true">{item.shortLabel}</span>
          </button>
        ))}
      </div>

      <div className="training-preview-canvas" id={`${previewId}-calendar`}>
        <header className="training-preview-header">
          <div>
            <p className="training-preview-label">Illustrative preview</p>
            <h3>Your training week</h3>
          </div>
          <span className="training-preview-week">Mon — Sat</span>
        </header>

        <div className="training-preview-story" aria-live="polite" aria-atomic="true">
          {scenarios.map((item) => (
            <div
              className="training-preview-story-copy"
              key={item.id}
              aria-hidden={scenario !== item.id}
            >
              <h4>{item.title}</h4>
              <p>{item.description}</p>
            </div>
          ))}
        </div>

        <ol className="training-preview-days" aria-label="Example sessions">
          {trainingDays.map((session) => (
            <li className={`training-preview-day training-preview-day-${session.tone}`} key={session.day}>
              <span className="training-preview-date">{session.day}</span>
              <div className="training-preview-session">
                <p className="training-preview-session-title">{session.title}</p>
                <p className="training-preview-session-detail">{session.detail}</p>
              </div>
              <span className="training-preview-session-status">
                {session.tone === 'complete' && <Check size={13} strokeWidth={2} aria-hidden="true" />}
                {session.tone === 'added' && <Plus size={13} strokeWidth={2} aria-hidden="true" />}
                {session.tone === 'adjusted' && <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />}
                {session.tone === 'review' && <span aria-hidden="true">!</span>}
                {session.status}
              </span>
            </li>
          ))}
        </ol>

        <div className="training-preview-record">
          <CheckCheck size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>Two completed sessions. Always part of your history.</span>
        </div>
      </div>

      <p className="training-preview-note">An example of the intended experience. Automatic adjustments are in development.</p>
    </section>
  )
}
