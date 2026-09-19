import { useId, useState, type ReactNode } from 'react'
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
    title: 'A balanced week of training.',
    description: 'Strength and running share the week, with time set aside for recovery. Monday and Tuesday are already complete.',
  },
  {
    id: 'changed',
    label: 'Life changes',
    shortLabel: 'Life changes',
    title: 'A swim joins Wednesday’s schedule.',
    description: 'The extra session adds training load, so Thursday’s strength workout needs another look.',
  },
  {
    id: 'adapted',
    label: 'The plan adapts',
    shortLabel: 'Plan adapts',
    title: 'Move Thursday’s workout to Friday.',
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

const recovery: TrainingDay = {
  day: 'Wed',
  title: 'Recovery',
  detail: '15 min · easy mobility',
  status: 'Planned',
  tone: 'planned',
}

const strength: TrainingDay = {
  day: 'Thu',
  title: 'Full-body strength',
  detail: '45 min · squat, press, and row',
  status: 'Planned',
  tone: 'planned',
}

const rest: TrainingDay = {
  day: 'Fri',
  title: 'Rest day',
  detail: 'No session scheduled',
  status: 'Planned',
  tone: 'planned',
}

const swimming: TrainingDay = {
  day: 'Wed',
  title: 'Swimming',
  detail: '45 min · added pool session',
  status: 'Added',
  tone: 'added',
}

const longRun: TrainingDay = {
  day: 'Sat',
  title: 'Long run',
  detail: '70 min · comfortable effort',
  status: 'Planned',
  tone: 'planned',
}

const scheduledDays: Record<Scenario, TrainingDay[]> = {
  original: [recovery, strength, rest],
  changed: [swimming, { ...strength, status: 'Review timing', tone: 'review' }, rest],
  adapted: [
    swimming,
    { ...recovery, day: 'Thu', status: 'Adjusted', tone: 'adjusted' },
    { ...strength, day: 'Fri', detail: '45 min · moved from Thursday', status: 'Moved', tone: 'adjusted' },
  ],
}

const statusIcons: Record<SessionTone, ReactNode> = {
  complete: <Check size={13} strokeWidth={2} aria-hidden="true" />,
  added: <Plus size={13} strokeWidth={2} aria-hidden="true" />,
  adjusted: <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />,
  review: <span aria-hidden="true">!</span>,
  planned: null,
}

export default function TrainingCalendarPreview() {
  const [scenario, setScenario] = useState<Scenario>('original')
  const previewId = useId()
  const trainingDays = [...completedDays, ...scheduledDays[scenario], longRun]

  return (
    <section className="training-preview" aria-label="Illustrative training calendar" data-scroll-reveal>
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
          <span className="training-preview-week">Mon to Sat</span>
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
                {statusIcons[session.tone]}
                {session.status}
              </span>
            </li>
          ))}
        </ol>

        <div className="training-preview-record">
          <CheckCheck size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>Monday and Tuesday stay in your workout history.</span>
        </div>
      </div>

      <p className="training-preview-note">An example of the intended experience. Automatic adjustments are in development.</p>
    </section>
  )
}
