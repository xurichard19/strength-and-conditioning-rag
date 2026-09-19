import { useEffect } from 'react'
import { ArrowLeft, ArrowUpRight, ShieldCheck } from 'lucide-react'
import { pageContent } from '../pages/info-content'
import { getPathForPage, type InfoPageName } from '../routing'
import appIcon from '../../../mobile/assets/images/splash-icon.png'
import AboutPage from './AboutPage'
import { LaunchFooter } from './LaunchFooter'
import './ComingSoonPage.css'
import './PublicInfoPage.css'

const descriptions: Record<Exclude<InfoPageName, 'about'>, string> = {
  terms: 'The terms that shape your use of Arcel.',
  privacy: 'How information is handled, and the choices available to you.',
  disclaimer: 'A clear understanding of training information and its limits.',
  accessibility: 'A more usable experience, for more people.',
}

const policyLinks = [
  { page: 'terms', label: 'Terms of Service' },
  { page: 'privacy', label: 'Privacy Policy' },
  { page: 'disclaimer', label: 'Fitness Disclaimer' },
  { page: 'accessibility', label: 'Accessibility' },
] as const

export default function PublicInfoPage({ page }: { page: InfoPageName }) {
  const content = pageContent[page]

  useEffect(() => {
    document.title = page === 'about' ? content.title : `${content.title} — Arcel`
  }, [content.title, page])

  if (page === 'about') return <AboutPage />

  return (
    <div className="launch-page public-info">
      <div className="launch-wash launch-wash-blue" aria-hidden="true" />
      <div className="launch-wash launch-wash-violet" aria-hidden="true" />
      <div className="launch-grid" aria-hidden="true" />
      <header className="launch-shell launch-header">
        <a className="brand-lockup info-brand" href="/" aria-label="Arcel home">
          <span className="brand-icon-wrap"><img src={appIcon} alt="" className="brand-icon" /></span>
          <span className="brand-name">Arcel</span>
        </a>
        <a className="launch-back-link" href="/"><ArrowLeft size={16} aria-hidden="true" /> Back to home</a>
      </header>
      <main className="launch-shell info-main">
        <header className="info-hero">
          <div className="hero-kicker">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>{content.eyebrow} & information</span>
          </div>
          <h1>{content.title}</h1>
          <p>{descriptions[page]}</p>
        </header>
        <div className="policy-layout">
          <aside className="policy-sidebar">
            <p className="policy-nav-label">The details</p>
            <nav aria-label="Policy pages">{policyLinks.map(link => <a key={link.page} href={getPathForPage(link.page)} aria-current={link.page === page ? 'page' : undefined}>{link.label}<ArrowUpRight size={16} aria-hidden="true" /></a>)}</nav>
          </aside>
          <div className="policy-sections">
            <div className="policy-draft-note"><span>Draft content</span><p>These policies are being prepared for launch. The placeholder text below is not final.</p></div>
            {content.sections.map((section, index) => (
              <section className="info-surface policy-card" key={section.heading}><span className="policy-number" aria-hidden="true">0{index + 1}</span><div><h2>{section.heading}</h2><p>{section.body}</p></div></section>
            ))}
          </div>
        </div>
      </main>
      <div className="launch-shell info-footer-wrap"><LaunchFooter currentPage={page} /></div>
    </div>
  )
}
