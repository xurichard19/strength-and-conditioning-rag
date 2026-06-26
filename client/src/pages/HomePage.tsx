import type { Page } from "../types"

type HomePageProps = {
    onNavigate: (page: Page) => void
}

export function HomePage({ onNavigate }: HomePageProps) {
    return (
        <main className="mx-auto min-h-[calc(100vh-4.25rem)] max-w-5xl px-4 py-8 text-left text-[var(--text)] sm:px-6 lg:px-8">
            <section className="grid min-h-[calc(100vh-10rem)] items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
                <div>
                    <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-h)]">
                        Hybrid athlete research workspace
                    </p>
                    <h1 className="m-0 text-5xl font-semibold tracking-normal text-[var(--text-h)] sm:text-6xl">
                        Shingo
                    </h1>
                    <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--text-h)]">
                        Turn strength, endurance, and recovery questions into research-backed training decisions for concurrent performance.
                    </p>

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <button
                            type="button"
                            onClick={() => onNavigate("chat")}
                            className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                        >
                            Ask research
                        </button>
                        <button
                            type="button"
                            onClick={() => onNavigate("plan")}
                            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-5 py-3 text-sm font-semibold text-[var(--text-h)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
                        >
                            Build week
                        </button>
                    </div>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--social-bg)] p-5 shadow-[var(--shadow)]">
                    <div className="grid gap-4">
                        <button
                            type="button"
                            onClick={() => onNavigate("chat")}
                            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 text-left transition hover:border-[var(--accent-border)]"
                        >
                            <h2 className="m-0 text-lg font-semibold text-[var(--text-h)]">Evidence insights</h2>
                            <p className="mt-2 text-sm leading-6 text-[var(--text)]">
                                Search the training literature library and review the source excerpts behind each answer.
                            </p>
                        </button>

                        <button
                            type="button"
                            onClick={() => onNavigate("plan")}
                            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 text-left transition hover:border-[var(--accent-border)]"
                        >
                            <h2 className="m-0 text-lg font-semibold text-[var(--text-h)]">Hybrid training week</h2>
                            <p className="mt-2 text-sm leading-6 text-[var(--text)]">
                                Balance lifting, conditioning, sport work, and recovery around your goals and constraints.
                            </p>
                        </button>
                    </div>
                </div>
            </section>
        </main>
    )
}
