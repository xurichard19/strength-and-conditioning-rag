import { useEffect, useRef, useState } from "react"
import type { Page } from "../types"

type AppNavProps = {
    currentPage: Page
    userEmail?: string | null
    onNavigate: (page: Page) => void
    onLogin?: () => void
    onSignOut?: () => void
}

export function AppNav({ currentPage, userEmail, onNavigate, onLogin, onSignOut }: AppNavProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
    const userMenuRef = useRef<HTMLDivElement | null>(null)
    const isAuthenticated = Boolean(onSignOut)

    useEffect(() => {
        if (!isUserMenuOpen) return

        const handlePointerDown = (event: PointerEvent) => {
            if (!userMenuRef.current?.contains(event.target as Node)) {
                setIsUserMenuOpen(false)
            }
        }

        document.addEventListener("pointerdown", handlePointerDown)
        return () => document.removeEventListener("pointerdown", handlePointerDown)
    }, [isUserMenuOpen])

    const navigate = (page: Page) => {
        onNavigate(page)
        setIsOpen(false)
        setIsUserMenuOpen(false)
    }

    const handleSignOut = () => {
        setIsOpen(false)
        setIsUserMenuOpen(false)
        onSignOut?.()
    }

    const handleLogin = () => {
        setIsOpen(false)
        setIsUserMenuOpen(false)
        onLogin?.()
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

                <div className="flex items-center gap-2">
                    {isAuthenticated && (
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
                            <button
                                type="button"
                                onClick={() => navigate("calendar")}
                                className={`rounded-md px-3 py-2 text-sm font-semibold transition ${currentPage === "calendar"
                                    ? "bg-[var(--accent-bg)] text-[var(--accent)]"
                                    : "text-[var(--text)] hover:text-[var(--text-h)]"
                                    }`}
                            >
                                Calendar
                            </button>
                        </nav>
                    )}

                    <div ref={userMenuRef} className="relative">
                        <button
                            type="button"
                            aria-label="Open user menu"
                            aria-expanded={isUserMenuOpen}
                            onClick={() => setIsUserMenuOpen((open) => !open)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--social-bg)] text-[var(--text-h)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                            <span className="relative block h-5 w-5">
                                <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-current" />
                                <span className="absolute bottom-0 left-1/2 h-2.5 w-4 -translate-x-1/2 rounded-t-full border-2 border-current border-b-0" />
                            </span>
                        </button>

                        {isUserMenuOpen && (
                            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)] shadow-[var(--shadow)]">
                                {userEmail && (
                                    <div className="border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--text)]">
                                        <span className="block truncate">{userEmail}</span>
                                    </div>
                                )}
                                {isAuthenticated ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => navigate("settings")}
                                            className={`block w-full px-4 py-3 text-left text-sm font-semibold transition ${currentPage === "settings"
                                                ? "bg-[var(--accent-bg)] text-[var(--accent)]"
                                                : "text-[var(--text-h)] hover:bg-[var(--social-bg)]"
                                                }`}
                                        >
                                            Settings
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSignOut}
                                            className="block w-full px-4 py-3 text-left text-sm font-semibold text-[var(--text-h)] transition hover:bg-[var(--social-bg)]"
                                        >
                                            Sign out
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleLogin}
                                        className="block w-full px-4 py-3 text-left text-sm font-semibold text-[var(--text-h)] transition hover:bg-[var(--social-bg)]"
                                    >
                                        Log in
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {isAuthenticated && (
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
                    )}
                </div>
            </div>

            {isAuthenticated && isOpen && (
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
                    <button
                        type="button"
                        onClick={() => navigate("calendar")}
                        className={`rounded-md px-3 py-2 text-left text-sm font-semibold ${currentPage === "calendar"
                            ? "bg-[var(--accent-bg)] text-[var(--accent)]"
                            : "text-[var(--text-h)]"
                            }`}
                    >
                        Calendar
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate("settings")}
                        className={`rounded-md px-3 py-2 text-left text-sm font-semibold ${currentPage === "settings"
                            ? "bg-[var(--accent-bg)] text-[var(--accent)]"
                            : "text-[var(--text-h)]"
                            }`}
                    >
                        Settings
                    </button>
                </nav>
            )}
        </header>
    )
}
