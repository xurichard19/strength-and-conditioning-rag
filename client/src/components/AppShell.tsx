import type { ReactNode } from 'react'
import { BookOpenCheck, BrainCircuit, Dumbbell } from 'lucide-react'

type AppShellProps = {
  children: ReactNode
}

const benefits = [
  { icon: BookOpenCheck, text: 'Research-backed answers with inspectable sources' },
  { icon: BrainCircuit, text: 'Context-aware guidance for concurrent training' },
  { icon: Dumbbell, text: 'Weekly planning shaped around your profile' },
]

export function AppShell({ children }: AppShellProps) {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-4.5rem)] w-full max-w-6xl items-center gap-8 px-4 py-10 text-left sm:gap-12 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,1fr)_27rem] lg:px-8">
      <section className="max-w-2xl">
        <p className="page-eyebrow">Hybrid performance intelligence</p>
        <h1 className="page-title max-w-xl">Train with the whole week in view.</h1>
        <p className="page-description">
          Arcel connects strength, endurance, recovery, and real training constraints to help you make better performance decisions.
        </p>
        <div className="mt-8 hidden gap-3 sm:grid">
          {benefits.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 text-sm font-medium text-[var(--text)]">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)]">
                <Icon aria-hidden="true" size={16} />
              </span>
              {text}
            </div>
          ))}
        </div>
      </section>

      <div className="w-full">{children}</div>
    </main>
  )
}
