import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Check, ChevronDown, ChevronUp, Circle, Clock3, MessageCircle, Minus, Plus, SkipForward, X } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type AppStateStatus } from 'react-native';
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
          <View style={styles.headerCopy}><AppText weight="medium" numberOfLines={1} style={styles.headerTitle}>{session.title}</AppText><AppText tone="secondary" style={styles.headerSub}>{completion.done} of {completion.total} sets</AppText></View>
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
          <View style={styles.noteSection}>
            <AppText weight="medium">Session note</AppText>
            <TextInput accessibilityLabel="Session note" value={note} onChangeText={setNote} multiline placeholder="Anything worth remembering?" placeholderTextColor={colors.textTertiary} style={[styles.note, { color: colors.text, backgroundColor: colors.card, borderColor: colors.separator }]} />
          </View>
          <PrimaryButton loading={finishing} onPress={finish}>Finish session</PrimaryButton>
          <AppText tone="secondary" style={styles.finishHint}>You can finish with incomplete sets. Your log records the work you did.</AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function WorkoutTimer() {
  const { colors } = useApp();
  const startedAt = useRef<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  useFocusEffect(useCallback(() => {
    const start = startedAt.current ??= Date.now();
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => { if (timer !== undefined) { clearInterval(timer); timer = undefined; } };
    const update = () => setSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    const sync = (state: AppStateStatus) => {
      stop();
      if (state === 'active') { update(); timer = setInterval(update, 1000); }
    };
    sync(AppState.currentState);
    const listener = AppState.addEventListener('change', sync);
    return () => { stop(); listener.remove(); };
  }, []));
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return <View style={[styles.timer, { borderColor: colors.separator }]}><Clock3 color={colors.textSecondary} size={14} /><AppText weight="medium" style={styles.timerText}>{time}</AppText></View>;
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
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${exercise.name}`} onPress={onToggle} style={styles.exerciseHeader}>
      <View style={[styles.exerciseNumber, { backgroundColor: colors.fill }]}>{allDone ? <Check color={colors.success} size={16} /> : <AppText tone="secondary" style={styles.exerciseNumberText}>{String(index + 1).padStart(2, '0')}</AppText>}</View>
      <View style={styles.headerCopy}><AppText weight="medium" style={styles.exerciseTitle}>{exercise.name}</AppText><AppText tone="secondary" style={styles.exerciseTarget}>{exerciseTarget(exercise)}</AppText></View>
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
      {exercise.kind === 'load' ? <NumberInput label={`${exercise.name}, set ${setIndex + 1}, weight in kilograms`} value={set.weight} onChange={(weight) => onUpdateSet(set.id, { weight })} /> : null}
      {exercise.kind === 'time'
        ? <View style={[styles.timeTarget, { backgroundColor: colors.fill }]}><AppText weight="medium" style={styles.timeTargetText}>{minutes} min</AppText></View>
        : <NumberInput label={`${exercise.name}, set ${setIndex + 1}, repetitions`} value={set.reps} onChange={(reps) => onUpdateSet(set.id, { reps })} />}
      <Pressable accessibilityRole="button" accessibilityLabel={set.done ? `Mark set ${setIndex + 1} incomplete` : `Complete set ${setIndex + 1}`} onPress={() => onUpdateSet(set.id, { done: !set.done })} style={[styles.done, { backgroundColor: colors.fill }]}>{set.done ? <Check color={colors.success} size={21} /> : <Circle color={colors.textTertiary} size={18} />}</Pressable>
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
      {exercise.form ? <View style={[styles.formTip, { borderLeftColor: colors.tint }]}><AppText tone="tint" style={styles.formText}>{exercise.form}</AppText></View> : null}
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

function NumberInput({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  const { colors } = useApp();
  return <TextInput accessibilityLabel={label} keyboardType="decimal-pad" value={value == null ? '' : String(value)} onChangeText={(text) => { const parsed = Number(text.replace(',', '.')); onChange(text === '' || Number.isNaN(parsed) ? null : parsed); }} selectTextOnFocus style={[styles.numberInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.separator }]} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 76, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1 }, headerTitle: { fontSize: 16, lineHeight: 22 }, headerSub: { fontSize: 11, lineHeight: 17, marginTop: 3 },
  timer: { minHeight: 34, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11 }, timerText: { fontSize: 12, fontVariant: ['tabular-nums'] },
  progress: { height: 2 }, progressFill: { height: 2 }, content: { padding: 20, paddingBottom: 36, gap: 14, width: '100%', maxWidth: 680, alignSelf: 'center' },
  skippedCard: { opacity: 0.55 }, exerciseHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 11 },
  exerciseNumber: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, exerciseNumberText: { fontSize: 11, fontVariant: ['tabular-nums'] },
  exerciseTitle: { fontSize: 17, lineHeight: 23 }, exerciseTarget: { marginTop: 3, fontSize: 12, lineHeight: 18 }, exerciseBody: { paddingTop: 22 },
  formTip: { borderLeftWidth: 2, paddingLeft: 12, paddingVertical: 3 }, formText: { fontSize: 13, lineHeight: 20 }, why: { fontSize: 13, lineHeight: 20, marginTop: 12, marginBottom: 20 },
  setHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }, setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  setNumber: { width: 24, textAlign: 'center', fontSize: 11 }, inputHeading: { flex: 1, textAlign: 'center', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }, inputWide: { flex: 1, textAlign: 'center', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }, doneSpace: { width: 44 },
  numberInput: { flex: 1, minWidth: 0, height: 48, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, textAlign: 'center', fontFamily: fonts.medium, fontSize: 17, fontVariant: ['tabular-nums'] }, timeTarget: { flex: 1, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, timeTargetText: { fontSize: 15 },
  done: { width: 44, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  setActions: { flexDirection: 'row', gap: 8, marginTop: 8 }, actionButton: { flex: 1, minHeight: 44, paddingHorizontal: 8 },
  effort: { marginTop: 17, gap: 10 }, effortOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, effortChip: { minHeight: 44, flexGrow: 1 },
  utilityRow: { marginTop: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row' }, utility: { flex: 1, minHeight: 44, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }, utilityText: { fontSize: 12 },
  noteSection: { marginTop: 12 },
  note: { marginTop: 12, minHeight: 110, borderRadius: radius.panel, borderWidth: StyleSheet.hairlineWidth, padding: 16, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, textAlignVertical: 'top' }, finishHint: { textAlign: 'center', fontSize: 12, lineHeight: 18, paddingHorizontal: 16 },
});
