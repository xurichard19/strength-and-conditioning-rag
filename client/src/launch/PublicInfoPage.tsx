import { useEffect } from 'react'
import { ArrowLeft, ArrowUpRight, BookOpen, Code2, History, Layers, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { architectureSteps, pageContent, teamIntroductions, technologyGroups } from '../pages/info-content'
import { getPathForPage, type InfoPageName } from '../routing'
import appIcon from '../../../mobile/assets/images/splash-icon.png'
import linkedinLogo from '../assets/linkedinlogo.png'
import richardPortrait from '../assets/richard-xu.jpg'
import dimitriosPortrait from '../assets/dimitrios-mahairas.jpg'
import aaronPortrait from '../assets/aaron-jiang.jpg'
import { LaunchFooter } from './LaunchFooter'
import './ComingSoonPage.css'
import './PublicInfoPage.css'

const descriptions: Record<InfoPageName, string> = {
  about: 'Research-backed planning is the core of Arcel. We’re building an actionable training calendar that evolves with you, supported by chat to help you understand your training and communicate what’s changed.',
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

const purposeIcons = [BookOpen, RefreshCw, Sparkles, History]

const teamPortraits: Record<string, string | undefined> = {
  'richard xu': richardPortrait,
  'dimitrios mahairas': dimitriosPortrait,
  'aaron jiang': aaronPortrait,
}

export default function PublicInfoPage({ page }: { page: InfoPageName }) {
  const content = pageContent[page]
  const isAbout = page === 'about'

  useEffect(() => {
    document.title = `${content.title} — Arcel`
  }, [content.title])

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
          {!isAbout && <div className="hero-kicker">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>{content.eyebrow} & information</span>
          </div>}
          <h1>{isAbout ? <>Training evolves.<br /><span>Your program should too.</span></> : content.title}</h1>
          <p>{descriptions[page]}</p>
        </header>
        {isAbout ? (
          <>
            <section className="info-purpose-grid" aria-label="About Arcel">
              {content.sections.map((section, index) => {
                const Icon = purposeIcons[index % purposeIcons.length]
                return (
                <article className="info-surface purpose-card" key={section.heading}>
                  <span className={`info-icon info-icon-${index % 3}`} aria-hidden="true"><Icon size={22} /></span>
                  <h2>{section.heading}</h2><p>{section.body}</p>
                </article>
                )
              })}
            </section>
            <div className="info-development-note"><Code2 size={19} aria-hidden="true" /><p>Rolling programming is in development. Automatic refresh and adjustment generation are not live yet; the mobile planning screens are previews.</p></div>
            <section className="info-section" aria-labelledby="team-heading">
              <div className="info-section-heading"><h2 id="team-heading">Our team</h2></div>
              <div className="info-team-grid">
                {teamIntroductions.map((person, index) => (
                  <article className="info-surface team-card" key={person.name}>
                    <div className="team-card-top">
                      {teamPortraits[person.name] ? (
                        <img className="team-portrait" src={teamPortraits[person.name]} alt={person.name} width={80} height={80} loading="lazy" />
                      ) : (
                        <span className={`team-monogram info-icon-${index}`} aria-hidden="true">{person.name.split(' ').map(part => part[0]).join('')}</span>
                      )}
                      <a href={person.linkedinUrl} target="_blank" rel="noreferrer" aria-label={`${person.name} on LinkedIn`}><span className="team-linkedin-logo"><img src={linkedinLogo} alt="" /></span></a>
                    </div>
                    <h3>{person.name}</h3><p>{person.body.replaceAll('/', ' / ')}</p>
                  </article>
                ))}
              </div>
            </section>
            <section className="info-section" aria-labelledby="technology-heading">
              <div className="info-section-heading"><span>02 / Under the hood</span><h2 id="technology-heading">From research to your next session.</h2></div>
              <div className="info-surface architecture-card">
                <div className="architecture-intro"><Layers size={22} aria-hidden="true" /><p>A mobile app, a research pipeline, and a backend built to bring them together.</p></div>
                <ol className="architecture-flow" aria-label="Request flow from the mobile app to research tools">
                  {architectureSteps.map((step, index) => <li key={step.label}><span className="architecture-step">0{index + 1} / {step.label}</span><strong>{step.detail}</strong></li>)}
                </ol>
                <p className="architecture-note">Chat gathers evidence before streaming an answer. The backend planning workflow first refines the request, then searches and generates a structured workout plan.</p>
              </div>
              <div className="info-stack-grid">
                {technologyGroups.map((group, index) => <article className="info-surface stack-card" key={group.heading}><span className="stack-number" aria-hidden="true">0{index + 1}</span><h3>{group.heading}</h3><p>{group.body}</p></article>)}
              </div>
              <div className="info-development-note"><Code2 size={19} aria-hidden="true" /><p>Arcel for iPhone is in development. Coming to the App Store soon.</p></div>
            </section>
          </>
        ) : (
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
        )}
      </main>
      <div className="launch-shell info-footer-wrap"><LaunchFooter currentPage={page} /></div>
    </div>
  )
}
