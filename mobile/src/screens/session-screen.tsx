import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Clock3, ShieldCheck } from 'lucide-react-native';
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
      <Pressable onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.text} size={20} /><AppText weight="medium">Week</AppText></Pressable>
      <Card>
        <View style={styles.hero}>
          <ModalityBadge modality={session.modality} />
          <View style={styles.copy}>
            <AppText weight="bold" style={styles.title}>{session.title}</AppText>
            <View style={styles.meta}><Clock3 color={colors.textSecondary} size={14} /><AppText tone="secondary">{session.minutes} min · {session.exercises.length} exercises</AppText></View>
          </View>
        </View>
        {session.intent ? <AppText tone="secondary" style={styles.intent}>{session.intent}</AppText> : null}
        <ShieldLine>{session.protects === 'intensity' ? 'The important intensity stays protected.' : 'The plan keeps your week balanced.'}</ShieldLine>
      </Card>
      <SectionTitle>What you’ll do</SectionTitle>
      {session.exercises.map((exercise, index) => (
        <Card key={exercise.id} style={styles.exercise}>
          <View style={[styles.number, { backgroundColor: colors.fill }]}><AppText weight="bold" style={styles.numberText}>{index + 1}</AppText></View>
          <View style={styles.copy}>
            <AppText weight="semibold">{exercise.name}</AppText>
            <AppText tone="secondary" style={styles.detail}>{exercise.kind === 'time' ? `${Math.round((exercise.targetSeconds ?? 0) / 60)} minutes` : `${exercise.sets.length} sets × ${exercise.targetReps} reps`}</AppText>
            <AppText tone="secondary" style={styles.why}>{exercise.why}</AppText>
          </View>
        </Card>
      ))}
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
  back: { alignSelf: 'flex-start', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
  title: { fontSize: 22, lineHeight: 27 },
  meta: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 },
  intent: { fontSize: 14, lineHeight: 21, marginTop: 14 },
  exercise: { flexDirection: 'row', gap: 12 },
  number: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 13 },
  detail: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  why: { fontSize: 13, lineHeight: 18, marginTop: 9 },
  receipt: { flexDirection: 'row', gap: 11 },
});
