import { router } from 'expo-router';
import { ChevronRight, Plus, Sparkles } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { calendarLabel } from '@/lib/calendar';
import { useApp } from '@/state/app-context';
import { ActionSheet } from './action-sheet';
import { AppText } from './ui';

export function CalendarDayActions({ date, onClose }: { date: string; onClose: () => void }) {
  const { colors } = useApp();
  return <ActionSheet title={calendarLabel(date, { weekday: 'long', month: 'short', day: 'numeric' })} onClose={onClose}>
    <View style={[styles.group, { backgroundColor: colors.card }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Chat about this day" onPress={() => {
        onClose();
        // Day-specific prompting is intentionally deferred; preserve the current chat.
        router.push('/(tabs)/chat');
      }} style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
        <Sparkles color={colors.tintText} size={22} />
        <AppText weight="medium" style={styles.copy}>Chat about this day</AppText>
        <ChevronRight color={colors.textTertiary} size={18} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Add sports workout" onPress={() => {
        onClose();
        router.push({ pathname: '/sports-workout', params: { date } });
      }} style={styles.row}>
        <Plus color={colors.tintText} size={22} />
        <AppText weight="medium" style={styles.copy}>Add sports workout</AppText>
        <ChevronRight color={colors.textTertiary} size={18} />
      </Pressable>
    </View>
  </ActionSheet>;
}

const styles = StyleSheet.create({
  group: { borderRadius: 16, marginBottom: 12, overflow: 'hidden' },
  row: { minHeight: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, fontSize: 15 },
});
