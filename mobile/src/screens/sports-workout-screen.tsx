import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CheckCircle2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SelectionField } from '@/components/selection-field';
import { AppText, Card, PrimaryButton } from '@/components/ui';
import { fonts } from '@/design/tokens';
import { calendarLabel } from '@/lib/calendar';
import { errorMessage } from '@/lib/errors';
import { durationOptions, intensityOptions, sportsWorkoutInput, sportOptions, startTimeOptions, validScheduledDate } from '@/lib/sports-workout';
import { backendFor } from '@/services/api';
import type { SportsWorkout } from '@/services/backend';
import { useApp } from '@/state/app-context';

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/week');
}

/** Save only on explicit submission; calendar reads and automatic replanning remain deferred. */
function SportsWorkoutForm({ date, userId }: { date: string; userId: string }) {
  const { colors } = useApp();
  const [sport, setSport] = useState('boxing');
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState('60');
  const [intensity, setIntensity] = useState('moderate');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SportsWorkout | null>(null);
  const submitting = useRef(false);

  const save = async () => {
    if (submitting.current || saved) return;
    submitting.current = true;
    setBusy(true); setError(null); Keyboard.dismiss();
    try {
      const input = sportsWorkoutInput(date, sport, startTime, duration, intensity, notes);
      const result = await backendFor(userId).createSportsWorkout(input);
      setSaved(result);
    } catch (failure) {
      submitting.current = false;
      setError(errorMessage(failure, 'Could not save the sports workout.'));
    } finally { setBusy(false); }
  };

  if (saved) return <Card style={styles.success}>
    <CheckCircle2 color={colors.success} size={32} />
    <AppText weight="semibold" style={styles.successTitle}>Sports workout saved</AppText>
    <AppText tone="secondary">Saved to your account for {calendarLabel(saved.scheduled_date, { month: 'short', day: 'numeric' })}. It won’t appear in the preview calendar yet.</AppText>
    <PrimaryButton onPress={close}>Back to calendar</PrimaryButton>
  </Card>;

  return <>
    <AppText tone="secondary" style={styles.description}>Add a practice, game, or session you already have planned.</AppText>
    <Card style={styles.fields}>
      <SelectionField label="Sport" value={sport} options={sportOptions} onChange={setSport} disabled={busy} />
      <SelectionField label="Start time" value={startTime} options={startTimeOptions} onChange={setStartTime} wheel disabled={busy} />
      <SelectionField label="Duration" value={duration} options={durationOptions} onChange={setDuration} wheel disabled={busy} />
      <SelectionField label="Intensity" value={intensity} options={intensityOptions} onChange={setIntensity} disabled={busy} last />
    </Card>
    <AppText tone="secondary" style={styles.caption}>Start time uses your local timezone.</AppText>
    <AppText weight="semibold" style={styles.notesTitle}>Notes <AppText tone="secondary">(optional)</AppText></AppText>
    <TextInput accessibilityLabel="Workout notes" placeholder="Anything useful to know about this session…" placeholderTextColor={colors.textTertiary}
      value={notes} onChangeText={setNotes} editable={!busy} multiline maxLength={4000} textAlignVertical="top"
      style={[styles.notes, { backgroundColor: colors.card, color: colors.text }]} />
    {error ? <View accessibilityLiveRegion="polite" style={styles.error}>
      <AppText style={{ color: colors.danger }}>{error}</AppText>
      <AppText tone="secondary" style={styles.caption}>If the connection dropped while saving, the entry may already exist. Check before submitting again.</AppText>
    </View> : null}
    <PrimaryButton loading={busy} onPress={() => void save()} style={styles.save}>Save sports workout</PrimaryButton>
  </>;
}

export default function SportsWorkoutScreen() {
  const { date } = useLocalSearchParams<{ date?: string | string[] }>();
  const { colors, authSession } = useApp();
  const validDate = validScheduledDate(date);
  const userId = authSession?.user.id;
  return <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Pressable accessibilityRole="button" accessibilityLabel="Back to calendar" onPress={close} style={styles.back}>
          <ArrowLeft color={colors.text} size={22} /><AppText weight="medium">Calendar</AppText>
        </Pressable>
        <AppText weight="bold" style={styles.title}>Add sports workout</AppText>
        {validDate ? <AppText tone="secondary" style={styles.date}>{calendarLabel(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</AppText> : null}
        {!validDate || !userId ? <Card><AppText>{!validDate ? 'Select a day from the calendar to add a workout.' : 'Sign in to save a sports workout.'}</AppText></Card>
          : <SportsWorkoutForm key={`${userId}:${date}`} date={date} userId={userId} />}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 36, gap: 12 },
  back: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  title: { fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  date: { fontSize: 14, lineHeight: 20 },
  description: { fontSize: 15, lineHeight: 21, marginTop: 4, marginBottom: 6 },
  fields: { paddingVertical: 0 },
  caption: { fontSize: 12, lineHeight: 18 },
  notesTitle: { marginTop: 8 },
  notes: { minHeight: 120, padding: 16, borderRadius: 16, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  save: { marginTop: 8 },
  error: { gap: 6 },
  success: { gap: 16, marginTop: 16 },
  successTitle: { fontSize: 20, lineHeight: 26 },
});
