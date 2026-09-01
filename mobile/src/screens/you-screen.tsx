import { router } from 'expo-router';
import { Bell, CalendarClock, ChevronRight, CircleUserRound, Link2, Palette, RotateCcw, ShieldCheck } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, ChoiceChip, DisclosureRow, Screen, SectionTitle } from '@/components/ui';
import { rememberedNotes } from '@/data/mock';
import type { ThemeMode } from '@/design/tokens';
import { useApp } from '@/state/app-context';

export default function YouScreen() {
  const { colors, profile, block, setThemeMode, resetOnboarding } = useApp();
  const themes: { label: string; value: ThemeMode }[] = [{ label: 'System', value: 'system' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }];
  return (
    <Screen title={profile.displayName.trim() || 'You'} context="my plan and preferences" wash="you">
      <SectionTitle>Your plan</SectionTitle>
      <Card>
        <AppText weight="bold" style={styles.planTitle}>{profile.goal}</AppText>
        <View style={styles.planFacts}>
          <View style={[styles.fact, { backgroundColor: colors.fill }]}><AppText weight="semibold">{profile.daysPerWeek}</AppText><AppText tone="secondary" style={styles.factLabel}>days / week</AppText></View>
          <View style={[styles.fact, { backgroundColor: colors.fill }]}><AppText weight="semibold">{profile.sessionMinutes}</AppText><AppText tone="secondary" style={styles.factLabel}>minutes</AppText></View>
          <View style={[styles.fact, { backgroundColor: colors.fill }]}><AppText weight="semibold" numberOfLines={1}>{profile.equipment}</AppText><AppText tone="secondary" style={styles.factLabel}>equipment</AppText></View>
        </View>
        <View style={styles.days}>{profile.trainingDays.map((day) => <View key={day} style={[styles.day, { backgroundColor: colors.tintSoft }]}><AppText tone="tint" weight="medium" style={styles.dayText}>{day}</AppText></View>)}</View>
      </Card>

      <SectionTitle>Current block</SectionTitle>
      <Card>
        <View style={styles.blockHeader}><AppText weight="bold" style={styles.blockTitle}>{block.name}</AppText><AppText tone="secondary">Week {block.week} of {block.of}</AppText></View>
        <View style={[styles.rail, { backgroundColor: colors.fillStrong }]}><View style={[styles.railFill, { backgroundColor: colors.tint, width: `${(block.week / block.of) * 100}%` }]} /></View>
        <AppText tone="secondary" style={styles.blockText}>Builds {block.builds}. Holds {block.holds}. Next: {block.next}.</AppText>
      </Card>

      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <View style={styles.appearanceHeader}><Palette color={colors.tint} size={20} /><AppText weight="semibold">Theme</AppText></View>
        <View style={styles.themeRow}>{themes.map((theme) => <ChoiceChip key={theme.value} label={theme.label} selected={profile.theme === theme.value} onPress={() => setThemeMode(theme.value)} style={styles.themeChip} />)}</View>
      </Card>

      <SectionTitle>What Arcel remembers</SectionTitle>
      <Card style={styles.notesCard}>
        {rememberedNotes.map((note, index) => (
          <View key={note.text} style={[styles.note, index < rememberedNotes.length - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <ShieldCheck color={colors.tint} size={18} />
            <View style={styles.copy}><AppText style={styles.noteText}>{note.text}</AppText><AppText tone="secondary" style={styles.noteWhen}>{note.when}</AppText></View>
          </View>
        ))}
      </Card>

      <SectionTitle>Settings</SectionTitle>
      <Card style={styles.settingsCard}>
        <DisclosureRow title="Account & sync" value="Preview" icon={CircleUserRound} onPress={() => router.push('/account')} />
        <DisclosureRow title="Reminders" value="Not wired" icon={Bell} onPress={() => {}} />
        <DisclosureRow title="Calendar" value="Not wired" icon={CalendarClock} onPress={() => {}} />
        <DisclosureRow title="Connected apps" value="Not wired" icon={Link2} onPress={() => {}} />
        <DisclosureRow title="Run setup again" icon={RotateCcw} onPress={() => { resetOnboarding(); router.replace('/onboarding'); }} last />
      </Card>
      <Pressable style={styles.privacy}><AppText tone="secondary" style={styles.privacyText}>Privacy · Terms</AppText><ChevronRight color={colors.textTertiary} size={15} /></Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  planTitle: { fontSize: 22, lineHeight: 27 },
  planFacts: { marginTop: 14, flexDirection: 'row', gap: 8 },
  fact: { flex: 1, minHeight: 67, borderRadius: 14, paddingHorizontal: 10, justifyContent: 'center' },
  factLabel: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  days: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  day: { minWidth: 38, minHeight: 28, borderRadius: 14, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 11 },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  blockTitle: { fontSize: 20 },
  rail: { marginTop: 14, height: 7, borderRadius: 4, overflow: 'hidden' },
  railFill: { height: '100%', borderRadius: 4 },
  blockText: { fontSize: 13, lineHeight: 19, marginTop: 12 },
  appearanceHeader: { flexDirection: 'row', gap: 9, alignItems: 'center', marginBottom: 12 },
  themeRow: { flexDirection: 'row', gap: 8 },
  themeChip: { flex: 1 },
  notesCard: { paddingVertical: 3 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 13 },
  copy: { flex: 1 },
  noteText: { fontSize: 14, lineHeight: 20 },
  noteWhen: { fontSize: 11, lineHeight: 15, marginTop: 4 },
  settingsCard: { paddingVertical: 1 },
  privacy: { minHeight: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
  privacyText: { fontSize: 12 },
});
