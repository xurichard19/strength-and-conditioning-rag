import { CalendarDays, Dumbbell } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { calendarLabel, type CalendarEntry } from '@/lib/calendar';
import { useApp } from '@/state/app-context';
import { ActionSheet } from './action-sheet';
import { AppText } from './ui';

/** Show the full prescription already loaded with the calendar, without another request. */
export function WorkoutDetails({ session, onClose }: { session: CalendarEntry; onClose: () => void }) {
  const { colors } = useApp();
  const exercises = session.exercises ?? [];
  const status = session.status.replaceAll('_', ' ');
  return <ActionSheet title={session.title} onClose={onClose}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <View style={[styles.icon, { backgroundColor: colors.fill }]}><Dumbbell color={colors.strength} size={20} strokeWidth={1.6} /></View>
          <AppText tone="secondary" weight="medium" style={styles.eyebrow}>WORKOUT</AppText>
          <View style={[styles.statusDot, { backgroundColor: session.status === 'completed' ? colors.success : colors.textSecondary }]} />
          <AppText tone="secondary" style={styles.status}>{status.charAt(0).toUpperCase() + status.slice(1)}</AppText>
        </View>
        <View style={styles.date}>
          <CalendarDays color={colors.textSecondary} size={15} strokeWidth={1.8} />
          <AppText selectable tone="secondary" style={styles.detail}>{calendarLabel(session.date, { dateStyle: 'full' })}</AppText>
        </View>
      </View>
      {session.notes ? <View style={[styles.notes, { backgroundColor: colors.fill }]}>
        <AppText tone="secondary" weight="medium" style={styles.eyebrow}>SESSION NOTES</AppText>
        <AppText selectable style={styles.noteText}>{session.notes}</AppText>
      </View> : null}
      <View style={styles.sectionHeading}>
        <AppText weight="medium" style={styles.sectionTitle}>Exercises</AppText>
        <AppText tone="secondary" style={styles.count}>{exercises.length}</AppText>
      </View>
      {exercises.length ? exercises.map((exercise, index) => <View key={exercise.id}
        style={[styles.exercise, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator, paddingTop: 22 }]}>
        <View style={[styles.number, { backgroundColor: colors.fill }]}>
          <AppText weight="medium" style={[styles.numberText, { color: colors.strength }]}>{String(index + 1).padStart(2, '0')}</AppText>
        </View>
        <View style={styles.exerciseBody}>
          <AppText selectable weight="medium" style={styles.exerciseTitle}>{exercise.name}</AppText>
          {exercise.prescriptions.length ? exercise.prescriptions.map((target, setIndex) =>
            <AppText selectable key={setIndex} tone="secondary" style={styles.detail}>{target}</AppText>)
            : <AppText tone="secondary" style={styles.detail}>No set targets provided.</AppText>}
          {exercise.notes ? <AppText selectable tone="secondary" style={styles.exerciseNote}>{exercise.notes}</AppText> : null}
        </View>
      </View>) : <AppText tone="secondary" style={styles.detail}>No exercises provided.</AppText>}
    </ScrollView>
  </ActionSheet>;
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  content: { gap: 22, paddingTop: 10, paddingBottom: 24 },
  summary: { gap: 14 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { flex: 1, fontSize: 10, lineHeight: 16, letterSpacing: 1.1 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  status: { fontSize: 12, lineHeight: 18 },
  date: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  notes: { borderRadius: 14, padding: 16, gap: 8 },
  noteText: { fontSize: 14, lineHeight: 22 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionTitle: { flex: 1, fontSize: 18, lineHeight: 24, letterSpacing: -0.3 },
  count: { fontSize: 13, lineHeight: 20, fontVariant: ['tabular-nums'] },
  exercise: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  number: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 12, lineHeight: 18, fontVariant: ['tabular-nums'] },
  exerciseBody: { flex: 1, gap: 7 },
  exerciseTitle: { fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
  detail: { fontSize: 14, lineHeight: 22 },
  exerciseNote: { fontSize: 13, lineHeight: 21, marginTop: 2 },
});
