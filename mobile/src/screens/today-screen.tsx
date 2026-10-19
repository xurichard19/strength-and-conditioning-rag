import { Activity, Check, ChevronRight, Dumbbell, Moon, Sparkles } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { SportsWorkoutDetails } from '@/components/sports-workout-details';
import { WorkoutDetails } from '@/components/workout-details';
import { AppText, Card, PrimaryButton, Screen, SecondaryButton, SectionTitle } from '@/components/ui';
import { milestones } from '@/data/mock';
import { calendarLabel, calendarTime, shiftDays, type CalendarEntry } from '@/lib/calendar';
import { todayIso } from '@/lib/dates';
import { useApp } from '@/state/app-context';
import { useCalendarRange } from '@/state/use-calendar-range';

/** Feature planned workouts; other sessions stay compact and open their saved details. */
function DailyWorkout({ session, onOpen }: { session: CalendarEntry; onOpen: () => void }) {
  const { colors } = useApp();
  const planned = session.kind === 'workout' && session.status === 'planned';
  const exercises = session.exercises ?? [];
  const Icon = session.status === 'completed' ? Check : session.kind === 'sport' ? Activity : Dumbbell;
  const color = session.status === 'completed' ? colors.success : session.kind === 'sport' ? colors.endurance : colors.strength;
  const status = session.status.replaceAll('_', ' ');
  const detail = session.kind === 'workout' ? `${exercises.length} ${exercises.length === 1 ? 'exercise' : 'exercises'}`
    : [calendarTime(session.startTime), session.minutes ? `${session.minutes} min` : null].filter(Boolean).join(' · ');
  const badge = <View style={[styles.badge, { backgroundColor: colors.fill }]}><Icon size={20} color={color} strokeWidth={1.6} /></View>;

  if (!planned) return <Pressable accessibilityRole="button" accessibilityLabel={`View ${session.title} workout`}
    accessibilityHint="Opens saved session details" onPress={onOpen} style={({ pressed }) => pressed && styles.pressed}>
    <Card style={styles.compact}>
      {badge}
      <View style={styles.copy}>
        <AppText weight="medium" style={styles.compactTitle}>{session.title}</AppText>
        <AppText tone="secondary" style={styles.caption}>{session.kind === 'sport' ? 'Sports · ' : ''}
          {status.charAt(0).toUpperCase() + status.slice(1)}{detail ? ` · ${detail}` : ''}</AppText>
      </View>
      <ChevronRight color={colors.textTertiary} size={18} />
    </Card>
  </Pressable>;

  return <Card style={styles.session}>
    <View style={styles.row}>
      <View style={styles.copy}>
        <AppText tone="secondary" weight="medium" style={styles.eyebrow}>Planned workout</AppText>
        <AppText style={styles.title}>{session.title}</AppText>
      </View>
      {badge}
    </View>
    <AppText tone="secondary" style={styles.caption}>{detail}</AppText>
    {session.notes ? <AppText tone="secondary" numberOfLines={3} style={styles.body}>{session.notes}</AppText> : null}
    {exercises.length ? <View style={[styles.exercises, { borderTopColor: colors.separator }]}>
      {exercises.map((exercise, index) => <View key={exercise.id} style={styles.row}>
        <AppText tone="secondary" style={styles.number}>{String(index + 1).padStart(2, '0')}</AppText>
        <AppText style={[styles.body, styles.copy]}>{exercise.name}</AppText>
      </View>)}
    </View> : null}
    <PrimaryButton accessibilityLabel={`Start ${session.title}`} accessibilityHint="Opens the saved exercises and set targets" onPress={onOpen}>
      Start session
    </PrimaryButton>
  </Card>;
}

export default function TodayScreen() {
  const { colors, authSession } = useApp();
  const [today, setToday] = useState(todayIso);
  const [opened, setOpened] = useState<{ id: string; kind: CalendarEntry['kind']; userId: string } | null>(null);
  const { data, loading, error, refresh } = useCalendarRange(today, today);
  const sessions = data?.entries.filter(session => session.date === today && session.status !== 'cancelled') ?? [];
  const selected = opened?.userId === authSession?.user.id
    ? sessions.find(session => session.id === opened?.id && session.kind === opened?.kind) : undefined;
  const open = (session: CalendarEntry) => {
    if (authSession) setOpened({ id: session.id, kind: session.kind, userId: authSession.user.id });
  };
  // One midnight timer and a resume check keep Today on the current local date.
  useEffect(() => {
    const timer = setTimeout(() => setToday(todayIso()), Math.max(0, new Date(`${shiftDays(today, 1)}T00:00:00`).getTime() - Date.now()) + 100);
    const listener = AppState.addEventListener('change', status => { if (status === 'active') setToday(todayIso()); });
    return () => { clearTimeout(timer); listener.remove(); };
  }, [today]);

  return <Screen title="Today" subtitle={calendarLabel(today, { weekday: 'long', month: 'long', day: 'numeric' })}
    onRefresh={refresh} refreshing={loading} preview={false}>
    <SectionTitle>Your session</SectionTitle>
    {error ? <Card style={styles.session}>
      <AppText style={{ color: colors.danger }}>{error}</AppText>
      {data ? <AppText tone="secondary">Showing your last loaded workouts. They may be out of date.</AppText> : null}
      <SecondaryButton onPress={() => void refresh()}>Retry workouts</SecondaryButton>
    </Card> : null}
    {sessions.map(session => <DailyWorkout key={`${session.kind}:${session.id}`} session={session} onOpen={() => open(session)} />)}
    {data && !loading && !error && !sessions.length ? <Card style={styles.rest}>
      <Moon size={26} color={colors.textSecondary} strokeWidth={1.5} />
      <AppText style={styles.restTitle}>No workout today.</AppText>
      <AppText tone="secondary" style={styles.body}>Take it easy and enjoy a little recovery.</AppText>
    </Card> : null}
    <SectionTitle>Recent progress</SectionTitle>
    <Card style={styles.row}>
      <View style={[styles.milestoneIcon, { backgroundColor: colors.tintSoft }]}><Sparkles color={colors.tintText} size={20} /></View>
      <View style={styles.copy}>
        <AppText weight="semibold">{milestones[0].text}</AppText>
        <AppText tone="secondary" style={styles.caption}>A milestone from {milestones[0].when}</AppText>
      </View>
    </Card>
    {selected && opened ? selected.kind === 'sport'
      ? <SportsWorkoutDetails key={`${opened.userId}:${opened.id}`} session={selected} userId={opened.userId} onClose={() => setOpened(null)} />
      : <WorkoutDetails session={selected} onClose={() => setOpened(null)} /> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  session: { gap: 16, padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, minWidth: 0, gap: 5 },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, lineHeight: 16, letterSpacing: 1.1, textTransform: 'uppercase' },
  title: { fontSize: 27, lineHeight: 34, letterSpacing: -0.7 },
  body: { fontSize: 14, lineHeight: 22 },
  caption: { fontSize: 12, lineHeight: 18 },
  exercises: { gap: 12, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  number: { width: 22, fontSize: 11, fontVariant: ['tabular-nums'] },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18 },
  compactTitle: { fontSize: 16, lineHeight: 22 },
  milestoneIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rest: { alignItems: 'center', gap: 12, paddingVertical: 30 },
  restTitle: { fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  pressed: { opacity: 0.7 },
});
