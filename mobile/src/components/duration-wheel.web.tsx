import { useEffect, useRef } from 'react';

import { fonts, radius } from '@/design/tokens';
import { formatSessionDuration, normalizeSessionMinutes, sessionDurationAtIndex, SESSION_DURATIONS, SESSION_MINUTES_MAX, SESSION_MINUTES_MIN } from '@/lib/session-duration';
import { useApp } from '@/state/app-context';
import type { DurationWheelProps } from './duration-wheel';

const ROW_HEIGHT = 52;
const PADDING = ROW_HEIGHT * 2;
const offsetFor = (minutes: number) => SESSION_DURATIONS.indexOf(minutes) * ROW_HEIGHT;

export function DurationWheel({ minutes, onChange }: DurationWheelProps) {
  const { colors } = useApp();
  const scroll = useRef<HTMLDivElement>(null);
  const selected = normalizeSessionMinutes(minutes);
  const latest = useRef(selected);

  useEffect(() => {
    scroll.current?.scrollTo({ top: offsetFor(latest.current), behavior: 'instant' });
  }, []);
  useEffect(() => {
    if (latest.current !== selected) {
      latest.current = selected;
      scroll.current?.scrollTo({ top: offsetFor(selected), behavior: 'instant' });
    }
  }, [selected]);

  const change = (value: number) => {
    const next = normalizeSessionMinutes(value);
    if (next !== latest.current) {
      latest.current = next;
      onChange(next);
    }
  };
  const select = (value: number) => {
    const next = normalizeSessionMinutes(value);
    change(next);
    scroll.current?.scrollTo({ top: offsetFor(next), behavior: 'instant' });
  };

  return (
    <div style={{ position: 'relative', height: ROW_HEIGHT * 5, width: '100%', maxWidth: 300, margin: '0 auto' }}>
      <style>{`
        .arcel-duration-wheel::-webkit-scrollbar { display: none; }
        .arcel-duration-wheel:focus-visible { outline: 2px solid ${colors.tint}; outline-offset: 4px; }
      `}</style>
      <div aria-hidden style={{ position: 'absolute', pointerEvents: 'none', top: PADDING, left: 0, right: 0,
        height: ROW_HEIGHT, boxSizing: 'border-box', borderRadius: radius.card, background: colors.tintSoft, border: `1px solid ${colors.tint}` }} />
      <div ref={scroll} className="arcel-duration-wheel" role="spinbutton" tabIndex={0} aria-label="Session length"
        aria-valuemin={SESSION_MINUTES_MIN} aria-valuemax={SESSION_MINUTES_MAX} aria-valuenow={selected} aria-valuetext={formatSessionDuration(selected)}
        onScroll={event => change(sessionDurationAtIndex(event.currentTarget.scrollTop / ROW_HEIGHT))}
        onKeyDown={event => {
          const index = SESSION_DURATIONS.indexOf(latest.current);
          const values: Record<string, number> = { ArrowUp: sessionDurationAtIndex(index + 1), ArrowDown: sessionDurationAtIndex(index - 1),
            Home: SESSION_MINUTES_MIN, End: SESSION_MINUTES_MAX };
          if (event.key in values) { event.preventDefault(); select(values[event.key]); }
        }}
        style={{ position: 'relative', height: '100%', overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none',
          scrollSnapType: 'y mandatory', overscrollBehaviorY: 'contain', borderRadius: radius.card }}>
        <div aria-hidden style={{ paddingBlock: PADDING }}>
          {SESSION_DURATIONS.map((value, index) => {
            const distance = Math.abs(index - SESSION_DURATIONS.indexOf(selected));
            return <div key={value} onClick={() => { select(value); scroll.current?.focus({ preventScroll: true }); }}
              style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center',
                scrollSnapAlign: 'center', cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ fontFamily: value === selected ? fonts.semibold : fonts.regular, fontSize: 24, lineHeight: '32px',
                fontVariantNumeric: 'tabular-nums', color: value === selected ? colors.tintText : colors.textSecondary,
                opacity: distance > 1 ? 0.35 : distance === 1 ? 0.65 : 1,
                transform: `scale(${distance > 1 ? 0.82 : distance === 1 ? 0.92 : 1})` }}>{formatSessionDuration(value)}</span>
            </div>;
          })}
        </div>
      </div>
    </div>
  );
}
