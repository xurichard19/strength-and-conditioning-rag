import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react'
import { pageContent, teamIntroductions, technologyGroups } from '../pages/info-content'
import appIcon from '../../../mobile/assets/images/splash-icon.png'
import richardPortrait from '../assets/richard-xu.jpg'
import dimitriosPortrait from '../assets/dimitrios-mahairas.jpg'
import aaronPortrait from '../assets/aaron-jiang.jpg'
import { LaunchFooter } from './LaunchFooter'
import TechnologyDiagram from './TechnologyDiagram'
import './LandingPage.css'
import './AboutPage.css'

const portraits: Record<string, string> = {
  'rick xu': richardPortrait,
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
          <h1>Making training research<br /><span>useful in your week.</span></h1>
          <div className="about-intro-bottom">
            <p>Arcel brings strength and conditioning research into the decisions
              behind your training. We’re building a calendar that gives your
              workouts structure, with chat to help you understand the plan
              and explain what needs to change.</p>
            <nav className="about-contents" aria-label="On this page">
              <a href="#our-approach">Our approach <ArrowDown size={16} aria-hidden="true" /></a>
              <a href="#our-team">Our team <ArrowDown size={16} aria-hidden="true" /></a>
              <a href="#under-the-hood">Our technology <ArrowDown size={16} aria-hidden="true" /></a>
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
        </section>

        <section className="about-team-band" id="our-team" aria-labelledby="team-heading">
          <div className="landing-container">
            <div className="about-section-heading">
              <h2 id="team-heading">Our team</h2>
              <p>We’re the team designing the training experience and building the systems behind it.</p>
            </div>
            <div className="about-team-grid">
              {teamIntroductions.map(person => (
                <article className="about-person" key={person.name}>
                  <img className="about-portrait" src={portraits[person.name]}
                    alt={displayName(person.name)} width="80" height="80" loading="lazy" />
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
            <h2 id="technology-heading">Our technology</h2>
            <p>Behind the app, AI workflows connect your training context with relevant research. Explore how those systems work together.</p>
          </div>
          <TechnologyDiagram />
          <div className="about-stack">
            {technologyGroups.map(group => (
              <article className="about-stack-item" key={group.heading}>
                <h3>{group.heading}</h3>
                <p>{group.body}</p>
              </article>
            ))}
          </div>
          <p className="about-release"><span aria-hidden="true" />We’re developing Arcel for iPhone and plan to release it on the App Store.</p>
        </section>

        <section className="landing-close about-close landing-container" aria-labelledby="about-close-title">
          <div><h2 id="about-close-title">See a sample training week</h2>
            <p>Explore how strength work and sport sessions come together in the calendar we’re building.</p></div>
          <a className="landing-button landing-button-outline" href="/">View the preview <ArrowRight size={18} aria-hidden="true" /></a>
        </section>
      </main>
      <div className="landing-container"><LaunchFooter currentPage="about" /></div>
    </div>
  )
}
