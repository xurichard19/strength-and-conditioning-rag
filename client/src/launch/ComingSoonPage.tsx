import { ArrowDown, ArrowRight, ArrowUpRight, Check, Plus } from 'lucide-react'
import appIcon from '../../../mobile/assets/images/splash-icon.png'
import richardPortrait from '../assets/richard-xu.jpg'
import dimitriosPortrait from '../assets/dimitrios-mahairas.jpg'
import aaronPortrait from '../assets/aaron-jiang.jpg'
import { LaunchFooter } from './LaunchFooter'
import TrainingCalendarPreview from './TrainingCalendarPreview'
import PhonePreview from './PhonePreview'
import { useScrollReveal } from './useScrollReveal'
import './LandingPage.css'

const questions = [
  {
    question: 'Who is it for?',
    answer: 'We’re building Arcel for people who combine strength training with running or another sport. Your program starts with your goals and experience, the equipment you have, and the time you can train.',
  },
  {
    question: 'How does it adapt?',
    answer: 'Arcel plans three weeks ahead and refreshes the plan each week. Adding or removing a sports session triggers a review of upcoming workouts within your existing plan window. Redoing onboarding updates that same window using your new preferences. Adjustments for missed workouts, recovery, and recorded performance are still to come.',
  },
  {
    question: 'What can I see in Plans?',
    answer: 'Your overview shows planned coverage, weekly session counts, the next refresh, and any update in progress. Open the timeline to see earlier updates, their reasons, and the affected workouts before and after each change. Each entry shows the part of the plan that changed.',
  },
  {
    question: 'Can I ask questions about training?',
    answer: 'Open the chat bubble from any main screen for training questions. Expand it for a full conversation and your chat history. Choose Quick for a shorter response or Deep for a more thorough look, with sources when research or web evidence is used. Chat answers questions; it does not edit your plan.',
  },
  {
    question: 'When can I try it?',
    answer: 'We’re developing the mobile app and plan to release it on the App Store. We don’t have a launch date yet. The previews on this page use sample data to show features in the current development build.',
  },
]

const sampleExercises = [
  { name: 'Back squat', target: '3 × 5', rest: '2 min' },
  { name: 'Romanian deadlift', target: '3 × 8', rest: '2 min' },
  { name: 'Split squat', target: '2 × 8 / side', rest: '90 sec' },
]

export function ComingSoonPage() {
  const landingRef = useScrollReveal()

  return (
    <div className="arcel-landing" ref={landingRef}>
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
          <div className="landing-hero-content landing-container">
            <div className="landing-hero-main">
              <div className="landing-hero-copy">
                <p className="landing-hero-intro">Arcel · Strength and conditioning</p>
                <h1 id="landing-title">Train with purpose.<span>Plan for real life.</span></h1>
                <p className="landing-hero-description">
                  Three weeks of training, refreshed each week. Arcel brings research
                  into workouts shaped by your goals and sport schedule, with every
                  exercise ready to explore and plan updates you can follow.
                </p>
                <a className="landing-button" href="#the-plan">See how plans adapt <ArrowDown size={18} aria-hidden="true" /></a>
                <p className="landing-release"><span aria-hidden="true" /> Mobile app in development</p>
              </div>
              <div className="landing-hero-product"><PhonePreview /></div>
            </div>
            <div className="landing-hero-bottom">
              <p>Strength and conditioning for hybrid athletes.</p>
              <span>How Arcel works <ArrowDown size={16} aria-hidden="true" /></span>
            </div>
          </div>
        </section>

        <section className="landing-thesis landing-container" aria-labelledby="thesis-title">
          <h2 id="thesis-title" data-scroll-reveal>Keep your training moving<br /><span data-scroll-emphasis>when the week changes.</span></h2>
          <p data-scroll-reveal data-scroll-delay="100">An extra swim or a new boxing session changes the demands of your week.
            Add it to your calendar and Arcel reviews the upcoming training around it.
            Weekly refreshes extend the plan, while your overview and timeline keep
            the schedule and its changes easy to follow.</p>
        </section>

        <section className="landing-plan-band" id="the-plan" aria-labelledby="plan-title">
          <div className="landing-plan landing-container">
            <div className="landing-plan-copy" data-scroll-reveal data-scroll-delay="100">
              <h2 id="plan-title">A new session.<br />A revised week.</h2>
              <p>Add a sports session and Arcel reviews your upcoming workouts.
                Explore one possible adjustment: strength moves to Friday,
                leaving room after Wednesday’s swim.</p>
              <p className="landing-plan-principle"><Check size={18} aria-hidden="true" /> Follow the update in Plans.</p>
              <p className="landing-caption">Illustrative example.<br />Actual changes depend on your training context.</p>
            </div>
            <TrainingCalendarPreview />
          </div>
        </section>

        <section className="landing-workflow landing-container" aria-labelledby="workflow-title">
          <h2 id="workflow-title" data-scroll-reveal>From your goals to your next session</h2>
          <p className="landing-section-lede" data-scroll-reveal data-scroll-delay="100">Your starting point, a rolling plan, and the detail you need for each workout.</p>
          <article className="landing-workflow-row">
            <div className="landing-context-visual" aria-label="Illustrative athlete profile" data-scroll-reveal>
              <div className="landing-visual-heading"><span>Your training profile</span><span className="landing-example">Example</span></div>
              <p className="landing-context-goal">Get stronger while<br /><span>running regularly.</span></p>
              <dl className="landing-context-data">
                <div><dt>Training focus</dt><dd>Strength + conditioning</dd></div>
                <div><dt>Time to train</dt><dd>Four sessions a week</dd></div>
                <div><dt>Other commitments</dt><dd>Wednesday swimming</dd></div>
                <div><dt>Equipment</dt><dd>Full gym access</dd></div>
              </dl>
              <p className="landing-context-note">Example profile used to plan the week.</p>
            </div>
            <div className="landing-workflow-copy" data-scroll-reveal data-scroll-delay="100">
              <h3>Start with the athlete</h3>
              <p>Tell Arcel about your goals, experience, equipment, and time to train.
                Completing onboarding starts your first plan. Your sport commitments
                help shape the work around it.</p>
              <p>Relevant strength and conditioning research helps inform the exercises
                and training targets recommended for you.</p>
              <a className="landing-text-link" href="/about">Our approach to programming <ArrowUpRight size={17} aria-hidden="true" /></a>
            </div>
          </article>
          <article className="landing-workflow-row">
            <div className="landing-session-visual" aria-label="Illustrative workout details" data-scroll-reveal>
              <div className="landing-visual-heading"><span>Friday · Lower-body foundation</span><span className="landing-example">Example</span></div>
              <p className="landing-session-title">Every exercise.<br />Every set target.</p>
              <p className="landing-session-intro">Open a workout to see its exercises, prescriptions, and session notes.</p>
              <table>
                <caption className="landing-sr-only">Example workout showing prescribed sets, reps, and rest</caption>
                <thead><tr><th scope="col">Exercise</th><th scope="col">Sets × reps</th><th scope="col">Rest</th></tr></thead>
                <tbody>{sampleExercises.map((exercise) => (
                  <tr key={exercise.name}><th scope="row">{exercise.name}</th><td>{exercise.target}</td><td>{exercise.rest}</td></tr>
                ))}</tbody>
              </table>
              <div className="landing-history-note"><Check size={16} aria-hidden="true" /><p>See what changed.<span>Review affected workouts before and after an update in your plan timeline.</span></p></div>
              <p className="landing-caption">Illustrative workout prescription</p>
            </div>
            <div className="landing-workflow-copy" data-scroll-reveal data-scroll-delay="100">
              <h3>Know what’s ahead.<br />See what changed.</h3>
              <p>Go into each session with exercises and set targets ready to follow.
                The Plans tab brings your three-week overview, refresh timing, and
                current job status together.</p>
              <p>Open the timeline for earlier updates and before-and-after details.
                For questions about training, the chat bubble is always nearby,
                with Quick and Deep responses and saved conversations.</p>
            </div>
          </article>
        </section>

        <section className="landing-about-band" aria-labelledby="people-title">
          <div className="landing-about landing-container">
            <div className="landing-people" data-scroll-reveal>
              <div className="landing-portraits">
                <img src={richardPortrait} width="80" height="96" alt="Rick Xu" loading="lazy" />
                <img src={dimitriosPortrait} width="80" height="96" alt="Dimitrios Mahairas" loading="lazy" />
                <img src={aaronPortrait} width="80" height="96" alt="Aaron Jiang" loading="lazy" />
              </div>
              <p>Rick, Dimitrios &amp; Aaron<br /><span>The people building Arcel</span></p>
            </div>
            <div className="landing-about-copy" data-scroll-reveal data-scroll-delay="100">
              <h2 id="people-title">Meet the team</h2>
              <p>All three of us are hybrid athletes, balancing strength and conditioning
                in our own training. We’re building Arcel to bring research into everyday
                programming, with the flexibility we look for in a plan.</p>
              <a className="landing-text-link" href="/about">Meet the team <ArrowUpRight size={17} aria-hidden="true" /></a>
            </div>
          </div>
        </section>

        <section className="landing-faq landing-container" aria-labelledby="questions-title">
          <div className="landing-faq-heading" data-scroll-reveal><h2 id="questions-title">Common questions</h2><p>What’s in the app and what’s coming next.</p></div>
          <div className="landing-disclosures">
            {questions.map(({ question, answer }, index) => (
              <details className="landing-disclosure" key={question} name="arcel-questions" data-scroll-reveal data-scroll-delay={index * 60}>
                <summary>{question}<Plus size={19} aria-hidden="true" /></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="landing-close landing-container" aria-labelledby="close-title">
          <div data-scroll-reveal><h2 id="close-title">Get to know<br /><span data-scroll-emphasis>Arcel.</span></h2><p>Meet the team and read about the thinking behind the app.</p></div>
          <a className="landing-button landing-button-outline" href="/about">About us <ArrowRight size={18} aria-hidden="true" /></a>
        </section>
      </main>
      <div className="landing-container"><LaunchFooter /></div>
    </div>
  )
}
