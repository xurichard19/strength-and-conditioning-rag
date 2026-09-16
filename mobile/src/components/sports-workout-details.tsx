import { Ellipsis } from 'lucide-react-native';
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
  const fields = [
    ['Sport', session.title], ['Scheduled date', calendarLabel(session.date, { dateStyle: 'full' })],
    ['Start time', calendarTime(session.startTime) ?? 'Not set'],
    ['Planned duration', session.minutes == null ? 'Not set' : `${session.minutes} minutes`],
    ['Intensity', session.intensity ? label(session.intensity) : 'Not set'], ['Status', label(session.status)],
  ];
  return <ScrollView style={styles.scroll} contentContainerStyle={styles.fields}>
    {fields.map(([name, value]) => <View key={name} style={styles.field}>
      <AppText tone="secondary" style={styles.label}>{name}</AppText>
      <AppText selectable weight="medium">{value}</AppText>
    </View>)}
    <View style={[styles.notes, { borderTopColor: colors.separator }]}>
      <AppText tone="secondary" style={styles.label}>Notes</AppText>
      <AppText selectable>{session.notes || 'No notes added.'}</AppText>
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
  fields: { gap: 18, paddingTop: 8, paddingBottom: 12 },
  field: { gap: 4 },
  label: { fontSize: 12, lineHeight: 17 },
  notes: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 18, gap: 8 },
  options: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  actions: { gap: 12, paddingVertical: 8 },
  button: { minHeight: 44, borderRadius: 10, paddingHorizontal: 12, borderWidth: 2, backgroundColor: 'transparent' },
});
