import {
  Check,
  Sparkles,
  Dumbbell,
  Moon,
  MoveRight,
  Smartphone,
  Timer,
} from 'lucide-react'

import appIcon from '../../../mobile/assets/images/splash-icon.png'
import { LaunchFooter } from './LaunchFooter'
import './ComingSoonPage.css'

const trainingModes = [
  { label: 'Strength', icon: Dumbbell, tone: 'strength' },
  { label: 'Conditioning', icon: Timer, tone: 'conditioning' },
  { label: 'Recovery', icon: Moon, tone: 'recovery' },
] as const

export function ComingSoonPage() {
  return (
    <main className="launch-page">
      <div className="launch-wash launch-wash-blue" aria-hidden="true" />
      <div className="launch-wash launch-wash-violet" aria-hidden="true" />
      <div className="launch-grid" aria-hidden="true" />

      <div className="launch-shell">
        <header className="launch-header">
          <div className="brand-lockup" aria-label="Arcel">
            <span className="brand-icon-wrap">
              <img src={appIcon} alt="" className="brand-icon" />
            </span>
            <span className="brand-name">Arcel</span>
          </div>

          <div className="build-status" aria-label="Mobile app in progress">
            <span className="build-status-dot" aria-hidden="true" />
            <span>Mobile first</span>
            <span className="build-status-divider" aria-hidden="true" />
            <span>In progress</span>
          </div>
        </header>

        <section className="launch-hero" aria-labelledby="launch-title">
          <div className="hero-copy">
            <h1 id="launch-title">
              AI-powered
              <span className="title-accent"> S&amp;C programming.</span>
            </h1>

            <p className="hero-description">
              Turn training research into a plan you can follow. We’re building AI-powered
              workouts, exercises, and set targets around your goals and sport—with rolling
              programming designed to adapt to your readiness, results, and schedule.
            </p>

            <div className="app-store-notice" role="status">
              <span className="app-store-icon" aria-hidden="true">
                <Smartphone size={22} strokeWidth={1.8} />
              </span>
              <span className="app-store-copy">
                <span>Coming to the</span>
                <strong>App Store soon</strong>
              </span>
              <span className="app-store-pulse" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>

            <div className="training-mode-list" aria-label="Training modes">
              {trainingModes.map(({ label, icon: Icon, tone }) => (
                <div className="training-mode" key={label}>
                  <span className={`training-mode-icon training-mode-icon-${tone}`}>
                    <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="app-preview" aria-label="Concept preview of Arcel’s upcoming AI-powered rolling programming">
            <div className="preview-orbit preview-orbit-outer" aria-hidden="true" />
            <div className="preview-orbit preview-orbit-inner" aria-hidden="true" />

            <div className="preview-float-label preview-float-label-strength" aria-hidden="true">
              <span /> Strength
            </div>
            <div className="preview-float-label preview-float-label-recovery" aria-hidden="true">
              <span /> Recovery
            </div>

            <article className="session-card">
              <div className="session-card-topline">
                <div>
                  <p className="preview-eyebrow">AI planning preview</p>
                  <h2>Your AI-powered plan</h2>
                </div>
                <span className="session-icon">
                  <Sparkles size={20} strokeWidth={1.9} aria-hidden="true" />
                </span>
              </div>

              <div className="session-meta">
                <span>Research-informed</span>
                <span>Rolling programming</span>
              </div>

              <div className="exercise-list">
                <div><span className="exercise-dot exercise-dot-blue" />Training research<strong>The evidence</strong></div>
                <div><span className="exercise-dot exercise-dot-violet" />Your goals & history<strong>The context</strong></div>
                <div><span className="exercise-dot exercise-dot-teal" />Upcoming workouts<strong>AI-planned</strong></div>
              </div>

              <div className="session-button" aria-hidden="true">
                <span>Same goal. An evolving plan.</span>
                <MoveRight size={18} />
              </div>
            </article>

            <aside className="adjustment-card">
              <span className="adjustment-check" aria-hidden="true">
                <Check size={15} strokeWidth={2.4} />
              </span>
              <span>
                <strong>AI-assisted adjustments</strong>
                <small>Keep the work you’ve done.</small>
              </span>
            </aside>
          </div>
        </section>

        <div className="about-trail" aria-hidden="true">
          <span>A little about us</span>
          <svg viewBox="0 0 360 112" fill="none">
            <path
              className="about-trail-line"
              d="M7 16C63 19 71 86 137 75C201 64 211 18 271 30C315 39 312 78 347 88"
            />
            <path className="about-trail-head" d="M332 89L348 89L345 73" />
          </svg>
        </div>

        <a className="about-card" href="/about" aria-label="About us — learn more about Arcel">
          <div className="about-number" aria-hidden="true">01</div>
          <div className="about-heading">
            <p className="preview-eyebrow">About Arcel</p>
            <h2 id="about-title">A long-term goal. A plan that keeps up.</h2>
            <span className="about-link-label">More about us <MoveRight size={18} aria-hidden="true" /></span>
          </div>
          <p className="about-copy">
            More than a one-off workout or a chat answer. Arcel is being built around a
            living training calendar: regular refreshes plan further ahead, while changes
            in readiness, performance, or sport commitments reshape upcoming sessions.
            Your completed workouts and results stay intact.
          </p>
          <div className="about-principles" aria-label="Arcel principles">
            <span>Grounded in research</span>
            <span>Adapt what’s ahead</span>
            <span>Keep your history</span>
          </div>
        </a>

        <LaunchFooter />
      </div>
    </main>
  )
}
