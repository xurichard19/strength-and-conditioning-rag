import type { Page } from '../routing'

type AppFooterProps = {
  onNavigate: (page: Page) => void
}

const footerLinks = [
  { label: 'About', page: 'about' },
  { label: 'Terms', page: 'terms' },
  { label: 'Privacy', page: 'privacy' },
  { label: 'Disclaimer', page: 'disclaimer' },
  { label: 'Accessibility', page: 'accessibility' },
] as const

export function AppFooter({ onNavigate }: AppFooterProps) {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-7 text-sm text-[var(--text)] sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-[var(--text-h)]">Arcel</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Evidence for the work that matters.</p>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-2">
          {footerLinks.map((link) => (
            <button
              key={link.page}
              type="button"
              onClick={() => onNavigate(link.page)}
              className="text-xs font-semibold text-[var(--text)] transition hover:text-[var(--accent)]"
            >
              {link.label}
            </button>
          ))}
        </nav>
        <p className="text-xs text-[var(--text-muted)]">© {new Date().getFullYear()} Arcel</p>
      </div>
    </footer>
  )
}
