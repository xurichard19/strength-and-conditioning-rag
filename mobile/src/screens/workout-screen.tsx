import { router, useLocalSearchParams } from 'expo-router';
import { Check, ChevronDown, ChevronUp, Circle, Clock3, MessageCircle, Minus, Plus, SkipForward, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Card, ChoiceChip, PrimaryButton, SecondaryButton } from '@/components/ui';
import { fonts, radius } from '@/design/tokens';
import type { Effort, Exercise } from '@/domain/types';
import { useApp } from '@/state/app-context';

const effortOptions: { label: string; value: Effort }[] = [
  { label: 'Everything', value: 'everything' },
  { label: 'One more', value: 'one-more' },
  { label: '2–3 more', value: 'two-three' },
  { label: 'Lots left', value: 'lots-left' },
];

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, sessions, updateSet, addSet, removeSet, skipExercise, setEffort, finishSession } = useApp();
  const session = sessions.find((item) => item.id === id);
  const [expanded, setExpanded] = useState<string | null>(session?.exercises[0]?.id ?? null);
  const [note, setNote] = useState('');
  const [finishing, setFinishing] = useState(false);
  const completion = useMemo(() => {
    if (!session) return { done: 0, total: 0 };
    const allSets = session.exercises.filter((item) => !item.skipped).flatMap((item) => item.sets);
    return { done: allSets.filter((set) => set.done).length, total: allSets.length };
  }, [session]);

  if (!session) return null;
  const finish = () => { setFinishing(true); finishSession(session.id, note); setTimeout(() => router.replace('/(tabs)/today'), 300); };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { borderBottomColor: colors.separator }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close workout" onPress={() => router.back()} style={styles.close}><X color={colors.text} size={23} /></Pressable>
          <View style={styles.headerCopy}><AppText weight="semibold" numberOfLines={1}>{session.title}</AppText><AppText tone="secondary" style={styles.headerSub}>{completion.done} of {completion.total} sets</AppText></View>
          <WorkoutTimer />
        </View>
        <View style={[styles.progress, { backgroundColor: colors.fillStrong }]}><View style={[styles.progressFill, { backgroundColor: colors.tint, width: `${completion.total ? (completion.done / completion.total) * 100 : 0}%` }]} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {session.exercises.map((exercise, index) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              index={index}
              expanded={expanded === exercise.id}
              onToggle={() => setExpanded((current) => current === exercise.id ? null : exercise.id)}
              onUpdateSet={(setId, value) => updateSet(session.id, exercise.id, setId, value)}
              onAdd={() => addSet(session.id, exercise.id)}
              onRemove={() => removeSet(session.id, exercise.id)}
              onSkip={() => skipExercise(session.id, exercise.id)}
              onEffort={(effort) => setEffort(session.id, exercise.id, effort)}
            />
          ))}
          <Card>
            <AppText weight="semibold">Session note</AppText>
            <TextInput value={note} onChangeText={setNote} multiline placeholder="Anything worth remembering?" placeholderTextColor={colors.textTertiary} style={[styles.note, { color: colors.text, backgroundColor: colors.fill }]} />
          </Card>
          <PrimaryButton loading={finishing} onPress={finish}>Finish session</PrimaryButton>
          <AppText tone="secondary" style={styles.finishHint}>You can finish with incomplete sets. Arcel treats the log as what happened, not a test you passed.</AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function WorkoutTimer() {
  const { colors } = useApp();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return <View style={[styles.timer, { backgroundColor: colors.fill }]}><Clock3 color={colors.textSecondary} size={14} /><AppText weight="medium" style={styles.timerText}>{time}</AppText></View>;
}

type ExerciseCardProps = {
  exercise: Exercise; index: number; expanded: boolean; onToggle: () => void;
  onUpdateSet: (setId: string, value: { weight?: number | null; reps?: number | null; done?: boolean }) => void;
  onAdd: () => void; onRemove: () => void; onSkip: () => void; onEffort: (effort: Effort) => void;
};

function exerciseTarget(exercise: Exercise) {
  if (exercise.skipped) return 'Skipped';
  if (exercise.kind === 'time') return `${Math.round((exercise.targetSeconds ?? 0) / 60)} min easy`;
  return `${exercise.sets.length} × ${exercise.targetReps} · ${exercise.restSeconds}s rest`;
}

function ExerciseHeader({ exercise, index, expanded, allDone, onToggle }: Pick<ExerciseCardProps, 'exercise' | 'index' | 'expanded' | 'onToggle'> & { allDone: boolean }) {
  const { colors } = useApp();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${exercise.name}`} onPress={onToggle} style={styles.exerciseHeader}>
      <View style={[styles.exerciseNumber, { backgroundColor: allDone ? colors.success : colors.fill }]}>{allDone ? <Check color="#FFFFFF" size={16} /> : <AppText weight="bold" style={styles.exerciseNumberText}>{index + 1}</AppText>}</View>
      <View style={styles.headerCopy}><AppText weight="semibold" style={styles.exerciseTitle}>{exercise.name}</AppText><AppText tone="secondary" style={styles.exerciseTarget}>{exerciseTarget(exercise)}</AppText></View>
      {expanded ? <ChevronUp color={colors.textTertiary} size={20} /> : <ChevronDown color={colors.textTertiary} size={20} />}
    </Pressable>
  );
}

function ExerciseSetHeader({ kind }: { kind: Exercise['kind'] }) {
  return (
    <View style={styles.setHeader}>
      <AppText tone="secondary" style={styles.setNumber}>Set</AppText>
      {kind === 'load' ? <AppText tone="secondary" style={styles.inputHeading}>kg</AppText> : null}
      {kind === 'time' ? <AppText tone="secondary" style={styles.inputWide}>time</AppText> : <AppText tone="secondary" style={styles.inputHeading}>reps</AppText>}
      <View style={styles.doneSpace} />
    </View>
  );
}

function ExerciseSetRow({ exercise, setIndex, onUpdateSet }: Pick<ExerciseCardProps, 'exercise' | 'onUpdateSet'> & { setIndex: number }) {
  const { colors } = useApp();
  const set = exercise.sets[setIndex];
  const minutes = Math.round((exercise.targetSeconds ?? 0) / 60);
  return (
    <View style={styles.setRow}>
      <AppText weight="medium" style={styles.setNumber}>{setIndex + 1}</AppText>
      {exercise.kind === 'load' ? <NumberInput value={set.weight} onChange={(weight) => onUpdateSet(set.id, { weight })} /> : null}
      {exercise.kind === 'time'
        ? <View style={[styles.timeTarget, { backgroundColor: colors.fill }]}><AppText weight="medium" style={styles.timeTargetText}>{minutes} min</AppText></View>
        : <NumberInput value={set.reps} onChange={(reps) => onUpdateSet(set.id, { reps })} />}
      <Pressable accessibilityRole="button" accessibilityLabel={set.done ? `Mark set ${setIndex + 1} incomplete` : `Complete set ${setIndex + 1}`} onPress={() => onUpdateSet(set.id, { done: !set.done })} style={[styles.done, { backgroundColor: set.done ? colors.success : colors.fill }]}>{set.done ? <Check color="#FFFFFF" size={19} /> : <Circle color={colors.textTertiary} size={18} />}</Pressable>
    </View>
  );
}

function EffortPicker({ exercise, onEffort }: Pick<ExerciseCardProps, 'exercise' | 'onEffort'>) {
  return <View style={styles.effort}><AppText weight="semibold">How did that feel?</AppText><View style={styles.effortOptions}>{effortOptions.map((option) => <ChoiceChip key={option.value} label={option.label} selected={exercise.effort === option.value} onPress={() => onEffort(option.value)} style={styles.effortChip} />)}</View></View>;
}

function ExerciseUtilities({ exercise, onSkip }: Pick<ExerciseCardProps, 'exercise' | 'onSkip'>) {
  const { colors } = useApp();
  return (
    <View style={[styles.utilityRow, { borderTopColor: colors.separator }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Swap ${exercise.name}`} onPress={() => router.push({ pathname: '/(tabs)/chat', params: { context: `swapping ${exercise.name}` } })} style={styles.utility}><MessageCircle color={colors.textSecondary} size={16} /><AppText tone="secondary" weight="medium" style={styles.utilityText}>Swap</AppText></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Skip ${exercise.name}`} onPress={onSkip} style={styles.utility}><SkipForward color={colors.textSecondary} size={16} /><AppText tone="secondary" weight="medium" style={styles.utilityText}>Skip</AppText></Pressable>
    </View>
  );
}

function ExerciseBody({ exercise, onUpdateSet, onAdd, onRemove, onSkip, onEffort, allDone }: Omit<ExerciseCardProps, 'index' | 'expanded' | 'onToggle'> & { allDone: boolean }) {
  const { colors } = useApp();
  return (
    <View style={styles.exerciseBody}>
      {exercise.form ? <View style={[styles.formTip, { backgroundColor: colors.tintSoft }]}><AppText tone="tint" style={styles.formText}>{exercise.form}</AppText></View> : null}
      <AppText tone="secondary" style={styles.why}>{exercise.why}</AppText>
      <ExerciseSetHeader kind={exercise.kind} />
      {exercise.sets.map((set, setIndex) => <ExerciseSetRow key={set.id} exercise={exercise} setIndex={setIndex} onUpdateSet={onUpdateSet} />)}
      <View style={styles.setActions}>
        <SecondaryButton icon={Plus} onPress={onAdd} style={styles.actionButton}>Add set</SecondaryButton>
        <SecondaryButton icon={Minus} onPress={onRemove} style={styles.actionButton}>One fewer</SecondaryButton>
      </View>
      {allDone ? <EffortPicker exercise={exercise} onEffort={onEffort} /> : null}
      <ExerciseUtilities exercise={exercise} onSkip={onSkip} />
    </View>
  );
}

function ExerciseCard(props: ExerciseCardProps) {
  const { exercise, expanded } = props;
  const allDone = exercise.sets.length > 0 && exercise.sets.every((set) => set.done);
  return (
    <Card style={exercise.skipped ? styles.skippedCard : undefined}>
      <ExerciseHeader exercise={exercise} index={props.index} expanded={expanded} allDone={allDone} onToggle={props.onToggle} />
      {expanded && !exercise.skipped ? <ExerciseBody {...props} allDone={allDone} /> : null}
    </Card>
  );
}

function NumberInput({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const { colors } = useApp();
  return <TextInput keyboardType="decimal-pad" value={value == null ? '' : String(value)} onChangeText={(text) => { const parsed = Number(text.replace(',', '.')); onChange(text === '' || Number.isNaN(parsed) ? null : parsed); }} selectTextOnFocus style={[styles.numberInput, { color: colors.text, backgroundColor: colors.fill }]} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 64, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  close: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1 }, headerSub: { fontSize: 11, lineHeight: 15 },
  timer: { minHeight: 34, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10 }, timerText: { fontSize: 12 },
  progress: { height: 3 }, progressFill: { height: 3 }, content: { padding: 14, paddingBottom: 30, gap: 10 },
  skippedCard: { opacity: 0.55 }, exerciseHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 11 },
  exerciseNumber: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, exerciseNumberText: { fontSize: 12 },
  exerciseTitle: { fontSize: 16, lineHeight: 21 }, exerciseTarget: { marginTop: 2, fontSize: 12, lineHeight: 16 }, exerciseBody: { paddingTop: 12 },
  formTip: { borderRadius: 13, padding: 11 }, formText: { fontSize: 12, lineHeight: 17 }, why: { fontSize: 12, lineHeight: 18, marginTop: 9, marginBottom: 13 },
  setHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }, setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  setNumber: { width: 30, textAlign: 'center', fontSize: 11 }, inputHeading: { width: 68, textAlign: 'center', fontSize: 10 }, inputWide: { width: 144, textAlign: 'center', fontSize: 10 }, doneSpace: { width: 42 },
  numberInput: { width: 68, height: 42, borderRadius: 12, textAlign: 'center', fontFamily: fonts.medium, fontSize: 15 }, timeTarget: { width: 144, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, timeTargetText: { fontSize: 13 },
  done: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  setActions: { flexDirection: 'row', gap: 8, marginTop: 3 }, actionButton: { flex: 1, minHeight: 42 },
  effort: { marginTop: 17, gap: 10 }, effortOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, effortChip: { minHeight: 38, flexGrow: 1 },
  utilityRow: { marginTop: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row' }, utility: { flex: 1, minHeight: 38, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }, utilityText: { fontSize: 12 },
  note: { marginTop: 11, minHeight: 80, borderRadius: radius.panel, padding: 12, fontFamily: fonts.regular, fontSize: 14, textAlignVertical: 'top' }, finishHint: { textAlign: 'center', fontSize: 11, lineHeight: 16, paddingHorizontal: 16 },
});
