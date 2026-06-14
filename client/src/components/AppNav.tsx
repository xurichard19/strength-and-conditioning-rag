import { useState } from "react"
import type { Page } from "../types"

type AppNavProps = {
    currentPage: Page
    onNavigate: (page: Page) => void
}

export function AppNav({ currentPage, onNavigate }: AppNavProps) {
    const [isOpen, setIsOpen] = useState(false)

    const navigate = (page: Page) => {
        onNavigate(page)
        setIsOpen(false)
    }

    return (
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
                <button
                    type="button"
                    onClick={() => navigate("home")}
                    className="text-left text-lg font-semibold text-[var(--text-h)]"
                >
                    Shingo
                </button>

                <nav className="hidden items-center gap-2 sm:flex">
                    <button
                        type="button"
                        onClick={() => navigate("home")}
                        className={`rounded-md px-3 py-2 text-sm font-semibold transition ${currentPage === "home"
                            ? "bg-[var(--accent-bg)] text-[var(--accent)]"
                            : "text-[var(--text)] hover:text-[var(--text-h)]"
                            }`}
                    >
                        Home
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate("chat")}
                        className={`rounded-md px-3 py-2 text-sm font-semibold transition ${currentPage === "chat"
                            ? "bg-[var(--accent-bg)] text-[var(--accent)]"
                            : "text-[var(--text)] hover:text-[var(--text-h)]"
                            }`}
                    >
                        Chat
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate("plan")}
                        className={`rounded-md px-3 py-2 text-sm font-semibold transition ${currentPage === "plan"
                            ? "bg-[var(--accent-bg)] text-[var(--accent)]"
                            : "text-[var(--text)] hover:text-[var(--text-h)]"
                            }`}
                    >
                        Plan
                    </button>
                </nav>

                <button
                    type="button"
                    aria-label="Open navigation menu"
                    aria-expanded={isOpen}
                    onClick={() => setIsOpen((open) => !open)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-h)] sm:hidden"
                >
                    <span className="flex w-5 flex-col gap-1.5">
                        <span className="h-0.5 rounded bg-current" />
                        <span className="h-0.5 rounded bg-current" />
                        <span className="h-0.5 rounded bg-current" />
                    </span>
                </button>
            </div>

            {isOpen && (
                <nav className="mx-auto mt-3 grid max-w-5xl gap-2 sm:hidden">
                    <button
                        type="button"
                        onClick={() => navigate("home")}
                        className={`rounded-md px-3 py-2 text-left text-sm font-semibold ${currentPage === "home"
                            ? "bg-[var(--accent-bg)] text-[var(--accent)]"
                            : "text-[var(--text-h)]"
                            }`}
                    >
                        Home
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate("chat")}
                        className={`rounded-md px-3 py-2 text-left text-sm font-semibold ${currentPage === "chat"
                            ? "bg-[var(--accent-bg)] text-[var(--accent)]"
                            : "text-[var(--text-h)]"
                            }`}
                    >
                        Chat
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate("plan")}
                        className={`rounded-md px-3 py-2 text-left text-sm font-semibold ${currentPage === "plan"
                            ? "bg-[var(--accent-bg)] text-[var(--accent)]"
                            : "text-[var(--text-h)]"
                            }`}
                    >
                        Plan
                    </button>
                </nav>
            )}
        </header>
    )
}
