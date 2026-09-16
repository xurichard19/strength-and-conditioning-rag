import { router } from 'expo-router';
import { Check, ChevronLeft, ChevronRight, Clock3, Ellipsis } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, ModalityBadge, Screen, SectionTitle, ShieldLine } from '@/components/ui';
import { CalendarDayActions } from '@/components/calendar-day-actions';
import type { Palette } from '@/design/tokens';
import type { Session } from '@/domain/types';
import { calendarLabel, monthDates, shiftDays, shiftMonth, weekDates } from '@/lib/calendar';
import { formatDay, isToday, todayIso } from '@/lib/dates';
import { useApp } from '@/state/app-context';

const modalityColorKeys: Record<Session['modality'], keyof Pick<Palette, 'strength' | 'endurance' | 'mixed'> | null> = {
  strength: 'strength',
  endurance: 'endurance',
  mixed: 'mixed',
  rest: null,
};

function dayDotColor(session: Session, colors: Palette) {
  const colorKey = modalityColorKeys[session.modality];
  return colorKey ? colors[colorKey] : colors.textTertiary;
}

function selectedDayLabel(date: string) {
  if (isToday(date)) return 'Today';
  return calendarLabel(date, { weekday: 'long', month: 'short', day: 'numeric' });
}

function selectedStatus(session: Session, colors: Palette) {
  if (session.status === 'done') return { label: 'Done', color: colors.success, Icon: Check, size: 15 };
  if (session.status === 'skipped') return { label: 'Skipped', color: colors.textSecondary, Icon: Clock3, size: 14 };
  if (session.modality === 'rest') return { label: 'Recovery day', color: colors.textSecondary, Icon: Clock3, size: 14 };
  return { label: `${session.minutes} min`, color: colors.textSecondary, Icon: Clock3, size: 14 };
}

function CalendarDay({ date, sessions, selected, compact = false, inMonth = true, onSelect, onHold }: {
  date: string; sessions: Session[]; selected: boolean; compact?: boolean; inMonth?: boolean; onSelect: () => void; onHold: () => void;
}) {
  const { colors } = useApp();
  const today = isToday(date);
  const tone = selected ? 'inverse' : 'secondary';
  const dots = [...new Set(sessions.map((session) => dayDotColor(session, colors)))].slice(0, 3);
  const summary = sessions.length ? sessions.map((session) => `${session.title}, ${session.status}`).join('; ') : 'No workouts planned';
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }}
      accessibilityLabel={`${calendarLabel(date, { dateStyle: 'full' })}${today ? ', today' : ''}. ${summary}`}
      accessibilityHint="Hold for day options" accessibilityActions={[{ name: 'longpress', label: 'Day options' }]}
      onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'longpress') onHold(); }}
      onLongPress={onHold} delayLongPress={450}
      onPress={onSelect} style={[compact ? styles.monthDay : styles.day, { opacity: inMonth ? 1 : 0.45 },
        !compact && { backgroundColor: selected ? colors.strong : colors.card, borderColor: today ? colors.tint : 'transparent' }]}>
      {!compact ? <AppText tone={tone} weight="medium" style={styles.dayLabel}>{formatDay(date)}</AppText> : null}
      <View style={[styles.dayDisc, compact && { backgroundColor: selected ? colors.strong : 'transparent', borderColor: today ? colors.tint : 'transparent' }]}>
        <AppText tone={selected ? 'inverse' : 'default'} weight={selected || today ? 'bold' : 'medium'} style={styles.dayNumber}>{Number(date.slice(-2))}</AppText>
      </View>
      <View style={styles.dayDots}>
        {dots.map((color) => <View key={color} style={[styles.dayDot, { backgroundColor: color }]} />)}
      </View>
    </Pressable>
  );
}

function SelectedSession({ session }: { session: Session }) {
  const { colors } = useApp();
  const isRest = session.modality === 'rest';
  const status = selectedStatus(session, colors);
  const StatusIcon = status.Icon;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={session.title} disabled={isRest} onPress={() => router.push(`/session/${session.id}`)}>
      <Card style={styles.selectedCard}>
        <View style={styles.selectedHeader}>
          <ModalityBadge modality={session.modality} />
          <View style={styles.copy}>
            <AppText weight="bold" style={styles.sessionTitle}>{session.title}</AppText>
            <View style={styles.metadata}>
              <StatusIcon color={status.color} size={status.size} />
              <AppText tone="secondary" style={styles.meta}>{status.label}</AppText>
            </View>
          </View>
          {!isRest ? <ChevronRight color={colors.textTertiary} size={20} /> : null}
        </View>
        {session.intent ? <AppText tone="secondary" style={styles.intent}>{session.intent}</AppText> : null}
        {session.repairedNote ? <ShieldLine>{session.repairedNote}</ShieldLine> : null}
      </Card>
    </Pressable>
  );
}

function SessionRow({ session, last, onSelect }: { session: Session; last: boolean; onSelect: () => void }) {
  const { colors } = useApp();
  const open = () => {
    onSelect();
    if (session.modality !== 'rest') router.push(`/session/${session.id}`);
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${formatDay(session.date)}: ${session.title}`} onPress={open} style={[styles.listRow, !last && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <AppText tone="secondary" weight="medium" style={styles.listDay}>{isToday(session.date) ? 'Today' : formatDay(session.date)}</AppText>
      <ModalityBadge modality={session.modality} size={32} />
      <View style={styles.copy}>
        <AppText weight="medium" numberOfLines={1}>{session.title}</AppText>
        {session.status === 'skipped' ? <AppText tone="secondary" style={styles.meta}>No debt carried forward</AppText> : null}
      </View>
      {session.minutes ? <AppText tone="secondary" style={styles.meta}>{session.minutes}m</AppText> : null}
    </Pressable>
  );
}

export default function WeekScreen() {
  const { sessions, block, colors, refreshPreview } = useApp();
  const [view, setView] = useState<'week' | 'month'>('week');
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [heldDate, setHeldDate] = useState<string | null>(null);
  const hold = (date: string) => { setSelectedDate(date); setHeldDate(date); };
  const byDate = useMemo(() => {
    const days = new Map<string, Session[]>();
    for (const session of sessions) {
      if (!days.has(session.date)) days.set(session.date, []);
      days.get(session.date)!.push(session);
    }
    return days;
  }, [sessions]);
  const week = weekDates(selectedDate);
  const cells = monthDates(selectedDate);
  const selected = byDate.get(selectedDate) ?? [];
  const weekSessions = week.flatMap((date) => byDate.get(date) ?? []);
  const periodTitle = view === 'month'
    ? calendarLabel(selectedDate, { month: 'long', year: 'numeric' })
    : `${calendarLabel(week[0], { month: 'short', day: 'numeric' })} – ${calendarLabel(week[6], { month: 'short', day: 'numeric' })}`;
  const step = (direction: number) => setSelectedDate(view === 'month' ? shiftMonth(selectedDate, direction) : shiftDays(selectedDate, direction * 7));

  return (
    <Screen title="Calendar" subtitle={`Week ${block.week} of ${block.of} · ${block.name} block`} context={`training calendar for ${selectedDate}`} wash="week" onRefresh={refreshPreview}>
      <View style={styles.toolbar}>
        <View accessibilityRole="tablist" accessibilityLabel="Calendar view" style={[styles.viewSwitch, { backgroundColor: colors.fill }]}>
          {(['week', 'month'] as const).map((option) => <Pressable key={option} accessibilityRole="tab"
            accessibilityLabel={option === 'week' ? 'Week view' : 'Month view'} aria-selected={view === option}
            onPress={() => setView(option)} style={[styles.viewOption, view === option && { backgroundColor: colors.card }]}>
            <AppText weight="medium" tone={view === option ? 'default' : 'secondary'} style={styles.controlText}>{option === 'week' ? 'Week' : 'Month'}</AppText>
          </Pressable>)}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Go to today" onPress={() => setSelectedDate(todayIso())} style={styles.todayButton}>
          <AppText tone="tint" weight="medium" style={styles.controlText}>Today</AppText>
        </Pressable>
      </View>
      <View style={styles.periodHeader}>
        <AppText weight="semibold" style={styles.periodTitle}>{periodTitle}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={`Previous ${view}`} onPress={() => step(-1)} style={styles.stepButton}>
          <ChevronLeft color={colors.textSecondary} size={21} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Next ${view}`} onPress={() => step(1)} style={styles.stepButton}>
          <ChevronRight color={colors.textSecondary} size={21} />
        </Pressable>
      </View>
      {view === 'week' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
          {week.map((date) => <CalendarDay key={date} date={date} sessions={byDate.get(date) ?? []}
            selected={date === selectedDate} onSelect={() => setSelectedDate(date)} onHold={() => hold(date)} />)}
        </ScrollView>
      ) : (
        <Card style={styles.monthCard}>
          <View style={styles.calendarRow}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <View key={day} style={styles.weekday}>
              <AppText tone="secondary" weight="medium" style={styles.dayLabel}>{day}</AppText>
            </View>)}
          </View>
          {Array.from({ length: 6 }, (_, row) => <View key={row} style={styles.calendarRow}>
            {cells.slice(row * 7, row * 7 + 7).map(({ date, inMonth }) => <CalendarDay key={date} date={date}
              sessions={byDate.get(date) ?? []} selected={date === selectedDate} compact inMonth={inMonth} onSelect={() => setSelectedDate(date)} onHold={() => hold(date)} />)}
          </View>)}
        </Card>
      )}

      <View style={styles.agendaHeading}>
        <View style={styles.copy}><SectionTitle>{selectedDayLabel(selectedDate)}</SectionTitle></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Options for selected day" onPress={() => setHeldDate(selectedDate)} style={styles.stepButton}>
          <Ellipsis color={colors.textSecondary} size={22} />
        </Pressable>
      </View>
      {selected.length ? selected.map((session) => <SelectedSession key={session.id} session={session} />)
        : <Card><AppText tone="secondary">No workouts planned for this day.</AppText></Card>}

      {view === 'week' && weekSessions.length > 0 ? <>
        <SectionTitle>At a glance</SectionTitle>
        <Card style={styles.listCard}>
          {weekSessions.map((session, index) => <SessionRow key={session.id} session={session} last={index === weekSessions.length - 1} onSelect={() => setSelectedDate(session.date)} />)}
        </Card>
      </> : null}
      {heldDate ? <CalendarDayActions date={heldDate} onClose={() => setHeldDate(null)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  agendaHeading: { flexDirection: 'row', alignItems: 'center' },
  viewSwitch: { flexDirection: 'row', borderRadius: 14, padding: 4 },
  viewOption: { minWidth: 82, minHeight: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  controlText: { fontSize: 14, lineHeight: 18 },
  todayButton: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  periodHeader: { flexDirection: 'row', alignItems: 'center' },
  periodTitle: { flex: 1, fontSize: 20, lineHeight: 26, letterSpacing: -0.5 },
  stepButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthCard: { paddingHorizontal: 4, paddingVertical: 10 },
  calendarRow: { flexDirection: 'row' },
  weekday: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  monthDay: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dayStrip: { gap: 8, paddingRight: 10 },
  day: { width: 54, height: 88, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayLabel: { fontSize: 11, lineHeight: 15 },
  dayDisc: { minWidth: 36, minHeight: 36, borderRadius: 18, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  dayNumber: { fontSize: 17, lineHeight: 22 },
  dayDots: { flexDirection: 'row', gap: 3, height: 5 },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  selectedCard: { gap: 12 },
  selectedHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
  sessionTitle: { fontSize: 20, lineHeight: 25, letterSpacing: -0.35 },
  metadata: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  meta: { fontSize: 12, lineHeight: 17 },
  intent: { fontSize: 14, lineHeight: 20 },
  listCard: { paddingVertical: 4 },
  listRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10 },
  listDay: { width: 42, fontSize: 12 },
});
