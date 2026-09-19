import { router } from 'expo-router';
import { Bell, CalendarClock, CircleUserRound, Link2, Palette, RotateCcw, ShieldCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { PolicyLinks } from '@/components/policy-links';
import { AppText, Card, ChoiceChip, DisclosureRow, Screen, SectionTitle } from '@/components/ui';
import { rememberedNotes } from '@/data/mock';
import type { ThemeMode } from '@/design/tokens';
import { useApp } from '@/state/app-context';

export default function YouScreen() {
  const { colors, profile, block, setThemeMode, refreshLiveData } = useApp();
  const themes: { label: string; value: ThemeMode }[] = [{ label: 'System', value: 'system' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }];
  return (
    <Screen title={profile.displayName.trim() || 'You'} subtitle="Your training, on your terms." context="my plan and preferences" onRefresh={refreshLiveData}>
      <SectionTitle>Your plan</SectionTitle>
      <Card>
        <AppText style={styles.planTitle}>{profile.goal}</AppText>
        <View style={styles.planFacts}>
          <View style={styles.fact}><AppText style={styles.factNumber}>{profile.daysPerWeek}</AppText><AppText tone="secondary" style={styles.factLabel}>days / week</AppText></View>
          <View style={[styles.fact, styles.factDivider, { borderLeftColor: colors.separator }]}><AppText style={styles.factNumber}>{profile.sessionMinutes}</AppText><AppText tone="secondary" style={styles.factLabel}>minutes</AppText></View>
          <View style={[styles.fact, styles.factDivider, { borderLeftColor: colors.separator }]}><AppText weight="medium" style={styles.factEquipment}>{profile.equipment}</AppText><AppText tone="secondary" style={styles.factLabel}>equipment</AppText></View>
        </View>
        <View style={[styles.days, { borderTopColor: colors.separator }]}>{profile.trainingDays.map((day) => <View key={day} style={styles.day}><View style={[styles.dayDot, { backgroundColor: colors.tint }]} /><AppText tone="secondary" style={styles.dayText}>{day}</AppText></View>)}</View>
      </Card>

      <SectionTitle>Current block</SectionTitle>
      <Card>
        <View style={styles.blockHeader}><AppText weight="medium" style={styles.blockTitle}>{block.name}</AppText><AppText tone="secondary" style={styles.blockWeek}>Week {block.week} of {block.of}</AppText></View>
        <View style={[styles.rail, { backgroundColor: colors.fillStrong }]}><View style={[styles.railFill, { backgroundColor: colors.tint, width: `${(block.week / block.of) * 100}%` }]} /></View>
        <AppText tone="secondary" style={styles.blockText}>Builds {block.builds}. Holds {block.holds}. Next: {block.next}.</AppText>
      </Card>

      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <View style={styles.appearanceHeader}><Palette color={colors.textSecondary} size={18} strokeWidth={1.5} /><AppText weight="medium">Theme</AppText></View>
        <View style={styles.themeRow}>{themes.map((theme) => <ChoiceChip key={theme.value} label={theme.label} selected={profile.theme === theme.value} onPress={() => setThemeMode(theme.value)} style={styles.themeChip} />)}</View>
      </Card>

      <SectionTitle>What Arcel remembers</SectionTitle>
      <Card style={styles.notesCard}>
        {rememberedNotes.map((note, index) => (
          <View key={note.text} style={[styles.note, index < rememberedNotes.length - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <ShieldCheck color={colors.textTertiary} size={18} strokeWidth={1.5} />
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
        <DisclosureRow title="Run setup again" icon={RotateCcw} onPress={() => { router.push('/onboarding?edit=1'); }} last />
      </Card>
      <PolicyLinks />
    </Screen>
  );
}

const styles = StyleSheet.create({
  planTitle: { fontSize: 27, lineHeight: 33, letterSpacing: -0.8 },
  planFacts: { marginTop: 24, flexDirection: 'row' },
  fact: { flex: 1, minHeight: 60, justifyContent: 'space-between', gap: 6 },
  factDivider: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 16 },
  factNumber: { fontSize: 29, lineHeight: 33, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  factEquipment: { fontSize: 15, lineHeight: 21, paddingTop: 5 },
  factLabel: { fontSize: 10, lineHeight: 14, letterSpacing: 0.35 },
  days: { flexDirection: 'row', gap: 14, marginTop: 22, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: 'wrap' },
  day: { flexDirection: 'row', gap: 5, alignItems: 'center', minHeight: 20 },
  dayDot: { width: 4, height: 4, borderRadius: 2 },
  dayText: { fontSize: 11, lineHeight: 16 },
  blockHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' },
  blockTitle: { fontSize: 20, lineHeight: 26, letterSpacing: -0.35 },
  blockWeek: { fontSize: 12 },
  rail: { marginTop: 20, height: 3, borderRadius: 2, overflow: 'hidden' },
  railFill: { height: '100%', borderRadius: 2 },
  blockText: { fontSize: 13, lineHeight: 21, marginTop: 16 },
  appearanceHeader: { flexDirection: 'row', gap: 9, alignItems: 'center', marginBottom: 18 },
  themeRow: { flexDirection: 'row', gap: 8 },
  themeChip: { flex: 1 },
  notesCard: { paddingVertical: 4 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 18 },
  copy: { flex: 1 },
  noteText: { fontSize: 14, lineHeight: 22 },
  noteWhen: { fontSize: 11, lineHeight: 16, marginTop: 6 },
  settingsCard: { paddingVertical: 0 },
});
