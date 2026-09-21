import { getPathForPage, type InfoPageName } from '../routing'

const links = [
  { page: 'about', label: 'About us' },
  { page: 'terms', label: 'Terms' },
  { page: 'privacy', label: 'Privacy Policy' },
  { page: 'health-privacy', label: 'Consumer Health Privacy' },
  { page: 'disclaimer', label: 'Disclaimer' },
  { page: 'accessibility', label: 'Accessibility' },
] as const

export function LaunchFooter({ currentPage }: { currentPage?: InfoPageName }) {
  return (
    <footer className="launch-footer">
      <span>© {new Date().getFullYear()} Arcel</span>
      <nav className="launch-footer-links" aria-label="Footer navigation">
        {links.map(({ page, label }) => (
          <a key={page} href={getPathForPage(page)} aria-current={currentPage === page ? 'page' : undefined}>
            {label}
          </a>
        ))}
      </nav>
      <span className="footer-note">Mobile app in development.</span>
    </footer>
  )
}
