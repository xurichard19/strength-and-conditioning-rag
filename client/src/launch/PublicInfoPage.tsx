import { useEffect } from 'react'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { pageContent } from '../pages/info-content'
import type { InfoContent, InfoSection } from '../pages/legal-content'
import { getPathForPage, type InfoPageName } from '../routing'
import appIcon from '../../../mobile/assets/images/splash-icon.png'
import AboutPage from './AboutPage'
import { LaunchFooter } from './LaunchFooter'
import './LandingPage.css'
import './PublicInfoPage.css'

const descriptions: Record<Exclude<InfoPageName, 'about'>, string> = {
  terms: 'Terms for using Arcel.',
  privacy: 'How Arcel handles your information and what you can request.',
  'health-privacy': 'How Arcel handles consumer health information and your privacy choices.',
  disclaimer: 'The limits of the training information Arcel provides.',
  accessibility: 'Accessibility at Arcel and how to report a problem.',
}

const policyLinks = [
  { page: 'terms', label: 'Terms of Service' },
  { page: 'privacy', label: 'Privacy Policy' },
  { page: 'health-privacy', label: 'Consumer Health Privacy' },
  { page: 'disclaimer', label: 'Fitness Disclaimer' },
  { page: 'accessibility', label: 'Accessibility' },
] as const

export default function PublicInfoPage({ page }: { page: InfoPageName }) {
  const content = pageContent[page]

  useEffect(() => {
    document.title = page === 'about' ? content.title : `${content.title} | Arcel`
    if (window.location.hash.startsWith('#policy-section-')) {
      const section = document.getElementById(window.location.hash.slice(1))
      section?.scrollIntoView()
      section?.focus({ preventScroll: true })
    }
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
          <p className="policy-description">{content.summary ?? descriptions[page]}</p>
          {content.updated && <p className="policy-updated">{content.updated}</p>}
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
            <PolicyContents content={content} />
          </aside>
          <div className="policy-sections">
            {content.status && (
              <aside className="policy-draft-note" aria-labelledby="policy-draft-heading">
                <p id="policy-draft-heading">Draft for review</p>
                <p>{content.status}</p>
              </aside>
            )}
            {content.sections.map((section, index) => <PolicySection key={section.heading} section={section} index={index} />)}
          </div>
        </div>
      </main>
      <div className="landing-container"><LaunchFooter currentPage={page} /></div>
    </div>
  )
}

function PolicyContents({ content }: { content: InfoContent }) {
  if (content.sections.length < 6) return null

  return (
    <details className="policy-contents">
      <summary>On this page</summary>
      <nav aria-label={`${content.title} sections`}>
        <ol>
          {content.sections.map((section, index) => (
            <li key={section.heading}>
              <a href={`#policy-section-${index + 1}`}>
                <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                {section.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  )
}

function PolicySection({ section, index }: { section: InfoSection; index: number }) {
  return (
    <section className="policy-section" aria-labelledby={`policy-section-${index + 1}`}>
      <h2 id={`policy-section-${index + 1}`} tabIndex={-1}>{section.heading}</h2>
      {section.body.split('\n\n').filter(Boolean).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
      {section.bullets && <ul>{section.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}</ul>}
      {section.links && <ul className="policy-related-links">{section.links.map(link => <li key={link.href}><a href={link.href}>{link.label}</a></li>)}</ul>}
    </section>
  )
}
