import { useEffect } from 'react'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { pageContent } from '../pages/info-content'
import { getPathForPage, type InfoPageName } from '../routing'
import appIcon from '../../../mobile/assets/images/splash-icon.png'
import AboutPage from './AboutPage'
import { LaunchFooter } from './LaunchFooter'
import './LandingPage.css'
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
    <div className="arcel-landing arcel-policy">
      <a className="landing-skip" href="#main-content">Skip to content</a>
      <header className="landing-nav landing-container">
        <a className="landing-wordmark" href="/" aria-label="Arcel home">
          <img src={appIcon} width="36" height="36" alt="" />
          <span>Arcel</span>
        </a>
        <nav aria-label="Main navigation">
          <a className="landing-nav-link" href="/"><ArrowLeft size={16} aria-hidden="true" /> Back to home</a>
        </nav>
      </header>
      <main className="policy-main landing-container" id="main-content">
        <header className="policy-hero">
          <p className="policy-category">{content.eyebrow} & information</p>
          <h1>{content.title}</h1>
          <p className="policy-description">{descriptions[page]}</p>
        </header>
        <div className="policy-layout">
          <aside className="policy-sidebar">
            <p className="policy-nav-label" id="policy-navigation-heading">The details</p>
            <nav aria-labelledby="policy-navigation-heading">
              {policyLinks.map(link => (
                <a key={link.page} href={getPathForPage(link.page)} aria-current={link.page === page ? 'page' : undefined}>
                  {link.label}<ArrowUpRight size={16} aria-hidden="true" />
                </a>
              ))}
            </nav>
          </aside>
          <div className="policy-sections">
            <aside className="policy-draft-note" aria-labelledby="policy-draft-heading">
              <p id="policy-draft-heading">Draft content</p>
              <p>These policies are being prepared for launch. The placeholder text below is not final.</p>
            </aside>
            {content.sections.map((section, index) => (
              <section className="policy-section" key={section.heading} aria-labelledby={`policy-section-${index}`}>
                <h2 id={`policy-section-${index}`}>{section.heading}</h2>
                <p>{section.body}</p>
              </section>
            ))}
          </div>
        </div>
      </main>
      <div className="landing-container"><LaunchFooter currentPage={page} /></div>
    </div>
  )
}
