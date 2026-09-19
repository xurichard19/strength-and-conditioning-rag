import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react'
import { architectureSteps, pageContent, teamIntroductions, technologyGroups } from '../pages/info-content'
import appIcon from '../../../mobile/assets/images/splash-icon.png'
import richardPortrait from '../assets/richard-xu.jpg'
import dimitriosPortrait from '../assets/dimitrios-mahairas.jpg'
import aaronPortrait from '../assets/aaron-jiang.jpg'
import { LaunchFooter } from './LaunchFooter'
import './LandingPage.css'
import './AboutPage.css'

const portraits: Record<string, string> = {
  'richard xu': richardPortrait,
  'dimitrios mahairas': dimitriosPortrait,
  'aaron jiang': aaronPortrait,
}

function displayName(name: string) {
  return name.replace(/\b\w/g, letter => letter.toUpperCase())
}

export default function AboutPage() {
  return (
    <div className="arcel-landing arcel-about">
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

      <main id="main-content">
        <header className="about-intro landing-container">
          <p className="about-page-label">About Arcel</p>
          <h1>Training evolves.<br /><span>So should your program.</span></h1>
          <div className="about-intro-bottom">
            <p>Research-backed planning is the core of Arcel. We’re building an
              actionable training calendar that evolves with you, supported by
              chat to help you understand your training and communicate what’s changed.</p>
            <nav className="about-contents" aria-label="On this page">
              <a href="#our-approach">Our approach <ArrowDown size={16} aria-hidden="true" /></a>
              <a href="#our-team">Our team <ArrowDown size={16} aria-hidden="true" /></a>
              <a href="#under-the-hood">Under the hood <ArrowDown size={16} aria-hidden="true" /></a>
            </nav>
          </div>
        </header>

        <section className="about-approach landing-container" id="our-approach" aria-label="Our approach to programming">
          {pageContent.about.sections.map(section => (
            <article className="about-principle" key={section.heading}>
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
            </article>
          ))}
          <aside className="about-development" aria-label="Development status">
            <p className="about-development-title">What we’re building toward</p>
            <p>Rolling programming is in development. Automatic refresh and adjustment
              generation are not live yet; the mobile planning screens are previews.</p>
          </aside>
        </section>

        <section className="about-team-band" id="our-team" aria-labelledby="team-heading">
          <div className="landing-container">
            <div className="about-section-heading">
              <h2 id="team-heading">Our team.</h2>
              <p>The people bringing training research, practical programming,
                and the reality of an athlete’s week together.</p>
            </div>
            <div className="about-team-grid">
              {teamIntroductions.map(person => (
                <article className="about-person" key={person.name}>
                  <img className="about-portrait" src={portraits[person.name]}
                    alt={displayName(person.name)} width="600" height="600" loading="lazy" />
                  <div className="about-person-info">
                    <h3>{displayName(person.name)}</h3>
                    <p>{person.body.replaceAll('/', ' / ')}</p>
                    <a className="landing-text-link" href={person.linkedinUrl}
                      target="_blank" rel="noreferrer" aria-label={`${displayName(person.name)} on LinkedIn (opens in a new tab)`}>
                      LinkedIn <ArrowUpRight size={16} aria-hidden="true" />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="about-technology landing-container" id="under-the-hood" aria-labelledby="technology-heading">
          <div className="about-section-heading">
            <h2 id="technology-heading">From research to<br />your next session.</h2>
            <p>A mobile app, a research pipeline, and a backend built to bring them together.</p>
          </div>
          <div className="about-architecture">
            <h3>How it connects</h3>
            <ol className="about-flow" aria-label="Request flow from the mobile app to research tools">
              {architectureSteps.map((step, index) => (
                <li key={step.label}>
                  <div className="about-flow-label"><span>{step.label}</span>
                    {index < architectureSteps.length - 1 && <ArrowRight size={18} aria-hidden="true" />}
                  </div>
                  <p>{step.detail}</p>
                </li>
              ))}
            </ol>
            <p className="about-architecture-note">Chat gathers evidence before streaming an answer.
              The backend planning workflow first refines the request, then searches and
              generates a structured workout plan.</p>
          </div>
          <div className="about-stack">
            {technologyGroups.map(group => (
              <article className="about-stack-item" key={group.heading}>
                <h3>{group.heading}</h3>
                <p>{group.body}</p>
              </article>
            ))}
          </div>
          <p className="about-release"><span aria-hidden="true" />Arcel for iPhone is in development. An App Store release is planned.</p>
        </section>

        <section className="landing-close about-close landing-container" aria-labelledby="about-close-title">
          <div><h2 id="about-close-title">A longer view.<br /><span>Built around you.</span></h2>
            <p>See how these ideas come together in a training week.</p></div>
          <a className="landing-button landing-button-outline" href="/">Explore Arcel <ArrowRight size={18} aria-hidden="true" /></a>
        </section>
      </main>
      <div className="landing-container"><LaunchFooter currentPage="about" /></div>
    </div>
  )
}
