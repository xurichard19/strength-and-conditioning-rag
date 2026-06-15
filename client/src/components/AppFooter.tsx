import type { Page } from "../types"

type FooterLink = {
    label: string
    page: Page
}

type AppFooterProps = {
    onNavigate: (page: Page) => void
}

const footerLinks: FooterLink[] = [
    { label: "About", page: "about" },
    { label: "Terms", page: "terms" },
    { label: "Privacy", page: "privacy" },
    { label: "Disclaimer", page: "disclaimer" },
    { label: "Accessibility", page: "accessibility" },
]

export function AppFooter({ onNavigate }: AppFooterProps) {
    return (
        <footer className="border-t border-[var(--border)] bg-[var(--bg)] px-4 py-6 text-sm text-[var(--text)] sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="m-0">© {new Date().getFullYear()} Shingo</p>
                <nav className="flex flex-wrap gap-x-4 gap-y-2">
                    {footerLinks.map((link) => (
                        <button
                            key={link.page}
                            type="button"
                            onClick={() => onNavigate(link.page)}
                            className="font-semibold text-[var(--text-h)] transition hover:text-[var(--accent)]"
                        >
                            {link.label}
                        </button>
                    ))}
                </nav>
            </div>
        </footer>
    )
}
