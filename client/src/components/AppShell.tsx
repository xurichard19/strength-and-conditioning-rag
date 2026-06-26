import type { ReactNode } from 'react'

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-8 text-left text-[var(--text)] sm:px-6 lg:px-8">
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col justify-center">
        <header className="mb-8">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-h)]">
            Hybrid athlete research assistant
          </p>
          <h1 className="m-0 text-5xl font-semibold tracking-normal text-[var(--text-h)] sm:text-6xl">
            Shingo
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-h)]">
            Ask hybrid training questions and get evidence-backed answers from the document library.
          </p>
        </header>

        {children}
      </main>
    </div>
  )
}
