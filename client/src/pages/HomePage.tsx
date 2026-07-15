import {
  ArrowRight,
  CalendarDays,
  Dumbbell,
  MessageSquareText,
  Sparkles,
} from 'lucide-react'

import { PageHeader, Panel } from '../components/ui'
import type { Page } from '../types'

type HomePageProps = {
  onNavigate: (page: Page) => void
}

const workspaces: Array<{
  description: string
  icon: typeof MessageSquareText
  label: string
  page: Page
  title: string
}> = [
  {
    description: 'Ask focused training questions and inspect the research passages behind every answer.',
    icon: MessageSquareText,
    label: 'Open research',
    page: 'chat',
    title: 'Research a decision',
  },
  {
    description: 'Turn a performance goal and your training context into a coherent seven-day plan.',
    icon: Dumbbell,
    label: 'Build a week',
    page: 'plan',
    title: 'Create a training week',
  },
  {
    description: 'Review your saved plan by day and keep the week visible as training unfolds.',
    icon: CalendarDays,
    label: 'View calendar',
    page: 'calendar',
    title: 'Review your schedule',
  },
]

export function HomePage({ onNavigate }: HomePageProps) {
  return (
    <main className="app-page">
      <PageHeader
        eyebrow="Arcel workspace"
        icon={Sparkles}
        title="Make the next training decision."
        description="Research a question, shape a balanced week, or review the plan you already saved."
      />

      <section aria-label="Training tools" className="grid gap-4 lg:grid-cols-3">
        {workspaces.map(({ description, icon: Icon, label, page, title }, index) => (
          <button
            key={page}
            type="button"
            onClick={() => onNavigate(page)}
            className={`panel panel-interactive group flex min-h-64 flex-col p-5 text-left sm:p-6 ${
              index === 0 ? 'lg:col-span-1' : ''
            }`}
          >
            <span className="grid h-10 w-10 place-items-center rounded-md border border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent)]">
              <Icon aria-hidden="true" size={20} strokeWidth={1.9} />
            </span>
            <div className="mt-auto pt-10">
              <h2 className="text-xl font-semibold text-[var(--text-h)]">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--text)]">{description}</p>
              <span className="mt-5 flex items-center gap-2 text-sm font-semibold text-[var(--accent)]">
                {label}
                <ArrowRight aria-hidden="true" size={16} className="transition group-hover:translate-x-1" />
              </span>
            </div>
          </button>
        ))}
      </section>

      <Panel className="mt-5 overflow-hidden">
        <div className="grid md:grid-cols-[13rem_1fr]">
          <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] p-5 md:border-b-0 md:border-r sm:p-6">
            <p className="page-eyebrow">The Arcel loop</p>
            <h2 className="text-lg font-semibold">Evidence into action</h2>
          </div>
          <ol className="grid list-none p-0 sm:grid-cols-3">
            {[
              ['01', 'Ask', 'Start with the decision that needs clarity.'],
              ['02', 'Build', 'Turn the evidence and your profile into a week.'],
              ['03', 'Review', 'Use the calendar to keep training in context.'],
            ].map(([number, title, description]) => (
              <li key={number} className="border-b border-[var(--border)] p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:p-6">
                <span className="font-mono text-xs font-semibold text-[var(--accent)]">{number}</span>
                <h3 className="mt-5 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6">{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </Panel>
    </main>
  )
}
