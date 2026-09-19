import {
  BatteryFull,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  Dumbbell,
  Footprints,
  MessageCircle,
  Signal,
  Sparkles,
  UserRound,
  Waves,
  Wifi,
} from 'lucide-react'
import './PhonePreview.css'

const days = [
  { label: 'M', date: 14, tone: 'strength' },
  { label: 'T', date: 15, tone: 'run' },
  { label: 'W', date: 16, tone: 'swim' },
  { label: 'T', date: 17, tone: 'rest' },
  { label: 'F', date: 18, tone: 'strength' },
  { label: 'S', date: 19, tone: 'swim' },
  { label: 'S', date: 20, tone: 'rest' },
]

const sessions = [
  { day: 'Mon', title: 'Strength A', detail: 'Completed', duration: '45m', tone: 'strength', done: true },
  { day: 'Tue', title: 'Easy run', detail: 'Completed', duration: '35m', tone: 'run', done: true },
  { day: 'Fri', title: 'Strength B', detail: 'Planned', duration: '45m', tone: 'strength', done: false },
]

const navigation = [
  { label: 'Today', icon: Sparkles },
  { label: 'Calendar', icon: CalendarDays },
  { label: 'Progress', icon: ChartNoAxesCombined },
  { label: 'Chat', icon: MessageCircle },
  { label: 'You', icon: UserRound },
]

/** A promotional recreation of the native Calendar screen, using illustrative data. */
export default function PhonePreview() {
  return (
    <figure className="phone-preview">
      <div
        className="phone-preview-device"
        role="img"
        aria-label="Arcel mobile app preview. A weekly calendar combines strength training, running, and swimming. Wednesday shows a 45-minute swim session with warm-up, intervals, and cool-down. Completed workouts remain in the weekly overview."
      >
        <div className="phone-preview-screen" aria-hidden="true">
          <div className="phone-preview-status">
            <span>9:41</span>
            <span className="phone-preview-island" />
            <span className="phone-preview-connectivity"><Signal size={13} /><Wifi size={13} /><BatteryFull size={19} /></span>
          </div>

          <div className="phone-preview-content">
            <div className="phone-preview-heading">
              <div><p className="phone-preview-brand">ARCEL</p><p className="phone-preview-title">Calendar</p></div>
              <span className="phone-preview-assistant"><Sparkles size={19} strokeWidth={1.8} /></span>
            </div>
            <p className="phone-preview-subtitle">Your workouts and sports sessions</p>

            <div className="phone-preview-period"><span>14–20 September</span><span className="phone-preview-period-label">THIS WEEK</span></div>
            <div className="phone-preview-days">
              {days.map((day) => (
                <div className={`phone-preview-day${day.date === 16 ? ' phone-preview-day-selected' : ''}`} key={day.date}>
                  <span>{day.label}</span><strong>{day.date}</strong><i className={`phone-preview-dot phone-preview-dot-${day.tone}`} />
                </div>
              ))}
            </div>

            <div className="phone-preview-section-heading"><span>Wednesday, 16 Sep</span><span className="phone-preview-today-label">Today</span></div>
            <div className="phone-preview-session">
              <div className="phone-preview-session-heading">
                <span className="phone-preview-session-icon"><Waves size={23} strokeWidth={1.65} /></span>
                <div><p>Swim intervals</p><span>Swimming · 45 min</span></div>
                <span className="phone-preview-session-marker" />
              </div>
              <div className="phone-preview-swim-set"><span>Warm-up</span><strong>300 m easy</strong></div>
              <div className="phone-preview-swim-set phone-preview-swim-main"><span>Main set</span><strong>8 × 100 m</strong></div>
              <div className="phone-preview-swim-set"><span>Cool-down</span><strong>200 m easy</strong></div>
              <div className="phone-preview-session-foot"><span className="phone-preview-dot phone-preview-dot-swim" /><span>Endurance</span><span>Planned</span></div>
            </div>

            <div className="phone-preview-section-heading phone-preview-overview-heading"><span>At a glance</span><span>Strength + swimming</span></div>
            <div className="phone-preview-agenda">
              {sessions.map((session) => (
                <div className="phone-preview-agenda-row" key={session.day}>
                  <span className="phone-preview-agenda-day">{session.day}</span>
                  <span className={`phone-preview-agenda-icon phone-preview-agenda-icon-${session.tone}`}>
                    {session.tone === 'run' ? <Footprints size={16} strokeWidth={1.8} /> : <Dumbbell size={16} strokeWidth={1.8} />}
                  </span>
                  <div className="phone-preview-agenda-copy"><p>{session.title}</p><span>{session.done && <Check size={10} strokeWidth={2.5} />}{session.detail}</span></div>
                  <span className="phone-preview-agenda-duration">{session.duration}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="phone-preview-nav">
            {navigation.map(({ label, icon: Icon }) => (
              <span className={`phone-preview-nav-item${label === 'Calendar' ? ' phone-preview-nav-current' : ''}`} key={label}><Icon size={20} strokeWidth={1.7} /><span>{label}</span></span>
            ))}
          </div>
          <span className="phone-preview-home" />
        </div>
      </div>
      <figcaption>App preview <span>·</span> Illustrative data</figcaption>
    </figure>
  )
}
