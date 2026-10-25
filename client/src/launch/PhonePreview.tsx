import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  Activity, ArrowLeft, ArrowUp, ArrowUpRight, BatteryFull, BookOpen, CalendarDays,
  ChartNoAxesCombined, Check, ChevronLeft, ChevronRight, Clock3, Dumbbell,
  Ellipsis, History, Layers, Maximize2, MessageCircle, Minimize2, Palette, Signal, Sparkles, UserRound, Wifi, X,
} from 'lucide-react'
import './PhonePreview.css'

const days = [
  { label: 'S', date: 18, tone: 'rest' },
  { label: 'M', date: 19, tone: 'strength' },
  { label: 'T', date: 20, tone: 'sport' },
  { label: 'W', date: 21, tone: 'rest' },
  { label: 'T', date: 22, tone: 'sport' },
  { label: 'F', date: 23, tone: 'strength' },
  { label: 'S', date: 24, tone: 'strength' },
]

function CalendarPreview() {
  return <>
    <div className="phone-preview-toolbar"><span className="phone-preview-view-switch"><span>Week</span><span>Month</span></span><span>Today</span></div>
    <div className="phone-preview-period"><span>Oct 18 – Oct 24</span><span className="phone-preview-arrows"><ChevronLeft size={16} /><ChevronRight size={16} /></span></div>
    <div className="phone-preview-days">
      {days.map((day) => (
        <div className={`phone-preview-day${day.date === 22 ? ' phone-preview-day-selected' : ''}`} key={day.date}>
          <span>{day.label}</span><strong>{day.date}</strong><i className={`phone-preview-dot phone-preview-dot-${day.tone}`} />
        </div>
      ))}
    </div>
    <div className="phone-preview-section-heading"><span>Thursday, Oct 22</span><Ellipsis size={18} /></div>
    <div className="phone-preview-session">
      <div className="phone-preview-session-eyebrow"><span>Sports session</span><span>● Planned</span></div>
      <div className="phone-preview-session-heading"><p>Boxing</p><span className="phone-preview-session-icon"><Activity size={19} strokeWidth={1.65} /></span></div>
      <p className="phone-preview-session-meta">7:00 AM · 45 min · Moderate</p>
      <p className="phone-preview-session-note">Footwork, then 6 × 3 min on the bag.<br />Focus on clean combinations.</p>
      <div className="phone-preview-session-foot"><span>Session details</span><ArrowUpRight size={13} /></div>
    </div>
    <div className="phone-preview-section-heading phone-preview-overview-heading"><span>At a glance</span></div>
    <div className="phone-preview-agenda">
      <div className="phone-preview-agenda-row">
        <span className="phone-preview-agenda-day">Mon</span>
        <span className="phone-preview-agenda-icon"><Dumbbell size={15} strokeWidth={1.8} /></span>
        <div className="phone-preview-agenda-copy"><p>Upper-body foundations</p><span>Planned · 4 exercises</span></div>
        <span className="phone-preview-agenda-duration">45m</span>
      </div>
    </div>
  </>
}

const exercises = [
  ['Dumbbell bench press', '3 × 8'], ['Chest-supported row', '3 × 10'],
  ['Lat pulldown', '3 × 10'], ['Pallof press', '2 × 10 / side'],
]

function TodayPreview() {
  return <>
    <div className="phone-preview-section-heading"><span>Your session</span><span className="phone-preview-small-label">Monday</span></div>
    <div className="phone-preview-panel">
      <p className="phone-preview-eyebrow">Strength session</p>
      <div className="phone-preview-session-heading"><p>Upper-body<br />foundations</p><span className="phone-preview-session-icon"><Dumbbell size={19} /></span></div>
      <div className="phone-preview-facts"><div><strong>40 <small>min</small></strong><span>Duration</span></div><div><strong>4</strong><span>Exercises</span></div></div>
      <p className="phone-preview-copy">Balanced pushing and pulling, with controlled core work.</p>
      <div className="phone-preview-exercises">{exercises.map(([name, target]) => <div key={name}><i className="phone-preview-dot phone-preview-dot-strength" /><span>{name}</span><span>{target}</span></div>)}</div>
      <p className="phone-preview-small-label"><Clock3 size={12} /> Rest 90–120 seconds between strength sets.</p>
    </div>
  </>
}

const consistency = [
  { label: 'Aug 24', strength: 2, boxing: 1 }, { label: 'Aug 31', strength: 2, boxing: 2 },
  { label: 'Sep 7', strength: 2, boxing: 1 }, { label: 'Now', strength: 2, boxing: 2 },
]

function ProgressPreview() {
  return <>
    <div className="phone-preview-section-heading"><span>Consistency</span><span className="phone-preview-small-label">Last 4 weeks</span></div>
    <div className="phone-preview-panel">
      <p className="phone-preview-metric">14 <span>sessions</span></p>
      <div className="phone-preview-chart-legend"><span><i className="phone-preview-dot phone-preview-dot-strength" />Strength</span><span><i className="phone-preview-dot phone-preview-dot-sport" />Boxing</span></div>
      <div className="phone-preview-bar-chart" role="img" aria-label="Completed sessions over four weeks: 3, 4, 3, and 4. Each week includes two strength sessions.">
        {consistency.map((week) => <div className="phone-preview-bar-column" key={week.label}><div className="phone-preview-bar-stack"><i style={{ height: `${week.boxing * 6}cqw` }} /><i style={{ height: `${week.strength * 6}cqw` }} /></div><span>{week.label}</span></div>)}
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
  const [deep, setDeep] = useState(false)
  return <div className="phone-preview-chat">
    <div className="phone-preview-chat-user">How should I fit boxing around my strength sessions?</div>
    <div className="phone-preview-chat-response">
      <p className="phone-preview-eyebrow"><i className="phone-preview-dot phone-preview-dot-sport" />ARCEL</p>
      <p>Start with what you want each session to do.</p>
      <p className="phone-preview-copy">{deep ? 'Keep harder boxing sessions in mind when placing strength work. Give demanding leg sessions room to recover before sparring.' : 'Give harder strength sessions room to recover before your toughest boxing days.'}</p>
      <div className="phone-preview-chat-takeaway"><p>Keep each session focused</p><span>Build strength in the gym. Keep your boxing sessions focused on skill and sport.</span></div>
      {deep && <div className="phone-preview-source-summary"><BookOpen size={16} /><div><p>Research context</p><span>Concurrent training · Recovery</span></div></div>}
    </div>
    <div className="phone-preview-composer"><span>Ask a training question…</span><div><div className="phone-preview-chat-modes" aria-label="Sample chat mode">{['Quick', 'Deep'].map((label, index) => <button type="button" key={label} aria-pressed={deep === Boolean(index)} onClick={() => setDeep(Boolean(index))}>{label}</button>)}</div><span className="phone-preview-send"><ArrowUp size={16} /></span></div></div>
    <p className="phone-preview-disclaimer">Training guidance, not medical care.</p>
  </div>
}

const updates = [
  { version: 12, kind: 'Plan adjustment', title: 'Your plan, adjusted.', reason: 'Your sports schedule changed', date: 'Oct 19 · 8:42 AM' },
  { version: 11, kind: 'Plan refresh', title: 'More training, planned.', reason: 'Scheduled plan refresh', date: 'Oct 19 · 6:00 AM' },
  { version: 10, kind: 'First plan', title: 'Your starting point.', reason: 'Onboarding completed', date: 'Oct 12 · 9:15 AM' },
]
type Update = typeof updates[number]
const lowerBody = [['Goblet squat', '3 × 8'], ['Romanian deadlift', '3 × 8'], ['Step-up', '2 × 8 / side'], ['Standing calf raise', '3 × 12']]

function UpdateCard({ update, onOpen }: { update: Update; onOpen: (update: Update) => void }) {
  return <button className="phone-preview-panel phone-preview-update" type="button" onClick={() => onOpen(update)}>
    <span className="phone-preview-between"><span className="phone-preview-eyebrow">{update.kind}</span><span className="phone-preview-small-label">Applied · V{update.version}</span></span>
    <span className="phone-preview-update-title">{update.title}</span>
    <span className="phone-preview-copy">{update.reason}</span>
    <span className="phone-preview-update-footer">See what changed<ChevronRight size={14} /></span>
  </button>
}

function PlansPreview({ onOpen }: { onOpen: (update: Update) => void }) {
  const [week, setWeek] = useState(0)
  const [timeline, setTimeline] = useState(false)
  const [adjustments, setAdjustments] = useState(false)
  const historyButton = useRef<HTMLButtonElement>(null)
  const moveFocus = useRef(false)
  useEffect(() => {
    if (moveFocus.current) historyButton.current?.focus()
    moveFocus.current = false
  }, [timeline])
  function toggleTimeline() {
    moveFocus.current = true
    setTimeline(value => !value)
  }
  const dates = ['Oct 19 – Oct 25', 'Oct 26 – Nov 1', 'Nov 2 – Nov 8']
  return <>
    {timeline && <button type="button" className="phone-preview-text-button phone-preview-back" ref={historyButton} onClick={toggleTimeline}><ArrowLeft size={14} />Your plan</button>}
    <div className="phone-preview-panel phone-preview-plan-hero">
      <div className="phone-preview-between"><p className="phone-preview-eyebrow">Your training plan</p><Layers size={17} /></div>
      <p className="phone-preview-plan-title">Training, with<br />room to adapt.</p>
      <p className="phone-preview-copy">Planned through Nov 8</p>
      <p className="phone-preview-small-label">3 weeks · refreshes weekly</p>
      {!timeline && <>
        <div className="phone-preview-weeks" aria-label="Plan weeks">
          {dates.map((_, index) => <button type="button" key={index} aria-pressed={week === index} onClick={() => setWeek(index)}>Week {index + 1}</button>)}
        </div>
        <div className="phone-preview-week-summary" aria-live="polite"><p>{dates[week]}</p><p>3 training sessions · 2 sports sessions</p><p className="phone-preview-small-label">Boxing on your schedule.</p></div>
        <div className="phone-preview-refresh"><span>Next refresh</span><strong>Mon, Oct 26</strong></div>
      </>}
    </div>
    <p className="phone-preview-job-status"><Check size={12} />No plan updates in progress.</p>
    {timeline ? <>
      <div className="phone-preview-section-heading"><span>Plan history</span><History size={16} /></div>
      <div className="phone-preview-history-filter" aria-label="History filter">{['All updates', 'Adjustments'].map((label, index) => <button type="button" key={label} aria-pressed={adjustments === Boolean(index)} onClick={() => setAdjustments(Boolean(index))}>{label}</button>)}</div>
      <div className="phone-preview-timeline">{updates.filter(update => !adjustments || update.version === 12).map(update => <div key={update.version}><p className="phone-preview-small-label">{update.date}</p><UpdateCard update={update} onOpen={onOpen} /></div>)}</div>
    </> : <>
      <div className="phone-preview-section-heading"><span>Latest update</span><History size={16} /></div>
      <UpdateCard update={updates[0]} onOpen={onOpen} />
      <div className="phone-preview-section-heading"><span>Plan history</span><button type="button" className="phone-preview-text-button" ref={historyButton} onClick={toggleTimeline}>View all<ArrowUpRight size={13} /></button></div>
      <button type="button" className="phone-preview-history-row" onClick={() => onOpen(updates[1])}><span>Plan refresh · V11<small>Oct 19 · Applied</small></span><ChevronRight size={14} /></button>
    </>}
  </>
}

function UpdateDetails({ update }: { update: Update }) {
  const adjustment = update.version === 12
  return <>
    <p className="phone-preview-small-label">Version {update.version} · Applied · {update.date}</p>
    <p className="phone-preview-copy">{update.reason}</p>
    <p className="phone-preview-copy">A sample of the workouts affected by this update.</p>
    {['Before', 'After'].map((label, index) => <div className="phone-preview-detail-workout" key={label}>
      <p className="phone-preview-eyebrow">{label}</p>
      {!adjustment && !index ? <p className="phone-preview-copy">No workouts in this part of the update.</p> : <>
        <p className="phone-preview-update-title">Lower-body foundations</p>
        <p className="phone-preview-small-label">{adjustment ? index ? 'Saturday, Oct 24' : 'Wednesday, Oct 21' : update.version === 11 ? 'Saturday, Nov 7' : 'Saturday, Oct 17'}</p>
        <div className="phone-preview-exercises">{lowerBody.map(([name, sets]) => <div key={name}><span>{name}</span><span>{sets}</span></div>)}</div>
      </>}
    </div>)}
  </>
}

/** A nonmodal preview panel keeps the rest of the website available to keyboard users. */
function PreviewPanel({ title, children, onClose, chat }: { title: string; children: ReactNode; onClose: () => void; chat: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const element = panel.current
    element?.focus()
    return () => previous?.focus({ preventScroll: true })
  }, [])
  return <div className="phone-preview-overlay">
    <div className={`phone-preview-dialog${chat && !expanded ? ' phone-preview-dialog-compact' : ''}`} role="dialog" aria-label={title} ref={panel} tabIndex={-1}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
      <div className="phone-preview-dialog-heading"><strong>{title}</strong><span>
        {chat && <button type="button" aria-label={expanded ? 'Minimize chat' : 'Expand chat'} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>}
        <button type="button" aria-label="Close preview panel" onClick={onClose}><X size={18} /></button>
      </span></div>
      <div className="phone-preview-dialog-body">{chat && expanded && <p className="phone-preview-chat-history"><History size={13} />Recent chat · Boxing & strength</p>}{children}</div>
    </div>
  </div>
}

function YouPreview() {
  return <>
    <div className="phone-preview-section-heading"><span>Your plan</span></div>
    <div className="phone-preview-panel">
      <p className="phone-preview-plan-title">Strength for boxing</p>
      <div className="phone-preview-facts phone-preview-profile-facts"><div><strong>5</strong><span>days / week</span></div><div><strong>45</strong><span>minutes</span></div><div><strong className="phone-preview-equipment">Full gym</strong><span>equipment</span></div></div>
      <div className="phone-preview-plan-days">{['Mon', 'Tue', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}><i className="phone-preview-dot phone-preview-dot-sport" />{day}</span>)}</div>
    </div>
    <div className="phone-preview-section-heading"><span>Planning preferences</span></div>
    <div className="phone-preview-panel"><div className="phone-preview-block-heading"><span>3 weeks</span><span>Refreshes weekly</span></div><p className="phone-preview-copy">Your goals, available equipment, and sports schedule shape your plan.</p></div>
    <div className="phone-preview-section-heading"><span>Appearance</span></div>
    <div className="phone-preview-panel"><div className="phone-preview-theme-label"><Palette size={15} /><span>Theme</span></div><div className="phone-preview-theme"><span>System</span><span>Light</span><span>Dark</span></div></div>
  </>
}

const navigation = [
  { label: 'Today', icon: Sparkles, subtitle: 'Your training, one day at a time.', screen: TodayPreview },
  { label: 'Calendar', icon: CalendarDays, subtitle: 'Your training, in view.', screen: CalendarPreview },
  { label: 'Plans', icon: Layers, subtitle: 'Built around the way you train.', screen: null },
  { label: 'Progress', icon: ChartNoAxesCombined, subtitle: 'Sample progress · local preview.', screen: ProgressPreview },
  { label: 'You', icon: UserRound, subtitle: 'Your training, on your terms.', screen: YouPreview },
]

/** Local sample content mirrors the app without making requests or changing a real plan. */
export default function PhonePreview() {
  const [activeIndex, setActiveIndex] = useState(2)
  const [detail, setDetail] = useState<Update | 'chat' | null>(null)
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
          <div className="phone-preview-content" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${activeIndex}`} tabIndex={0} inert={detail !== null}>
            <div className="phone-preview-page" key={active.label}>
              <div className="phone-preview-heading"><div><p className="phone-preview-brand">ARCEL</p><p className="phone-preview-title">{active.label === 'Plans' ? 'Your plan' : active.label}</p></div></div>
              <p className="phone-preview-subtitle">{active.subtitle}</p>
              {ActiveScreen ? <ActiveScreen /> : <PlansPreview onOpen={setDetail} />}
            </div>
          </div>
          <button type="button" className="phone-preview-chat-bubble" aria-label="Open chat preview" inert={detail !== null} onClick={() => setDetail('chat')}><MessageCircle size={20} strokeWidth={1.7} /></button>
          <div className="phone-preview-nav" role="tablist" aria-label="App preview screens" inert={detail !== null}>
            {navigation.map(({ label, icon: Icon }, index) => (
              <button type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel`} aria-selected={index === activeIndex} tabIndex={index === activeIndex ? 0 : -1}
                className={`phone-preview-nav-item${index === activeIndex ? ' phone-preview-nav-current' : ''}`} key={label}
                ref={(node) => { tabRefs.current[index] = node }} onClick={() => setActiveIndex(index)} onKeyDown={(event) => handleTabKey(event, index)}>
                <Icon size={20} strokeWidth={2.2} aria-hidden="true" /><span>{label}</span>
              </button>
            ))}
          </div>
          <span className="phone-preview-home" aria-hidden="true" />
          {detail && <PreviewPanel title={detail === 'chat' ? 'Chat' : detail.kind} chat={detail === 'chat'} onClose={() => setDetail(null)}>{detail === 'chat' ? <ChatPreview /> : <UpdateDetails update={detail} />}</PreviewPanel>}
        </div>
      </div>
      <figcaption id={`${id}-caption`}>Explore plans, history & chat <span>·</span> Sample app content</figcaption>
    </figure>
  )
}
