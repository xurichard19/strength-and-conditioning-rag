import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, ModalityBadge, PrimaryButton, Screen, SectionTitle, ShieldLine } from '@/components/ui';
import { useApp } from '@/state/app-context';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, sessions } = useApp();
  const session = sessions.find((item) => item.id === id);

  if (!session) return <Screen title="Session"><Card><AppText>This session is no longer in the week.</AppText></Card></Screen>;
  return (
    <Screen title={session.title} subtitle={new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${session.date}T12:00:00`))} context={session.title}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to calendar" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.text} size={20} /><AppText weight="medium">Calendar</AppText></Pressable>
      <Card style={styles.summary}>
        <View style={styles.hero}>
          <ModalityBadge modality={session.modality} size={38} />
          <View style={styles.copy}>
            <AppText tone="secondary" weight="medium" style={styles.eyebrow}>{session.modality} session</AppText>
            <AppText style={styles.title}>{session.minutes}<AppText tone="secondary" style={styles.unit}> min</AppText></AppText>
          </View>
          <View style={styles.exerciseCount}><AppText style={styles.title}>{session.exercises.length}</AppText><AppText tone="secondary" style={styles.detail}>Exercises</AppText></View>
        </View>
        {session.intent ? <AppText tone="secondary" style={styles.intent}>{session.intent}</AppText> : null}
        <ShieldLine>{session.protects === 'intensity' ? 'The important intensity stays protected.' : 'The plan keeps your week balanced.'}</ShieldLine>
      </Card>
      <SectionTitle>What you’ll do</SectionTitle>
      <View>
      {session.exercises.map((exercise, index) => (
        <View key={exercise.id} style={[styles.exercise, { borderTopColor: colors.separator }]}>
          <View style={styles.number}><AppText tone="secondary" style={styles.numberText}>{String(index + 1).padStart(2, '0')}</AppText></View>
          <View style={styles.copy}>
            <AppText weight="medium" style={styles.exerciseName}>{exercise.name}</AppText>
            <AppText tone="secondary" style={styles.detail}>{exercise.kind === 'time' ? `${Math.round((exercise.targetSeconds ?? 0) / 60)} minutes` : `${exercise.sets.length} sets × ${exercise.targetReps} reps`}</AppText>
            <AppText tone="secondary" style={styles.why}>{exercise.why}</AppText>
          </View>
        </View>
      ))}
      </View>
      {session.receipt ? (
        <Card style={styles.receipt}>
          <ShieldCheck color={colors.success} size={20} />
          <View style={styles.copy}><AppText weight="semibold">What changed</AppText><AppText tone="secondary" style={styles.detail}>{session.receipt.summary}</AppText></View>
        </Card>
      ) : null}
      <PrimaryButton onPress={() => router.push(`/workout/${session.id}`)} disabled={session.status === 'done'}>{session.status === 'done' ? 'Session complete' : 'Start session'}</PrimaryButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  summary: { padding: 20 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
  eyebrow: { fontSize: 10, lineHeight: 16, letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 32, lineHeight: 40, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 14, lineHeight: 20 },
  exerciseCount: { alignItems: 'flex-end' },
  intent: { fontSize: 14, lineHeight: 22, marginTop: 20, marginBottom: 8 },
  exercise: { flexDirection: 'row', gap: 14, paddingVertical: 22, borderTopWidth: StyleSheet.hairlineWidth },
  number: { width: 28, paddingTop: 2 },
  numberText: { fontSize: 12, lineHeight: 20, fontVariant: ['tabular-nums'] },
  exerciseName: { fontSize: 17, lineHeight: 23 },
  detail: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  why: { fontSize: 13, lineHeight: 18, marginTop: 9 },
  receipt: { flexDirection: 'row', gap: 11 },
});
