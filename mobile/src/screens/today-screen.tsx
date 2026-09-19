import { router } from 'expo-router';
import { Check, Clock3, MoveRight, ShieldCheck, Sparkles } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Card,
  ModalityBadge,
  OutlineButton,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SectionTitle,
  ShieldLine,
} from '@/components/ui';
import { milestones } from '@/data/mock';
import { useApp } from '@/state/app-context';

export default function TodayScreen() {
  const { colors, proposal, sessions, block, acceptProposal, declineProposal, shortenToday, refreshPreview } = useApp();
  const session = sessions.find((item) => item.id === 's-today') ?? sessions.find((item) => item.status === 'planned' && item.modality !== 'rest');

  if (!sessions.length) return <Screen title="Today" onRefresh={refreshPreview}><Card><AppText weight="bold">No workouts yet</AppText><AppText tone="secondary">Planning is not connected in this build. Your account, onboarding answers, and chat are live.</AppText></Card><PrimaryButton onPress={() => router.push('/(tabs)/chat')}>Open chat</PrimaryButton></Screen>;

  return (
    <Screen title="Today" subtitle={`${block.name} focus · Week ${block.week} of ${block.of}`} context="today's training" onRefresh={refreshPreview}>
      {proposal ? (
        <Card style={styles.proposal}>
          <View style={styles.eyebrow}>
            <Sparkles color={colors.tint} size={16} />
            <AppText tone="tint" weight="semibold" style={styles.eyebrowText}>A small adjustment</AppText>
          </View>
          <AppText style={styles.proposalTitle}>Ease this week?</AppText>
          <AppText tone="secondary" style={styles.proposalCopy}>{proposal.context}</AppText>
          <AppText weight="semibold" style={styles.proposalSuggestion}>{proposal.suggestion}</AppText>
          <View style={[styles.changePanel, { borderColor: colors.separator }]}>
            {proposal.rows.map((row) => (
              <View key={row.label} style={styles.changeRow}>
                <View style={[styles.changeDot, { backgroundColor: row.accent === 'strength' ? colors.strength : colors.intervals }]} />
                <AppText weight="medium" style={styles.changeLabel}>{row.label}</AppText>
                <AppText tone="secondary" weight="medium">{row.delta}</AppText>
              </View>
            ))}
            <View style={styles.changeRow}>
              <ShieldCheck color={colors.success} size={17} />
              <AppText weight="medium" style={styles.changeLabel}>Protected</AppText>
              <AppText tone="secondary" weight="medium">{proposal.protectedNote}</AppText>
            </View>
          </View>
          <PrimaryButton onPress={acceptProposal}>Apply change</PrimaryButton>
          <OutlineButton onPress={declineProposal}>Keep original</OutlineButton>
        </Card>
      ) : null}

      <SectionTitle>Your session</SectionTitle>
      {session ? (
        <Card style={styles.sessionCard}>
          <View style={styles.sessionHeader}>
            <View style={styles.sessionCopy}>
              <AppText tone="secondary" weight="medium" style={styles.sessionEyebrow}>{session.modality} session</AppText>
              <AppText style={styles.sessionTitle}>{session.title}</AppText>
            </View>
            <ModalityBadge modality={session.modality} size={38} />
          </View>
          <View style={styles.metadata}>
            <View style={styles.stat}><AppText style={styles.statValue}>{session.minutes}<AppText tone="secondary" style={styles.statUnit}> min</AppText></AppText><AppText tone="secondary" style={styles.metaText}>Duration</AppText></View>
            <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />
            <View style={styles.stat}><AppText style={styles.statValue}>{session.exercises.length}</AppText><AppText tone="secondary" style={styles.metaText}>Exercises</AppText></View>
          </View>
          {session.repairedNote ? (
            <View style={[styles.repairPill, { backgroundColor: colors.tintSoft }]}>
              <Check color={colors.tintText} size={14} />
              <AppText tone="tint" weight="medium" style={styles.repairText}>{session.repairedNote}</AppText>
            </View>
          ) : null}
          <AppText tone="secondary" style={styles.intent}>{session.intent}</AppText>
          <View style={[styles.exerciseList, { borderTopColor: colors.separator }]}>
            {session.exercises.map((item) => (
              <View key={item.id} style={styles.exerciseRow}>
                <View style={[styles.roleDot, { backgroundColor: item.role === 'primary' ? colors.strength : colors.fillStrong }]} />
                <AppText weight="medium" style={styles.exerciseName}>{item.name}</AppText>
                <AppText tone="secondary" style={styles.exerciseTarget}>
                  {item.kind === 'time' ? `${Math.round((item.targetSeconds ?? 0) / 60)} min` : `${item.sets.length} × ${item.targetReps}`}
                </AppText>
              </View>
            ))}
          </View>
          <PrimaryButton onPress={() => router.push(`/workout/${session.id}`)}>Start session</PrimaryButton>
          <View style={styles.buttonRow}>
            <SecondaryButton onPress={shortenToday} icon={Clock3} style={styles.halfButton}>25 min</SecondaryButton>
            <SecondaryButton onPress={() => router.push('/(tabs)/week')} icon={MoveRight} style={styles.halfButton}>Move</SecondaryButton>
          </View>
          <ShieldLine>Same weights. Less volume if time gets tight.</ShieldLine>
        </Card>
      ) : (
        <Card><AppText tone="secondary">Nothing is planned today. Your next session is waiting in Week.</AppText></Card>
      )}

      <SectionTitle>Recent progress</SectionTitle>
      <Card style={styles.milestoneCard}>
        <View style={[styles.milestoneIcon, { backgroundColor: colors.tintSoft }]}><Sparkles color={colors.tintText} size={20} /></View>
        <View style={styles.sessionCopy}>
          <AppText weight="semibold">{milestones[0].text}</AppText>
          <AppText tone="secondary" style={styles.metaText}>A milestone from {milestones[0].when}</AppText>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  proposal: { gap: 16 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrowText: { fontSize: 11, lineHeight: 16, letterSpacing: 1, textTransform: 'uppercase' },
  proposalTitle: { fontSize: 28, lineHeight: 34, letterSpacing: -0.8 },
  proposalCopy: { fontSize: 15, lineHeight: 22 },
  proposalSuggestion: { fontSize: 15, lineHeight: 22 },
  changePanel: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  changeRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 },
  changeDot: { width: 5, height: 5, borderRadius: 3 },
  changeLabel: { flex: 1, fontSize: 14 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  halfButton: { flex: 1 },
  sessionCard: { padding: 20 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sessionCopy: { flex: 1 },
  sessionEyebrow: { fontSize: 10, lineHeight: 16, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 7 },
  sessionTitle: { fontSize: 28, lineHeight: 34, letterSpacing: -0.8 },
  metadata: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 24 },
  stat: { gap: 3 },
  statValue: { fontSize: 27, lineHeight: 34, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  statUnit: { fontSize: 14, lineHeight: 20 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 36 },
  metaText: { fontSize: 12, lineHeight: 18 },
  intent: { marginTop: 20, fontSize: 14, lineHeight: 22 },
  repairPill: { alignSelf: 'flex-start', marginTop: 13, paddingHorizontal: 10, minHeight: 28, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  repairText: { fontSize: 12, lineHeight: 16 },
  exerciseList: { marginTop: 20, marginBottom: 20, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  exerciseRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 },
  roleDot: { width: 4, height: 4, borderRadius: 2 },
  exerciseName: { flex: 1, fontSize: 14 },
  exerciseTarget: { fontSize: 13 },
  milestoneCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  milestoneIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
