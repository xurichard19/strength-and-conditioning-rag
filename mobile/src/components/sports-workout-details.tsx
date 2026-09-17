import { LinearGradient } from 'expo-linear-gradient';
import { Activity, CalendarDays, Clock3, Ellipsis, FileText, Gauge, Timer } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { calendarLabel, calendarTime, type CalendarEntry } from '@/lib/calendar';
import { errorMessage } from '@/lib/errors';
import { backendFor } from '@/services/api';
import { useApp } from '@/state/app-context';
import { ActionSheet } from './action-sheet';
import { AppText, OutlineButton } from './ui';

const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Sports fields already arrive with the calendar; opening details needs no extra request. */
function WorkoutFields({ session }: { session: CalendarEntry }) {
  const { colors } = useApp();
  const metrics = [
    { Icon: Clock3, name: 'Start time', value: calendarTime(session.startTime) ?? 'Not set' },
    { Icon: Timer, name: 'Planned duration', value: session.minutes == null ? 'Not set' : `${session.minutes} minutes` },
  ];
  return <ScrollView style={styles.scroll} contentContainerStyle={styles.fields} showsVerticalScrollIndicator={false}>
    <LinearGradient colors={[`${colors.endurance}18`, `${colors.endurance}04`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[styles.summary, { borderColor: `${colors.endurance}35` }]}>
      <View style={styles.summaryHeader}>
        <View style={[styles.sportIcon, { backgroundColor: `${colors.endurance}18` }]}><Activity color={colors.endurance} size={22} strokeWidth={1.8} /></View>
        <AppText tone="secondary" weight="semibold" style={styles.eyebrow}>SPORTS SESSION</AppText>
        <View style={[styles.status, { backgroundColor: colors.card }]}>
          <View style={[styles.statusDot, { backgroundColor: session.status === 'completed' ? colors.success : colors.textSecondary }]} />
          <AppText selectable weight="medium" style={styles.statusText}>{label(session.status)}</AppText>
        </View>
      </View>
      <View style={styles.date}>
        <CalendarDays color={colors.textSecondary} size={16} />
        <AppText selectable weight="medium" style={styles.dateText}>{calendarLabel(session.date, { dateStyle: 'full' })}</AppText>
      </View>
    </LinearGradient>
    <View style={styles.metrics}>
      {metrics.map(({ Icon, name, value }) => <View key={name} style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        <Icon color={colors.textSecondary} size={18} strokeWidth={1.8} />
        <AppText tone="secondary" style={styles.label}>{name}</AppText>
        <AppText selectable weight="semibold" style={styles.metricValue}>{value}</AppText>
      </View>)}
    </View>
    <View style={[styles.intensity, { backgroundColor: colors.card, borderColor: colors.separator }]}>
      <Gauge color={colors.textSecondary} size={18} strokeWidth={1.8} />
      <AppText tone="secondary" style={styles.intensityLabel}>Intensity</AppText>
      <AppText selectable weight="medium" style={styles.intensityValue}>{session.intensity ? label(session.intensity) : 'Not set'}</AppText>
    </View>
    <View style={[styles.notes, { backgroundColor: colors.card, borderColor: colors.separator }]}>
      <View style={styles.notesHeading}><FileText color={colors.textSecondary} size={17} strokeWidth={1.8} /><AppText weight="semibold" style={styles.notesTitle}>Notes</AppText></View>
      <AppText selectable tone="secondary" style={styles.notesText}>{session.notes || 'No notes added.'}</AppText>
    </View>
  </ScrollView>;
}

/** Confirm permanent deletion, scope it to the account, and revalidate affected calendar ranges. */
export function SportsWorkoutDetails({ session, userId, onClose }: {
  session: CalendarEntry; userId: string; onClose: () => void;
}) {
  const { colors, invalidateCalendar } = useApp();
  const [action, setAction] = useState<'details' | 'menu' | 'delete'>('details');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const buttonStyle = [styles.button, { borderColor: colors.textTertiary }];

  async function remove() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const deleted = await backendFor(userId).deleteSportsWorkout(session.id);
      // Another device may have moved this workout since the displayed range was loaded.
      if (deleted.scheduled_date !== session.date) invalidateCalendar(userId, deleted.scheduled_date, deleted.scheduled_date);
      if (mounted.current) onClose();
    } catch (failure) {
      pending.current = false;
      if (mounted.current) { setBusy(false); setError(errorMessage(failure, 'Could not delete this workout.')); }
    } finally {
      // A lost response can still mean a committed delete; never keep the old range fresh.
      invalidateCalendar(userId, session.date, session.date);
    }
  }

  return <ActionSheet title={action === 'delete' ? 'Delete sports workout?' : session.title}
    onClose={() => { if (!pending.current) onClose(); }}
    headerAction={action === 'details' ? <Pressable accessibilityRole="button" accessibilityLabel="Workout options"
      onPress={() => setAction('menu')} style={styles.options}>
      <Ellipsis color={colors.textSecondary} size={22} />
    </Pressable> : undefined}>
    {action === 'details' ? <WorkoutFields session={session} /> : <View style={styles.actions}>
      {action === 'delete' ? <AppText>Permanently delete {session.title.toLowerCase()} on {calendarLabel(session.date, { month: 'short', day: 'numeric', year: 'numeric' })}? This cannot be undone.</AppText> : null}
      {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
      <OutlineButton disabled={busy} style={[buttonStyle, { borderColor: colors.danger }]}
        onPress={action === 'menu' ? () => setAction('delete') : () => void remove()}>
        {busy ? 'Deleting…' : 'Delete workout'}
      </OutlineButton>
      <OutlineButton disabled={busy} style={buttonStyle} onPress={() => { setError(null); setAction('details'); }}>Cancel</OutlineButton>
    </View>}
  </ActionSheet>;
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  fields: { gap: 12, paddingTop: 8, paddingBottom: 12 },
  summary: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 14 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  sportIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { flex: 1, fontSize: 10, lineHeight: 15, letterSpacing: 0.8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 11, lineHeight: 15 },
  date: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateText: { flex: 1, fontSize: 14, lineHeight: 20 },
  metrics: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 7 },
  metricValue: { fontSize: 18, lineHeight: 24, letterSpacing: -0.3 },
  label: { fontSize: 12, lineHeight: 17 },
  intensity: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  intensityLabel: { flex: 1, fontSize: 13, lineHeight: 19 },
  intensityValue: { flexShrink: 1, fontSize: 14, lineHeight: 20 },
  notes: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  notesHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notesTitle: { fontSize: 14, lineHeight: 20 },
  notesText: { fontSize: 14, lineHeight: 21 },
  options: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  actions: { gap: 12, paddingVertical: 8 },
  button: { minHeight: 44, borderRadius: 10, paddingHorizontal: 12, borderWidth: 2, backgroundColor: 'transparent' },
});
