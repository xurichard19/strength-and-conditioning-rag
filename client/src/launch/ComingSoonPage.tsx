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
    answer: 'The plan is designed to update upcoming workouts when your schedule, recovery, or performance changes. It will also add sessions as the weeks go on. You’ll be able to use chat to explain a change or ask about a recommendation. Automatic adjustments are still in development.',
  },
  {
    question: 'What stays in my history?',
    answer: 'The design keeps your completed workouts, including what was planned and what you recorded. Changes to future sessions should leave those records intact, with an explanation of what changed.',
  },
  {
    question: 'When can I try it?',
    answer: 'We’re working on the mobile app and plan to release it on the App Store. We don’t have a launch date yet. This page shows examples of the planned features.',
  },
]

const sampleExercises = [
  { name: 'Back squat', target: '3 × 5', result: '5 / 5 / 5' },
  { name: 'Romanian deadlift', target: '3 × 8', result: '8 / 8 / 8' },
  { name: 'Split squat', target: '2 × 8', result: '8 / 8' },
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
                  Arcel brings training research into a plan for your week, shaped by
                  your goals and the demands of your sport. We’re building it to adapt
                  as your schedule and performance change.
                </p>
                <a className="landing-button" href="#the-plan">Explore a training week <ArrowDown size={18} aria-hidden="true" /></a>
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
          <p data-scroll-reveal data-scroll-delay="100">An extra swim or a missed workout can change what makes sense next.
            Arcel is being designed to account for those changes, adjusting upcoming
            sessions while keeping your longer-term goals in view. We combine AI with
            peer-reviewed research to turn relevant findings into practical insights
            for your training.</p>
        </section>

        <section className="landing-plan-band" id="the-plan" aria-labelledby="plan-title">
          <div className="landing-plan landing-container">
            <div className="landing-plan-copy" data-scroll-reveal data-scroll-delay="100">
              <h2 id="plan-title">A new session.<br />A revised week.</h2>
              <p>Add a swim on Wednesday and follow the adjustment: Thursday becomes
                a recovery day, with strength moving to Friday.</p>
              <p className="landing-plan-principle"><Check size={18} aria-hidden="true" /> Completed workouts stay in your history.</p>
              <p className="landing-caption">Example of a planned feature.<br />Automatic adjustments are still in development.</p>
            </div>
            <TrainingCalendarPreview />
          </div>
        </section>

        <section className="landing-workflow landing-container" aria-labelledby="workflow-title">
          <h2 id="workflow-title" data-scroll-reveal>From your goals to your next session</h2>
          <p className="landing-section-lede" data-scroll-reveal data-scroll-delay="100">A training calendar built around your starting point, with a record of the work you put in.</p>
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
              <p>Your training history, available equipment, and sport commitments
                all shape the work ahead. Arcel starts with that context and the goals
                you want to work toward.</p>
              <p>Relevant strength and conditioning research helps inform the exercises
                and training targets recommended for you.</p>
              <a className="landing-text-link" href="/about">Our approach to programming <ArrowUpRight size={17} aria-hidden="true" /></a>
            </div>
          </article>
          <article className="landing-workflow-row">
            <div className="landing-session-visual" aria-label="Illustrative completed workout" data-scroll-reveal>
              <div className="landing-visual-heading"><span>Monday · Strength A</span><span className="landing-completed"><Check size={14} aria-hidden="true" /> Completed</span></div>
              <p className="landing-session-title">Your workout log</p>
              <p className="landing-session-intro">Compare your planned sets with the reps you recorded.</p>
              <table>
                <caption className="landing-sr-only">Example workout showing prescribed sets and recorded reps</caption>
                <thead><tr><th scope="col">Exercise</th><th scope="col">Planned</th><th scope="col">Recorded</th></tr></thead>
                <tbody>{sampleExercises.map((exercise) => (
                  <tr key={exercise.name}><th scope="row">{exercise.name}</th><td>{exercise.target}</td><td>{exercise.result}</td></tr>
                ))}</tbody>
              </table>
              <div className="landing-history-note"><Check size={16} aria-hidden="true" /><p>Saved in your history.<span>This session stays saved when the plan changes.</span></p></div>
              <p className="landing-caption">Illustrative workout record</p>
            </div>
            <div className="landing-workflow-copy" data-scroll-reveal data-scroll-delay="100">
              <h3>Your plan and<br />your performance</h3>
              <p>Go into each session with exercises and set targets ready to follow.
                Record what you complete, so you can compare the plan with your performance.</p>
              <p>Completed workouts stay in your history as the calendar develops.
                Chat is being built to help you understand recommendations and
                communicate the changes that affect your training.</p>
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
          <div className="landing-faq-heading" data-scroll-reveal><h2 id="questions-title">Common questions</h2><p>What Arcel will do and when you can try it.</p></div>
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
