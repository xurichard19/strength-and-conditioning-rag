import { router } from 'expo-router';
import { ArrowRight, Check, Clock3, ListChecks, MoveRight, ShieldCheck, Sparkles } from 'lucide-react-native';
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
  const { colors, proposal, sessions, block, acceptProposal, declineProposal, shortenToday } = useApp();
  const session = sessions.find((item) => item.id === 's-today') ?? sessions.find((item) => item.status === 'planned' && item.modality !== 'rest');

  return (
    <Screen title="Today" subtitle={`${block.name} focus · Week ${block.week} of ${block.of}`} context="today's training" wash="today">
      {proposal ? (
        <Card style={styles.proposal}>
          <View style={styles.eyebrow}>
            <Sparkles color={colors.tint} size={16} />
            <AppText tone="tint" weight="semibold" style={styles.eyebrowText}>A small adjustment</AppText>
          </View>
          <AppText weight="bold" style={styles.proposalTitle}>Ease this week?</AppText>
          <AppText tone="secondary" style={styles.proposalCopy}>{proposal.context}</AppText>
          <AppText weight="semibold" style={styles.proposalSuggestion}>{proposal.suggestion}</AppText>
          <View style={[styles.changePanel, { backgroundColor: colors.fill }]}>
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
        <Card>
          <View style={styles.sessionHeader}>
            <ModalityBadge modality={session.modality} />
            <View style={styles.sessionCopy}>
              <AppText weight="bold" style={styles.sessionTitle}>{session.title}</AppText>
              <View style={styles.metadata}>
                <Clock3 color={colors.textSecondary} size={14} />
                <AppText tone="secondary" style={styles.metaText}>{session.minutes} min</AppText>
                <ListChecks color={colors.textSecondary} size={14} />
                <AppText tone="secondary" style={styles.metaText}>{session.exercises.length} exercises</AppText>
              </View>
            </View>
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

      <SectionTitle>Quiet progress</SectionTitle>
      <Card style={styles.milestoneCard}>
        <View style={[styles.milestoneIcon, { backgroundColor: colors.tintSoft }]}><Sparkles color={colors.tintText} size={20} /></View>
        <View style={styles.sessionCopy}>
          <AppText weight="semibold">{milestones[0].text}</AppText>
          <AppText tone="secondary" style={styles.metaText}>A milestone from {milestones[0].when}</AppText>
        </View>
        <ArrowRight color={colors.textTertiary} size={18} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  proposal: { gap: 13 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrowText: { fontSize: 13, lineHeight: 18 },
  proposalTitle: { fontSize: 24, lineHeight: 28, letterSpacing: -0.6 },
  proposalCopy: { fontSize: 15, lineHeight: 22 },
  proposalSuggestion: { fontSize: 15, lineHeight: 22 },
  changePanel: { borderRadius: 14, paddingVertical: 5, paddingHorizontal: 12 },
  changeRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 },
  changeDot: { width: 9, height: 9, borderRadius: 5 },
  changeLabel: { flex: 1, fontSize: 14 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  halfButton: { flex: 1 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sessionCopy: { flex: 1 },
  sessionTitle: { fontSize: 21, lineHeight: 26, letterSpacing: -0.4 },
  metadata: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, lineHeight: 17, marginRight: 5 },
  intent: { marginTop: 14, fontSize: 14, lineHeight: 20 },
  repairPill: { alignSelf: 'flex-start', marginTop: 13, paddingHorizontal: 10, minHeight: 28, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  repairText: { fontSize: 12, lineHeight: 16 },
  exerciseList: { marginTop: 14, marginBottom: 14, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  exerciseRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 9 },
  roleDot: { width: 7, height: 7, borderRadius: 4 },
  exerciseName: { flex: 1, fontSize: 14 },
  exerciseTarget: { fontSize: 13 },
  milestoneCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  milestoneIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
