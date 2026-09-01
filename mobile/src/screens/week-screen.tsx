import { router } from 'expo-router';
import { Check, ChevronRight, Clock3 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, ModalityBadge, Screen, SectionTitle, ShieldLine } from '@/components/ui';
import type { Palette } from '@/design/tokens';
import type { Session } from '@/domain/types';
import { formatDay, isToday } from '@/lib/dates';
import { useApp } from '@/state/app-context';

const modalityColorKeys: Record<Session['modality'], keyof Pick<Palette, 'strength' | 'endurance' | 'mixed'> | null> = {
  strength: 'strength',
  endurance: 'endurance',
  mixed: 'mixed',
  rest: null,
};

function dayDotColor(session: Session, colors: Palette) {
  const colorKey = modalityColorKeys[session.modality];
  return colorKey ? colors[colorKey] : 'transparent';
}

function selectedDayLabel(session?: Session) {
  if (!session) return 'Selected day';
  if (isToday(session.date)) return 'Today';
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(`${session.date}T12:00:00`));
}

function selectedStatus(session: Session, colors: Palette) {
  if (session.status === 'done') return { label: 'Done', color: colors.success, Icon: Check, size: 15 };
  if (session.modality === 'rest') return { label: 'Recovery day', color: colors.textSecondary, Icon: Clock3, size: 14 };
  return { label: `${session.minutes} min`, color: colors.textSecondary, Icon: Clock3, size: 14 };
}

function WeekDay({ session, selected, onSelect }: { session: Session; selected: boolean; onSelect: () => void }) {
  const { colors } = useApp();
  const tone = selected ? 'inverse' : 'secondary';
  return (
    <Pressable onPress={onSelect} style={[styles.day, { backgroundColor: selected ? colors.strong : colors.card }]}>
      <AppText tone={tone} weight="medium" style={styles.dayLabel}>{formatDay(session.date)}</AppText>
      <AppText tone={selected ? 'inverse' : 'default'} weight="bold" style={styles.dayNumber}>{Number(session.date.slice(-2))}</AppText>
      <View style={[styles.dayDot, { backgroundColor: dayDotColor(session, colors) }]} />
    </Pressable>
  );
}

function SelectedSession({ session }: { session: Session }) {
  const { colors } = useApp();
  const isRest = session.modality === 'rest';
  const status = selectedStatus(session, colors);
  const StatusIcon = status.Icon;
  return (
    <Pressable disabled={isRest} onPress={() => router.push(`/session/${session.id}`)}>
      <Card style={styles.selectedCard}>
        <View style={styles.selectedHeader}>
          <ModalityBadge modality={session.modality} />
          <View style={styles.copy}>
            <AppText weight="bold" style={styles.sessionTitle}>{session.title}</AppText>
            <View style={styles.metadata}>
              <StatusIcon color={status.color} size={status.size} />
              <AppText tone="secondary" style={styles.meta}>{status.label}</AppText>
            </View>
          </View>
          {!isRest ? <ChevronRight color={colors.textTertiary} size={20} /> : null}
        </View>
        {session.intent ? <AppText tone="secondary" style={styles.intent}>{session.intent}</AppText> : null}
        {session.repairedNote ? <ShieldLine>{session.repairedNote}</ShieldLine> : null}
      </Card>
    </Pressable>
  );
}

function SessionRow({ session, last, onSelect }: { session: Session; last: boolean; onSelect: () => void }) {
  const { colors } = useApp();
  const open = () => {
    onSelect();
    if (session.modality !== 'rest') router.push(`/session/${session.id}`);
  };
  return (
    <Pressable onPress={open} style={[styles.listRow, !last && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <AppText tone="secondary" weight="medium" style={styles.listDay}>{isToday(session.date) ? 'Today' : formatDay(session.date)}</AppText>
      <ModalityBadge modality={session.modality} size={32} />
      <View style={styles.copy}>
        <AppText weight="medium" numberOfLines={1}>{session.title}</AppText>
        {session.status === 'skipped' ? <AppText tone="secondary" style={styles.meta}>No debt carried forward</AppText> : null}
      </View>
      {session.minutes ? <AppText tone="secondary" style={styles.meta}>{session.minutes}m</AppText> : null}
    </Pressable>
  );
}

export default function WeekScreen() {
  const { sessions, block } = useApp();
  const initial = sessions.find((item) => isToday(item.date))?.date ?? sessions[0]?.date;
  const [selectedDate, setSelectedDate] = useState(initial);
  const selected = useMemo(() => sessions.find((item) => item.date === selectedDate), [selectedDate, sessions]);

  return (
    <Screen title="Week" subtitle={`Week ${block.week} of ${block.of} · ${block.name} block`} context="this week's plan" wash="week">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
        {sessions.map((session) => <WeekDay key={session.id} session={session} selected={session.date === selectedDate} onSelect={() => setSelectedDate(session.date)} />)}
      </ScrollView>

      <SectionTitle>{selectedDayLabel(selected)}</SectionTitle>
      {selected ? <SelectedSession session={selected} /> : null}

      <SectionTitle>At a glance</SectionTitle>
      <Card style={styles.listCard}>
        {sessions.map((session, index) => <SessionRow key={session.id} session={session} last={index === sessions.length - 1} onSelect={() => setSelectedDate(session.date)} />)}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayStrip: { gap: 8, paddingRight: 10 },
  day: { width: 54, height: 78, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayLabel: { fontSize: 11, lineHeight: 15 },
  dayNumber: { fontSize: 18, lineHeight: 22 },
  dayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
  selectedCard: { gap: 12 },
  selectedHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
  sessionTitle: { fontSize: 20, lineHeight: 25, letterSpacing: -0.35 },
  metadata: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  meta: { fontSize: 12, lineHeight: 17 },
  intent: { fontSize: 14, lineHeight: 20 },
  listCard: { paddingVertical: 4 },
  listRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10 },
  listDay: { width: 42, fontSize: 12 },
});
