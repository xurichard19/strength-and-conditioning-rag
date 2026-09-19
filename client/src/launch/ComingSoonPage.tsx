import { ArrowDown, ArrowRight, ArrowUpRight, Check, Plus } from 'lucide-react'
import appIcon from '../../../mobile/assets/images/splash-icon.png'
import trainingHero from '../assets/training-hero.webp'
import richardPortrait from '../assets/richard-xu.jpg'
import dimitriosPortrait from '../assets/dimitrios-mahairas.jpg'
import aaronPortrait from '../assets/aaron-jiang.jpg'
import { LaunchFooter } from './LaunchFooter'
import TrainingCalendarPreview from './TrainingCalendarPreview'
import './LandingPage.css'

const questions = [
  {
    question: 'Who is it for?',
    answer: 'Arcel is being built for hybrid athletes balancing strength, conditioning, and sport. Your goals, training experience, available equipment, and weekly commitments are the starting point for your program.',
  },
  {
    question: 'How does it adapt?',
    answer: 'The rolling-programming design uses changes in your schedule, readiness, and recorded performance to reconsider upcoming sessions. Regular planning extends the calendar forward, while chat helps you communicate changes and understand recommendations. Automatic adjustments are still in development.',
  },
  {
    question: 'What stays in my history?',
    answer: 'Completed workouts and recorded results are designed to stay intact when future sessions change. The aim is to keep both the original prescription and what you actually did, with a clear explanation of what changes next.',
  },
  {
    question: 'When can I try it?',
    answer: 'The mobile app is in development, with an App Store release planned. There is no confirmed launch date yet. The examples on this page illustrate the experience we’re building; they are not a live training service.',
  },
]

const sampleExercises = [
  { name: 'Back squat', target: '3 × 5', result: '5 / 5 / 5' },
  { name: 'Romanian deadlift', target: '3 × 8', result: '8 / 8 / 8' },
  { name: 'Split squat', target: '2 × 8', result: '8 / 8' },
]

export function ComingSoonPage() {
  return (
    <div className="arcel-landing">
      <a className="landing-skip" href="#main-content">Skip to content</a>
      <header className="landing-nav landing-container">
        <a className="landing-wordmark" href="/" aria-label="Arcel home">
          <img src={appIcon} width="36" height="36" alt="" />
          <span>Arcel</span>
        </a>
        <nav aria-label="Main navigation">
          <a className="landing-nav-link" href="/about">About us <ArrowUpRight size={16} aria-hidden="true" /></a>
        </nav>
      </header>

      <main id="main-content">
        <section className="landing-hero" aria-labelledby="landing-title">
          <img className="landing-hero-image" src={trainingHero} width="1672" height="941" alt="" fetchPriority="high" />
          <div className="landing-hero-shade" aria-hidden="true" />
          <div className="landing-hero-content landing-container">
            <div className="landing-hero-copy">
              <p className="landing-hero-intro">Strength &amp; conditioning, built around you.</p>
              <h1 id="landing-title">Training evolves.<span>Your plan should too.</span></h1>
              <p className="landing-hero-description">
                Your sport. Your schedule. Your next session. We’re building
                research-informed training that moves with your life—and keeps
                your long-term goal in sight.
              </p>
              <a className="landing-button" href="#the-plan">Explore the plan <ArrowDown size={18} aria-hidden="true" /></a>
              <p className="landing-release"><span aria-hidden="true" /> Mobile app in development</p>
            </div>
            <div className="landing-hero-bottom">
              <p>Strength. Conditioning.<br className="landing-mobile-break" /> Room for life.</p>
              <span>A longer view of training <ArrowDown size={16} aria-hidden="true" /></span>
            </div>
          </div>
        </section>

        <section className="landing-thesis landing-container" aria-labelledby="thesis-title">
          <h2 id="thesis-title">A training plan should fit your life.<br /><span>And still move you forward.</span></h2>
          <p>A late meeting. An extra match. A session that felt harder than expected.
            Progress depends on what happens next. Arcel is being built to connect
            the plan with the person following it.</p>
        </section>

        <section className="landing-plan-band" id="the-plan" aria-labelledby="plan-title">
          <div className="landing-plan landing-container">
            <div className="landing-plan-copy">
              <h2 id="plan-title">Life changes.<br />The goal stays.</h2>
              <p>See one training week respond to one new commitment.
                Add a Wednesday sport session, make room to recover,
                and move the next strength session forward.</p>
              <p className="landing-plan-principle"><Check size={18} aria-hidden="true" /> The work you’ve done stays yours.</p>
              <p className="landing-caption">An illustrative look at rolling programming.<br />Automatic adjustments are still in development.</p>
            </div>
            <TrainingCalendarPreview />
          </div>
        </section>

        <section className="landing-workflow landing-container" aria-labelledby="workflow-title">
          <h2 id="workflow-title">Built around the whole athlete.</h2>
          <p className="landing-section-lede">From the goal you set to the last set you log.</p>
          <article className="landing-workflow-row">
            <div className="landing-context-visual" aria-label="Illustrative athlete profile">
              <div className="landing-visual-heading"><span>Your starting point</span><span className="landing-example">Example</span></div>
              <p className="landing-context-goal">Build strength.<br /><span>Keep running.</span></p>
              <dl className="landing-context-data">
                <div><dt>Training focus</dt><dd>Strength + conditioning</dd></div>
                <div><dt>Time to train</dt><dd>Four sessions a week</dd></div>
                <div><dt>Other commitments</dt><dd>Wednesday football</dd></div>
                <div><dt>Equipment</dt><dd>Full gym access</dd></div>
              </dl>
              <p className="landing-context-note">A plan starts with your context.</p>
            </div>
            <div className="landing-workflow-copy">
              <h3>Your goals.<br />Your starting point.</h3>
              <p>Training has to make sense for you. Arcel brings your goals,
                experience, equipment, and sport commitments into the same picture.</p>
              <p>Relevant strength and conditioning research helps inform the plan.
                Your context gives it direction.</p>
              <a className="landing-text-link" href="/about">Our approach to programming <ArrowUpRight size={17} aria-hidden="true" /></a>
            </div>
          </article>
          <article className="landing-workflow-row">
            <div className="landing-session-visual" aria-label="Illustrative completed workout">
              <div className="landing-visual-heading"><span>Monday · Strength A</span><span className="landing-completed"><Check size={14} aria-hidden="true" /> Completed</span></div>
              <p className="landing-session-title">The plan. The work.</p>
              <p className="landing-session-intro">Both belong in your training history.</p>
              <table>
                <caption className="landing-sr-only">Example workout showing prescribed sets and recorded reps</caption>
                <thead><tr><th scope="col">Exercise</th><th scope="col">Planned</th><th scope="col">Recorded</th></tr></thead>
                <tbody>{sampleExercises.map((exercise) => (
                  <tr key={exercise.name}><th scope="row">{exercise.name}</th><td>{exercise.target}</td><td>{exercise.result}</td></tr>
                ))}</tbody>
              </table>
              <div className="landing-history-note"><Check size={16} aria-hidden="true" /><p>Saved in your history.<span>Future changes leave this session intact.</span></p></div>
              <p className="landing-caption">Illustrative workout record</p>
            </div>
            <div className="landing-workflow-copy">
              <h3>A clear next session.<br />A lasting training record.</h3>
              <p>Know what’s on the calendar: the workout, the exercises, and the
                set targets. Then record what actually happened.</p>
              <p>As upcoming sessions evolve, your completed work stays intact.
                Chat is being built to help explain recommendations and communicate
                what’s changed.</p>
            </div>
          </article>
        </section>

        <section className="landing-about-band" aria-labelledby="people-title">
          <div className="landing-about landing-container">
            <div className="landing-people">
              <div className="landing-portraits">
                <img src={richardPortrait} width="80" height="96" alt="Richard Xu" loading="lazy" />
                <img src={dimitriosPortrait} width="80" height="96" alt="Dimitrios Mahairas" loading="lazy" />
                <img src={aaronPortrait} width="80" height="96" alt="Aaron Jiang" loading="lazy" />
              </div>
              <p>Richard, Dimitrios &amp; Aaron<br /><span>The people building Arcel</span></p>
            </div>
            <div className="landing-about-copy">
              <h2 id="people-title">A longer view.<br />From a small team.</h2>
              <p>We’re building a place for training research, practical programming,
                and the reality of an athlete’s week to come together.</p>
              <a className="landing-text-link" href="/about">Meet the team <ArrowUpRight size={17} aria-hidden="true" /></a>
            </div>
          </div>
        </section>

        <section className="landing-faq landing-container" aria-labelledby="questions-title">
          <div className="landing-faq-heading"><h2 id="questions-title">A few things<br />you might be wondering.</h2><p>About the plan, the product, and what’s next.</p></div>
          <div className="landing-disclosures">
            {questions.map(({ question, answer }) => (
              <details className="landing-disclosure" key={question} name="arcel-questions">
                <summary>{question}<Plus size={19} aria-hidden="true" /></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="landing-close landing-container" aria-labelledby="close-title">
          <div><h2 id="close-title">Keep your goal.<br /><span>Make room for life.</span></h2><p>Arcel. A longer view of strength &amp; conditioning.</p></div>
          <a className="landing-button landing-button-outline" href="#the-plan">Explore the plan <ArrowRight size={18} aria-hidden="true" /></a>
        </section>
      </main>
      <div className="landing-container"><LaunchFooter /></div>
    </div>
  )
}
