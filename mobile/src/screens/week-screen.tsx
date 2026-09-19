import { Activity, ArrowUpRight, Check, ChevronLeft, ChevronRight, Dumbbell, Ellipsis } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen, SecondaryButton, SectionTitle } from '@/components/ui';
import { CalendarDayActions } from '@/components/calendar-day-actions';
import { SportsWorkoutDetails } from '@/components/sports-workout-details';
import type { Palette } from '@/design/tokens';
import { calendarLabel, calendarRange, calendarTime, monthDates, shiftDays, shiftMonth, weekDates, type CalendarEntry } from '@/lib/calendar';
import { formatDay, isToday, todayIso } from '@/lib/dates';
import { useApp } from '@/state/app-context';
import { useCalendarRange } from '@/state/use-calendar-range';

const statusLabels = { planned: 'Planned', in_progress: 'In progress', completed: 'Completed', skipped: 'Skipped', cancelled: 'Cancelled' };
const entryColor = (entry: CalendarEntry, colors: Palette) => entry.kind === 'sport' ? colors.endurance : colors.strength;

function selectedDayLabel(date: string) {
  if (isToday(date)) return 'Today';
  return calendarLabel(date, { weekday: 'long', month: 'short', day: 'numeric' });
}

function entryDetails(entry: CalendarEntry) {
  if (entry.kind === 'workout') return `${entry.exerciseCount} exercises`;
  return [calendarTime(entry.startTime), entry.minutes ? `${entry.minutes} min` : null,
    entry.intensity ? entry.intensity.charAt(0).toUpperCase() + entry.intensity.slice(1) : null].filter(Boolean).join(' · ');
}

function dayAppearance(colors: Palette, selected: boolean, today: boolean, compact: boolean) {
  const highlight = { backgroundColor: selected ? colors.strong : 'transparent', borderColor: today ? colors.tint : 'transparent' };
  if (compact) return { container: styles.monthDay, disc: [styles.dayDisc, highlight] };
  return { container: [styles.day, highlight], disc: styles.dayDisc };
}

function daySummary(sessions: CalendarEntry[], loaded: boolean) {
  if (!loaded) return 'Workouts not loaded';
  if (!sessions.length) return 'No workouts planned';
  return sessions.map((session) => `${session.title}, ${session.status}`).join('; ');
}

function CalendarDay({ date, sessions, selected, loaded, compact = false, inMonth = true, onSelect, onHold }: {
  date: string; sessions: CalendarEntry[]; selected: boolean; loaded: boolean;
  compact?: boolean; inMonth?: boolean; onSelect: () => void; onHold: () => void;
}) {
  const { colors } = useApp();
  const today = isToday(date);
  const tone = selected ? 'inverse' : 'secondary';
  const dots = [...new Set(sessions.map((session) => entryColor(session, colors)))];
  const appearance = dayAppearance(colors, selected, today, compact);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }}
      accessibilityLabel={`${calendarLabel(date, { dateStyle: 'full' })}${today ? ', today' : ''}. ${daySummary(sessions, loaded)}`}
      accessibilityHint="Hold for day options" accessibilityActions={[{ name: 'longpress', label: 'Day options' }]}
      onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'longpress') onHold(); }}
      onLongPress={onHold} delayLongPress={450}
      onPress={onSelect} style={[appearance.container, { opacity: inMonth ? 1 : 0.45 }]}>
      {!compact ? <AppText tone={tone} weight="medium" style={styles.dayLabel}>{formatDay(date)}</AppText> : null}
      <View style={appearance.disc}>
        <AppText tone={selected ? 'inverse' : 'default'} weight={selected || today ? 'medium' : 'regular'} style={styles.dayNumber}>{Number(date.slice(-2))}</AppText>
      </View>
      <View style={styles.dayDots}>
        {dots.map((color) => <View key={color} style={[styles.dayDot, { backgroundColor: selected && !compact ? colors.strongText : color }]} />)}
      </View>
    </Pressable>
  );
}

function CalendarGrid({ view, selectedDate, byDate, loaded, onSelect, onHold }: {
  view: 'week' | 'month'; selectedDate: string; byDate: Map<string, CalendarEntry[]>; loaded: boolean;
  onSelect: (date: string) => void; onHold: (date: string) => void;
}) {
  if (view === 'week') return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
    {weekDates(selectedDate).map((date) => <CalendarDay key={date} date={date} sessions={byDate.get(date) ?? []}
      loaded={loaded} selected={date === selectedDate} onSelect={() => onSelect(date)} onHold={() => onHold(date)} />)}
  </ScrollView>;

  const cells = monthDates(selectedDate);
  return <Card style={styles.monthCard}>
    <View style={styles.calendarRow}>
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <View key={day} style={styles.weekday}>
        <AppText tone="secondary" weight="medium" style={styles.dayLabel}>{day}</AppText>
      </View>)}
    </View>
    {Array.from({ length: cells.length / 7 }, (_, row) => <View key={row} style={styles.calendarRow}>
      {cells.slice(row * 7, row * 7 + 7).map(({ date, inMonth }) => <CalendarDay key={date} date={date}
        sessions={byDate.get(date) ?? []} loaded={loaded && inMonth} selected={date === selectedDate}
        compact inMonth={inMonth} onSelect={() => onSelect(date)} onHold={() => onHold(date)} />)}
    </View>)}
  </Card>;
}

function CalendarFeedback({ loading, error, hasData, onRetry }: {
  loading: boolean; error: string | null; hasData: boolean; onRetry: () => void;
}) {
  const { colors } = useApp();
  return <>
    {loading && !hasData ? <View accessibilityLiveRegion="polite" style={styles.loading}>
      <ActivityIndicator color={colors.tint} size="small" />
      <AppText tone="secondary">Loading calendar…</AppText>
    </View> : null}
    {error ? <Card style={styles.selectedCard}>
      <AppText style={{ color: colors.danger }}>{error}</AppText>
      {hasData ? <AppText tone="secondary">Showing the last loaded calendar. It may be out of date.</AppText> : null}
      <SecondaryButton onPress={onRetry}>Retry calendar</SecondaryButton>
    </Card> : null}
  </>;
}

function EntryBadge({ entry, size = 40 }: { entry: CalendarEntry; size?: number }) {
  const { colors } = useApp();
  const Icon = entry.status === 'completed' ? Check : entry.kind === 'sport' ? Activity : Dumbbell;
  return <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
    <Icon size={size / 2} strokeWidth={1.6} color={entry.status === 'completed' ? colors.success : entryColor(entry, colors)} />
  </View>;
}

function SelectedSession({ session, onOpen }: { session: CalendarEntry; onOpen: () => void }) {
  const { colors } = useApp();
  const detail = entryDetails(session);
  const card = (
      <Card style={styles.selectedCard}>
        <View style={styles.sessionEyebrowRow}>
          <AppText tone="secondary" weight="medium" style={styles.sessionEyebrow}>{session.kind === 'sport' ? 'Sports session' : 'Workout'}</AppText>
          <View style={[styles.statusDot, { backgroundColor: session.status === 'completed' ? colors.success : colors.textTertiary }]} />
          <AppText tone="secondary" style={styles.meta}>{statusLabels[session.status]}</AppText>
        </View>
        <View style={styles.selectedHeader}>
          <View style={styles.copy}>
            <AppText style={styles.sessionTitle}>{session.title}</AppText>
          </View>
          <EntryBadge entry={session} />
        </View>
        {detail ? <AppText tone="secondary" style={styles.detail}>{detail}</AppText> : null}
        {session.notes ? <AppText tone="secondary" style={[styles.detail, styles.sessionNotes, { borderTopColor: colors.separator }]}>{session.notes}</AppText> : null}
        {session.kind === 'sport' ? <View style={[styles.detailsLink, { borderTopColor: colors.separator }]}>
          <AppText tone="tint" weight="medium" style={styles.meta}>Session details</AppText>
          <ArrowUpRight color={colors.tintText} size={17} strokeWidth={1.6} />
        </View> : null}
      </Card>
  );
  return session.kind === 'sport' ? <Pressable accessibilityRole="button" accessibilityLabel={`View ${session.title} workout`}
    onPress={onOpen} style={({ pressed }) => pressed && styles.pressed}>{card}</Pressable> : card;
}

function DayAgenda({ sessions, ready, onOpen }: {
  sessions: CalendarEntry[]; ready: boolean; onOpen: (session: CalendarEntry) => void;
}) {
  if (sessions.length) return <>{sessions.map((session) => <SelectedSession key={`${session.kind}:${session.id}`}
    session={session} onOpen={() => onOpen(session)} />)}</>;
  if (!ready) return null;
  return <Card><AppText tone="secondary">No workouts planned for this day.</AppText></Card>;
}

function SessionRow({ session, last, onSelect }: { session: CalendarEntry; last: boolean; onSelect: () => void }) {
  const { colors } = useApp();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${formatDay(session.date)}: ${session.title}`} onPress={onSelect} style={({ pressed }) => [styles.listRow, !last && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && styles.pressed]}>
      <AppText tone="secondary" weight="medium" style={styles.listDay}>{isToday(session.date) ? 'Today' : formatDay(session.date)}</AppText>
      <EntryBadge entry={session} size={32} />
      <View style={styles.copy}>
        <AppText weight="medium" numberOfLines={1}>{session.title}</AppText>
        <AppText tone="secondary" style={styles.meta}>{statusLabels[session.status]}</AppText>
      </View>
      {session.minutes ? <AppText tone="secondary" style={styles.meta}>{session.minutes}m</AppText> : null}
    </Pressable>
  );
}

export default function WeekScreen() {
  const { colors, authSession } = useApp();
  const [view, setView] = useState<'week' | 'month'>('week');
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [heldDate, setHeldDate] = useState<string | null>(null);
  const [openedSport, setOpenedSport] = useState<{ id: string; userId: string } | null>(null);
  const [start, end] = calendarRange(selectedDate, view);
  const { data, loading, error, refresh } = useCalendarRange(start, end);
  const selectedSport = openedSport?.userId === authSession?.user.id
    ? data?.entries.find(entry => entry.kind === 'sport' && entry.id === openedSport?.id) : undefined;
  const openSport = (session: CalendarEntry) => {
    if (session.kind === 'sport' && authSession) setOpenedSport({ id: session.id, userId: authSession.user.id });
  };
  const hold = (date: string) => { setSelectedDate(date); setHeldDate(date); };
  const byDate = useMemo(() => {
    const days = new Map<string, CalendarEntry[]>();
    for (const session of data?.entries ?? []) {
      if (!days.has(session.date)) days.set(session.date, []);
      days.get(session.date)!.push(session);
    }
    return days;
  }, [data]);
  const week = weekDates(selectedDate);
  const selected = byDate.get(selectedDate) ?? [];
  const weekSessions = week.flatMap((date) => byDate.get(date) ?? []);
  const periodTitle = view === 'month'
    ? calendarLabel(selectedDate, { month: 'long', year: 'numeric' })
    : `${calendarLabel(week[0], { month: 'short', day: 'numeric' })} – ${calendarLabel(week[6], { month: 'short', day: 'numeric' })}`;
  const step = (direction: number) => setSelectedDate(view === 'month' ? shiftMonth(selectedDate, direction) : shiftDays(selectedDate, direction * 7));

  return (
    <Screen title="Calendar" subtitle="Your training, in view." context={`training calendar for ${selectedDate}`} onRefresh={refresh} refreshing={loading && Boolean(data)} preview={false}>
      <View style={styles.toolbar}>
        <View accessibilityRole="tablist" accessibilityLabel="Calendar view" style={[styles.viewSwitch, { borderColor: colors.separator }]}>
          {(['week', 'month'] as const).map((option) => <Pressable key={option} accessibilityRole="tab"
            accessibilityLabel={option === 'week' ? 'Week view' : 'Month view'} aria-selected={view === option}
            onPress={() => setView(option)} style={[styles.viewOption, view === option && { backgroundColor: colors.fill }]}>
            <AppText weight="medium" tone={view === option ? 'default' : 'secondary'} style={styles.controlText}>{option === 'week' ? 'Week' : 'Month'}</AppText>
          </Pressable>)}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Go to today" onPress={() => setSelectedDate(todayIso())} style={styles.todayButton}>
          <AppText tone="tint" weight="medium" style={styles.controlText}>Today</AppText>
        </Pressable>
      </View>
      <View style={styles.periodHeader}>
        <AppText weight="medium" style={styles.periodTitle}>{periodTitle}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={`Previous ${view}`} onPress={() => step(-1)} style={styles.stepButton}>
          <ChevronLeft color={colors.textSecondary} size={21} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Next ${view}`} onPress={() => step(1)} style={styles.stepButton}>
          <ChevronRight color={colors.textSecondary} size={21} />
        </Pressable>
      </View>
      <CalendarGrid view={view} selectedDate={selectedDate} byDate={byDate} loaded={Boolean(data)} onSelect={setSelectedDate} onHold={hold} />
      <CalendarFeedback loading={loading} error={error} hasData={Boolean(data)} onRetry={() => void refresh()} />

      <View style={styles.agendaHeading}>
        <View style={styles.copy}><SectionTitle>{selectedDayLabel(selectedDate)}</SectionTitle></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Options for selected day" onPress={() => setHeldDate(selectedDate)} style={styles.stepButton}>
          <Ellipsis color={colors.textSecondary} size={22} />
        </Pressable>
      </View>
      <DayAgenda sessions={selected} ready={Boolean(data) && !loading && !error} onOpen={openSport} />

      {view === 'week' && weekSessions.length > 0 ? <>
        <SectionTitle>At a glance</SectionTitle>
        <View style={[styles.listCard, { borderTopColor: colors.separator }]}>
          {weekSessions.map((session, index) => <SessionRow key={`${session.kind}:${session.id}`} session={session} last={index === weekSessions.length - 1}
            onSelect={() => { setSelectedDate(session.date); openSport(session); }} />)}
        </View>
      </> : null}
      {heldDate ? <CalendarDayActions date={heldDate} onClose={() => setHeldDate(null)} /> : null}
      {selectedSport && openedSport ? <SportsWorkoutDetails key={`${openedSport.userId}:${openedSport.id}`}
        session={selectedSport} userId={openedSport.userId} onClose={() => setOpenedSport(null)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 5 },
  agendaHeading: { flexDirection: 'row', alignItems: 'center' },
  viewSwitch: { flexDirection: 'row', borderRadius: 24, padding: 3, borderWidth: StyleSheet.hairlineWidth },
  viewOption: { minWidth: 76, minHeight: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  controlText: { fontSize: 13, lineHeight: 18 },
  todayButton: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  periodHeader: { flexDirection: 'row', alignItems: 'center' },
  periodTitle: { flex: 1, fontSize: 18, lineHeight: 25, letterSpacing: -0.4 },
  stepButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthCard: { paddingHorizontal: 4, paddingVertical: 10 },
  calendarRow: { flexDirection: 'row' },
  weekday: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  monthDay: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dayStrip: { flexGrow: 1, gap: 4, paddingBottom: 4 },
  day: { flex: 1, minWidth: 44, minHeight: 82, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayLabel: { fontSize: 10, lineHeight: 15 },
  dayDisc: { minWidth: 36, minHeight: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  dayNumber: { fontSize: 19, lineHeight: 25 },
  dayDots: { flexDirection: 'row', gap: 3, height: 5 },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  selectedCard: { gap: 14, padding: 20 },
  sessionEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sessionEyebrow: { flex: 1, fontSize: 10, lineHeight: 16, letterSpacing: 1.1, textTransform: 'uppercase' },
  statusDot: { width: 4, height: 4, borderRadius: 2 },
  selectedHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
  sessionTitle: { fontSize: 28, lineHeight: 34, letterSpacing: -0.8 },
  sessionNotes: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  detailsLink: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 13 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  meta: { fontSize: 12, lineHeight: 17 },
  detail: { fontSize: 14, lineHeight: 20 },
  listCard: { borderTopWidth: StyleSheet.hairlineWidth },
  listRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10 },
  listDay: { width: 42, fontSize: 12 },
  pressed: { opacity: 0.7 },
});
