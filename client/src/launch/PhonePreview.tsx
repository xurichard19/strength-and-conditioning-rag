import { useId, useRef, useState, type KeyboardEvent } from 'react'
import {
  Activity, ArrowUp, ArrowUpRight, BatteryFull, BookOpen, CalendarDays,
  ChartNoAxesCombined, Check, ChevronLeft, ChevronRight, Clock3, Dumbbell,
  Ellipsis, MessageCircle, Palette, Signal, Sparkles, UserRound, Wifi,
} from 'lucide-react'
import './PhonePreview.css'

const days = [
  { label: 'S', date: 13, tone: 'rest' },
  { label: 'M', date: 14, tone: 'strength' },
  { label: 'T', date: 15, tone: 'run' },
  { label: 'W', date: 16, tone: 'swim' },
  { label: 'T', date: 17, tone: 'rest' },
  { label: 'F', date: 18, tone: 'strength' },
  { label: 'S', date: 19, tone: 'swim' },
]

function CalendarPreview() {
  return <>
    <div className="phone-preview-toolbar"><span className="phone-preview-view-switch"><span>Week</span><span>Month</span></span><span>Today</span></div>
    <div className="phone-preview-period"><span>Sep 13 – Sep 19</span><span className="phone-preview-arrows"><ChevronLeft size={16} /><ChevronRight size={16} /></span></div>
    <div className="phone-preview-days">
      {days.map((day) => (
        <div className={`phone-preview-day${day.date === 16 ? ' phone-preview-day-selected' : ''}`} key={day.date}>
          <span>{day.label}</span><strong>{day.date}</strong><i className={`phone-preview-dot phone-preview-dot-${day.tone}`} />
        </div>
      ))}
    </div>
    <div className="phone-preview-section-heading"><span>Wednesday, Sep 16</span><Ellipsis size={18} /></div>
    <div className="phone-preview-session">
      <div className="phone-preview-session-eyebrow"><span>Sports session</span><span>● Planned</span></div>
      <div className="phone-preview-session-heading"><p>Swimming</p><span className="phone-preview-session-icon"><Activity size={19} strokeWidth={1.65} /></span></div>
      <p className="phone-preview-session-meta">7:00 AM · 45 min · Moderate</p>
      <p className="phone-preview-session-note">Easy warm-up, then 8 × 100 m.<br />Keep the pace controlled.</p>
      <div className="phone-preview-session-foot"><span>Session details</span><ArrowUpRight size={13} /></div>
    </div>
    <div className="phone-preview-section-heading phone-preview-overview-heading"><span>At a glance</span></div>
    <div className="phone-preview-agenda">
      <div className="phone-preview-agenda-row">
        <span className="phone-preview-agenda-day">Mon</span>
        <span className="phone-preview-agenda-icon phone-preview-agenda-icon-completed"><Check size={15} strokeWidth={1.8} /></span>
        <div className="phone-preview-agenda-copy"><p>Strength A</p><span>Completed</span></div>
        <span className="phone-preview-agenda-duration">45m</span>
      </div>
    </div>
  </>
}

const exercises = [
  ['Goblet squat', '3 × 8'], ['Dumbbell bench press', '3 × 8'],
  ['One-arm row', '3 × 10'], ['Easy swim', '15 min'],
]

function TodayPreview() {
  return <>
    <div className="phone-preview-section-heading"><span>Your session</span><span className="phone-preview-small-label">Wednesday</span></div>
    <div className="phone-preview-panel">
      <p className="phone-preview-eyebrow">Mixed session</p>
      <div className="phone-preview-session-heading"><p>Full body +<br />easy swim</p><span className="phone-preview-session-icon"><Dumbbell size={19} /></span></div>
      <div className="phone-preview-facts"><div><strong>40 <small>min</small></strong><span>Duration</span></div><div><strong>4</strong><span>Exercises</span></div></div>
      <p className="phone-preview-copy">A balanced strength session, followed by an easy aerobic finish.</p>
      <div className="phone-preview-exercises">{exercises.map(([name, target]) => <div key={name}><i className="phone-preview-dot phone-preview-dot-strength" /><span>{name}</span><span>{target}</span></div>)}</div>
      <span className="phone-preview-static-primary">Start session</span>
      <div className="phone-preview-static-actions"><span><Clock3 size={13} />25 min</span><span>Move<ArrowUpRight size={13} /></span></div>
    </div>
  </>
}

const consistency = [
  { label: 'Aug 24', strength: 2, cardio: 1 }, { label: 'Aug 31', strength: 2, cardio: 2 },
  { label: 'Sep 7', strength: 2, cardio: 1 }, { label: 'Now', strength: 2, cardio: 2 },
]

function ProgressPreview() {
  return <>
    <div className="phone-preview-section-heading"><span>Consistency</span><span className="phone-preview-small-label">Last 4 weeks</span></div>
    <div className="phone-preview-panel">
      <p className="phone-preview-metric">14 <span>sessions</span></p>
      <div className="phone-preview-chart-legend"><span><i className="phone-preview-dot phone-preview-dot-strength" />Strength</span><span><i className="phone-preview-dot phone-preview-dot-swim" />Cardio</span></div>
      <div className="phone-preview-bar-chart" role="img" aria-label="Completed sessions over four weeks: 3, 4, 3, and 4. Each week includes two strength sessions.">
        {consistency.map((week) => <div className="phone-preview-bar-column" key={week.label}><div className="phone-preview-bar-stack"><i style={{ height: `${week.cardio * 6}cqw` }} /><i style={{ height: `${week.strength * 6}cqw` }} /></div><span>{week.label}</span></div>)}
      </div>
      <p className="phone-preview-copy">Steady work. A stronger foundation.</p>
    </div>
    <div className="phone-preview-section-heading"><span>Your trends</span></div>
    <div className="phone-preview-panel phone-preview-trend">
      <div className="phone-preview-trend-heading"><span><Dumbbell size={15} />Goblet squat</span><span>8 weeks</span></div>
      <p className="phone-preview-metric">24 <span>kg</span></p>
      <p className="phone-preview-small-label">from 16 kg</p>
      <svg className="phone-preview-line-chart" viewBox="0 0 240 72" role="img" aria-label="Goblet squat working weight increased from 16 to 24 kilograms over eight weeks."><path className="phone-preview-chart-grid" d="M0 15H240 M0 42H240 M0 69H240" /><path className="phone-preview-chart-line" d="M2 62L36 62L69 48L103 48L137 31L171 31L205 12L238 12" /><circle cx="238" cy="12" r="3" /></svg>
    </div>
  </>
}

function ChatPreview() {
  return <div className="phone-preview-chat">
    <div className="phone-preview-chat-user">How should I fit swimming around my strength sessions?</div>
    <div className="phone-preview-chat-response">
      <p className="phone-preview-eyebrow"><i className="phone-preview-dot phone-preview-dot-swim" />ARCEL</p>
      <p>Start with what you want each session to do.</p>
      <p className="phone-preview-copy">Keep the swim easy after a harder leg session. When both workouts need your best effort, leave some time between them.</p>
      <div className="phone-preview-chat-takeaway"><p>A week with room for both</p><span>Strength on Monday and Friday.<br />Swim on Wednesday and Saturday.</span></div>
      <div className="phone-preview-source-summary"><BookOpen size={16} /><div><p>Research context</p><span>Concurrent training · Recovery</span></div><ArrowUpRight size={13} /></div>
    </div>
    <div className="phone-preview-composer"><span>Ask a training question…</span><div><span><BookOpen size={12} />Research<ChevronRight size={12} /></span><span className="phone-preview-send"><ArrowUp size={16} /></span></div></div>
    <p className="phone-preview-disclaimer">Training guidance, not medical care.</p>
  </div>
}

function YouPreview() {
  return <>
    <div className="phone-preview-section-heading"><span>Your plan</span></div>
    <div className="phone-preview-panel">
      <p className="phone-preview-plan-title">Strong and fit</p>
      <div className="phone-preview-facts phone-preview-profile-facts"><div><strong>4</strong><span>days / week</span></div><div><strong>45</strong><span>minutes</span></div><div><strong className="phone-preview-equipment">Full gym</strong><span>equipment</span></div></div>
      <div className="phone-preview-plan-days">{['Mon', 'Wed', 'Fri', 'Sat'].map((day) => <span key={day}><i className="phone-preview-dot phone-preview-dot-swim" />{day}</span>)}</div>
    </div>
    <div className="phone-preview-section-heading"><span>Current block</span></div>
    <div className="phone-preview-panel"><div className="phone-preview-block-heading"><span>Strength</span><span>Week 3 of 8</span></div><div className="phone-preview-rail"><span /></div><p className="phone-preview-copy">Build strength. Keep your aerobic base.<br />Next up: speed.</p></div>
    <div className="phone-preview-section-heading"><span>Appearance</span></div>
    <div className="phone-preview-panel"><div className="phone-preview-theme-label"><Palette size={15} /><span>Theme</span></div><div className="phone-preview-theme"><span>System</span><span>Light</span><span>Dark</span></div></div>
  </>
}

const navigation = [
  { label: 'Today', icon: Sparkles, subtitle: 'Strength focus · Week 3 of 8', screen: TodayPreview },
  { label: 'Calendar', icon: CalendarDays, subtitle: 'Your training, in view.', screen: CalendarPreview },
  { label: 'Progress', icon: ChartNoAxesCombined, subtitle: 'A longer view of your training.', screen: ProgressPreview },
  { label: 'Chat', icon: MessageCircle, subtitle: 'Research meets your routine.', screen: ChatPreview },
  { label: 'You', icon: UserRound, subtitle: 'Your training, on your terms.', screen: YouPreview },
]

/** Illustrative native-screen recreations. Only the five navigation tabs are interactive. */
export default function PhonePreview() {
  const [activeIndex, setActiveIndex] = useState(1)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()
  const active = navigation[activeIndex]
  const ActiveScreen = active.screen

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const targets: Record<string, number> = {
      ArrowRight: (index + 1) % navigation.length,
      ArrowLeft: (index + navigation.length - 1) % navigation.length,
      Home: 0,
      End: navigation.length - 1,
    }
    const target = targets[event.key]
    if (target === undefined) return
    event.preventDefault()
    setActiveIndex(target)
    tabRefs.current[target]?.focus()
  }

  return (
    <figure className="phone-preview" aria-label="Explore the Arcel app" aria-describedby={`${id}-caption`}>
      <div className="phone-preview-device">
        <div className="phone-preview-screen">
          <div className="phone-preview-status" aria-hidden="true">
            <span>9:41</span><span className="phone-preview-island" />
            <span className="phone-preview-connectivity"><Signal size={13} /><Wifi size={13} /><BatteryFull size={19} /></span>
          </div>
          <div className="phone-preview-content" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${activeIndex}`} tabIndex={0}>
            <div className="phone-preview-page" key={active.label}>
              <div className="phone-preview-heading"><div><p className="phone-preview-brand">ARCEL</p><p className="phone-preview-title">{active.label}</p></div><span className="phone-preview-assistant" aria-hidden="true"><Sparkles size={19} strokeWidth={1.8} /></span></div>
              <p className="phone-preview-subtitle">{active.subtitle}</p>
              <ActiveScreen />
            </div>
          </div>
          <div className="phone-preview-nav" role="tablist" aria-label="App preview screens">
            {navigation.map(({ label, icon: Icon }, index) => (
              <button type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel`} aria-selected={index === activeIndex} tabIndex={index === activeIndex ? 0 : -1}
                className={`phone-preview-nav-item${index === activeIndex ? ' phone-preview-nav-current' : ''}`} key={label}
                ref={(node) => { tabRefs.current[index] = node }} onClick={() => setActiveIndex(index)} onKeyDown={(event) => handleTabKey(event, index)}>
                <Icon size={20} strokeWidth={1.7} aria-hidden="true" /><span>{label}</span>
              </button>
            ))}
          </div>
          <span className="phone-preview-home" aria-hidden="true" />
        </div>
      </div>
      <figcaption id={`${id}-caption`}>Try the tabs <span>·</span> Illustrative app preview</figcaption>
    </figure>
  )
}
