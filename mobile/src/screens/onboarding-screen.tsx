import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, HeartPulse, Info, ShieldCheck, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Card, ChoiceChip, PrimaryButton, SecondaryButton, ShieldLine } from '@/components/ui';
import { fonts, radius } from '@/design/tokens';
import type { Profile } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { surveyAnswers, type Answers } from '@/services/api';

const trainingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const promises = ['One plan, two distinct progress tracks', 'Repairs the week when plans move', 'Explains what changed and what stayed protected'];
const stepHeadings: Record<number, { title: string; copy: string }> = {
  1: { title: 'Shape your week', copy: 'Start with the week you can actually repeat.' },
  2: { title: 'What you have', copy: 'Enough detail to make the plan practical.' },
  3: { title: 'Your starting point', copy: 'Plain estimates are perfect. No test day required.' },
  4: { title: 'Train safely', copy: 'Help us understand any current limits on your training.' },
  5: { title: 'Anything else?', copy: 'A sentence can be more useful than ten settings.' },
};

const experienceLabels: Record<Profile['experienceLevel'], string> = {
  new: 'New / returning',
  intermediate: '1–2 × / week',
  experienced: '3+ × / week',
};
const experienceValues: Record<string, Profile['experienceLevel']> = {
  'New / returning': 'new',
  '1–2 × / week': 'intermediate',
  '3+ × / week': 'experienced',
};

function toggleItem(items: string[], item: string) {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

function textAnswer(answers: Answers, key: string, fallback: string) {
  return typeof answers[key] === 'string' ? answers[key] : fallback;
}

export default function OnboardingScreen() {
  const { accountReady, colors, profile, onboardingAnswers, notice, finishOnboarding } = useApp();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = edit === '1' && profile.onboardingComplete;
  const [step, setStep] = useState(editing ? 1 : 0);
  const [draft, setDraft] = useState<Profile>(profile);
  const [building, setBuilding] = useState(false);
  const [runCapacity, setRunCapacity] = useState(textAnswer(onboardingAnswers, 'runCapacity', '10–20 min'));
  const [pushups, setPushups] = useState(textAnswer(onboardingAnswers, 'pushups', '5–10'));
  const [pain, setPain] = useState(textAnswer(onboardingAnswers, 'pain', 'Nothing current'));
  const [note, setNote] = useState(textAnswer(onboardingAnswers, 'note', ''));
  const update = (value: Partial<Profile>) => setDraft((current) => ({ ...current, ...value }));
  const toggleDay = (day: string) => update({ trainingDays: toggleItem(draft.trainingDays, day) });
  const finish = async () => {
    if (building) return;
    setBuilding(true);
    const saved = await finishOnboarding(draft, surveyAnswers(draft, { ...onboardingAnswers, runCapacity, pushups, pain, note }));
    setBuilding(false);
    if (saved) router.replace('/(tabs)/chat');
  };
  const shouldRedirect = accountReady && profile.onboardingComplete && !editing && step === 0;

  useEffect(() => {
    if (shouldRedirect) router.replace('/(tabs)/today');
  }, [shouldRedirect]);

  if (shouldRedirect) {
    return <View style={[styles.redirecting, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.tint} /></View>;
  }

  if (step === 0) return <WelcomeStep onStart={() => setStep(1)} />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {editing ? <Pressable accessibilityRole="button" accessibilityLabel="Close setup" disabled={building} onPress={() => router.replace('/(tabs)/you')} style={styles.close}><X color={colors.text} size={24} /></Pressable> : null}
        <StepProgress step={step} onBack={() => setStep((value) => Math.max(1, value - 1))} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <StepHeading step={step} />
          {notice ? <AppText>{notice}</AppText> : null}
          <StepContent step={step} draft={draft} update={update} toggleDay={toggleDay} pushups={pushups} setPushups={setPushups} runCapacity={runCapacity} setRunCapacity={setRunCapacity} pain={pain} setPain={setPain} note={note} setNote={setNote} />
        </ScrollView>
        <StepFooter step={step} building={building} onContinue={() => setStep((value) => value + 1)} onBuild={() => setStep(6)} onSkip={() => { setNote(''); setStep(6); }} onFinish={() => void finish()} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function WelcomeStep({ onStart }: { onStart: () => void }) {
  const { colors } = useApp();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.welcome}>
        <AppText weight="medium" style={styles.brand}>Arcel</AppText>
        <AppText style={styles.welcomeTitle}>{'Train with purpose.\nPlan for real life.'}</AppText>
        <AppText tone="secondary" style={styles.welcomeCopy}>Strength and endurance, planned together around your goals and the time you have.</AppText>
        <View style={[styles.promiseList, { borderTopColor: colors.separator }]}>{promises.map((text) => <View key={text} style={styles.promise}><Check color={colors.tint} size={17} strokeWidth={1.5} /><AppText style={styles.promiseText}>{text}</AppText></View>)}</View>
      </ScrollView>
      <View style={styles.welcomeFooter}><PrimaryButton onPress={onStart}>Shape my week</PrimaryButton><AppText tone="secondary" style={styles.footerNote}>About 2 minutes · you can change this later</AppText></View>
    </SafeAreaView>
  );
}

function StepProgress({ step, onBack }: { step: number; onBack: () => void }) {
  const { colors } = useApp();
  const visibleStep = Math.min(step, 5);
  return <View style={styles.topbar}><Pressable accessibilityRole="button" accessibilityLabel="Previous step" disabled={step === 1} onPress={onBack} style={styles.back}><ArrowLeft color={step === 1 ? colors.textTertiary : colors.text} size={21} /></Pressable><View style={[styles.progress, { backgroundColor: colors.fillStrong }]}><View style={[styles.progressFill, { backgroundColor: colors.tint, width: `${visibleStep * 20}%` }]} /></View><AppText tone="secondary" style={styles.stepLabel}>{visibleStep} / 5</AppText></View>;
}

function StepHeading({ step }: { step: number }) {
  const heading = stepHeadings[step];
  if (!heading) return null;
  return <><AppText style={styles.stepTitle}>{heading.title}</AppText><AppText tone="secondary" style={styles.stepCopy}>{heading.copy}</AppText></>;
}

type StepContentProps = {
  step: number;
  draft: Profile;
  update: (value: Partial<Profile>) => void;
  toggleDay: (day: string) => void;
  pushups: string;
  setPushups: (value: string) => void;
  runCapacity: string;
  setRunCapacity: (value: string) => void;
  pain: string;
  setPain: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
};

function ScheduleStep({ draft, update, toggleDay }: Pick<StepContentProps, 'draft' | 'update' | 'toggleDay'>) {
  return <View style={styles.form}><FieldTitle>What should this plan lean toward?</FieldTitle><ChipGrid values={['Strong and fit', 'Mostly strength', 'Mostly cardio']} selected={draft.goal} onSelect={(goal) => update({ goal })} /><FieldTitle>How many training days?</FieldTitle><ChipGrid values={['3', '4', '5']} selected={String(draft.daysPerWeek)} onSelect={(value) => update({ daysPerWeek: Number(value) })} /><FieldTitle>Usual session length</FieldTitle><ChipGrid values={['30', '45', '60']} selected={String(draft.sessionMinutes)} onSelect={(value) => update({ sessionMinutes: Number(value) })} suffix=" min" /><FieldTitle>Days that usually work</FieldTitle><View style={styles.dayGrid}>{trainingDays.map((day) => <ChoiceChip key={day} label={day} selected={draft.trainingDays.includes(day)} onPress={() => toggleDay(day)} style={styles.dayChip} />)}</View></View>;
}

function EquipmentStep({ draft, update }: Pick<StepContentProps, 'draft' | 'update'>) {
  return <View style={styles.form}><FieldTitle>Equipment</FieldTitle><ChipGrid values={['Full gym', 'Dumbbells', 'Bodyweight']} selected={draft.equipment} onSelect={(equipment) => update({ equipment })} /><FieldTitle>Cardio you’ll actually do</FieldTitle><ChipGrid values={['Running', 'Bike', 'Mixed']} selected={draft.cardio} onSelect={(cardio) => update({ cardio })} /><FieldTitle>Recent lifting</FieldTitle><ChipGrid values={Object.values(experienceLabels)} selected={experienceLabels[draft.experienceLevel]} onSelect={(value) => update({ experienceLevel: experienceValues[value] })} /></View>;
}

function CapacityStep({ pushups, setPushups, runCapacity, setRunCapacity }: Pick<StepContentProps, 'pushups' | 'setPushups' | 'runCapacity' | 'setRunCapacity'>) {
  const { colors } = useApp();
  return <View style={styles.form}><FieldTitle>Comfortable push-ups</FieldTitle><ChipGrid values={['0–4', '5–10', '11–20', '20+']} selected={pushups} onSelect={setPushups} /><FieldTitle>Easy continuous run</FieldTitle><ChipGrid values={['Under 10 min', '10–20 min', '20–40 min', '40+ min']} selected={runCapacity} onSelect={setRunCapacity} /><Card style={styles.softCard}><Info color={colors.textSecondary} size={19} strokeWidth={1.5} /><AppText tone="secondary" style={styles.softText}>These answers only choose a sensible starting dose. Your logs will replace the estimate quickly.</AppText></Card></View>;
}

function SafetyStep({ pain, setPain }: Pick<StepContentProps, 'pain' | 'setPain'>) {
  const { colors } = useApp();
  return <View style={styles.form}><FieldTitle>Current pain or limitation?</FieldTitle><ChipGrid values={['Nothing current', 'Manageable niggle', 'Needs a clinician']} selected={pain} onSelect={setPain} /><Card style={styles.safetyCard}><HeartPulse color={colors.danger} size={22} /><View style={styles.flex}><AppText weight="semibold">A useful boundary</AppText><AppText tone="secondary" style={styles.softText}>Sharp, worsening, or unexplained pain is a stop signal—not something the plan should train through.</AppText></View></Card><ShieldLine>Arcel is training guidance, not diagnosis or medical care.</ShieldLine></View>;
}

function NotesStep({ draft, update, note, setNote }: Pick<StepContentProps, 'draft' | 'update' | 'note' | 'setNote'>) {
  const { colors } = useApp();
  return <View style={styles.form}><FieldTitle>What should Arcel know?</FieldTitle><TextInput accessibilityLabel="What should Arcel know?" value={note} onChangeText={setNote} multiline placeholder="Travel, exercises you avoid, old injuries, what usually derails a week…" placeholderTextColor={colors.textTertiary} style={[styles.noteInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.separator }]} /><FieldTitle>What should we call you?</FieldTitle><TextInput accessibilityLabel="Your name" value={draft.displayName} onChangeText={(displayName) => update({ displayName })} maxLength={60} placeholder="First name (optional)" placeholderTextColor={colors.textTertiary} style={[styles.nameInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.separator }]} /></View>;
}

function RevealStep({ draft, pushups, runCapacity }: Pick<StepContentProps, 'draft' | 'pushups' | 'runCapacity'>) {
  const { colors } = useApp();
  return <View style={styles.reveal}><View style={[styles.revealIcon, { borderColor: colors.separator }]}><ShieldCheck color={colors.tintText} size={26} strokeWidth={1.3} /></View><AppText style={styles.revealTitle}>Review your answers.</AppText><AppText tone="secondary" style={styles.revealCopy}>Save your preferences to your account. Planning will be connected later; you can start using chat now.</AppText><Card style={styles.summaryCard}><Summary label="Shape" value={`${draft.daysPerWeek} days · ${draft.sessionMinutes} min`} /><Summary label="Goal" value={draft.goal} /><Summary label="Setup" value={`${draft.equipment} · ${draft.cardio}`} /><Summary label="Starting point" value={`${pushups} push-ups · ${runCapacity} run`} /></Card></View>;
}

function StepContent(props: StepContentProps) {
  switch (props.step) {
    case 1: return <ScheduleStep {...props} />;
    case 2: return <EquipmentStep {...props} />;
    case 3: return <CapacityStep {...props} />;
    case 4: return <SafetyStep {...props} />;
    case 5: return <NotesStep {...props} />;
    case 6: return <RevealStep {...props} />;
    default: return null;
  }
}

function StepFooter({ step, building, onContinue, onBuild, onSkip, onFinish }: { step: number; building: boolean; onContinue: () => void; onBuild: () => void; onSkip: () => void; onFinish: () => void }) {
  const { colors } = useApp();
  if (step < 5) return <View style={[styles.bottom, { borderTopColor: colors.separator }]}><PrimaryButton onPress={onContinue}>Continue</PrimaryButton></View>;
  if (step === 5) return <View style={[styles.bottom, { borderTopColor: colors.separator }]}><PrimaryButton onPress={onBuild}>Review answers</PrimaryButton><SecondaryButton onPress={onSkip}>Skip for now</SecondaryButton></View>;
  return <View style={[styles.bottom, { borderTopColor: colors.separator }]}><PrimaryButton loading={building} onPress={onFinish}>Save and open chat</PrimaryButton></View>;
}

function FieldTitle({ children }: { children: string }) { return <AppText weight="medium" style={styles.fieldTitle}>{children}</AppText>; }
function ChipGrid({ values, selected, onSelect, suffix = '' }: { values: string[]; selected: string; onSelect: (value: string) => void; suffix?: string }) { return <View style={styles.chips}>{values.map((value) => <ChoiceChip key={value} label={`${value}${suffix}`} selected={selected === value} onPress={() => onSelect(value)} style={styles.flexChip} />)}</View>; }
function Summary({ label, value }: { label: string; value: string }) { return <View style={styles.summaryRow}><AppText tone="secondary" style={styles.summaryLabel}>{label}</AppText><AppText weight="medium" style={styles.summaryValue}>{value}</AppText></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1 },
  redirecting: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcome: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 32 },
  brand: { fontSize: 14, lineHeight: 20, letterSpacing: 3, textTransform: 'uppercase' },
  welcomeTitle: { marginTop: 42, fontSize: 42, lineHeight: 47, letterSpacing: -1.7 },
  welcomeCopy: { marginTop: 20, fontSize: 16, lineHeight: 25 },
  promiseList: { marginTop: 34, paddingTop: 24, borderTopWidth: StyleSheet.hairlineWidth, gap: 16 },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  promiseText: { flex: 1, fontSize: 13, lineHeight: 20 },
  welcomeFooter: { paddingHorizontal: 24, paddingBottom: 16, gap: 14 },
  footerNote: { textAlign: 'center', fontSize: 11, lineHeight: 16 },
  close: { alignSelf: 'flex-end', padding: 12 },
  topbar: { minHeight: 68, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  progress: { flex: 1, height: 2, borderRadius: 1, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 1 },
  stepLabel: { width: 36, fontSize: 11, letterSpacing: 0.7, fontVariant: ['tabular-nums'] },
  content: { paddingHorizontal: 24, paddingBottom: 36 },
  stepTitle: { marginTop: 24, fontSize: 36, lineHeight: 42, letterSpacing: -1.3 },
  stepCopy: { marginTop: 12, fontSize: 15, lineHeight: 24 },
  form: { marginTop: 30, gap: 12 },
  fieldTitle: { fontSize: 14, lineHeight: 21, marginTop: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flexChip: { flexGrow: 1 },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: { minWidth: 55, flexGrow: 1 },
  softCard: { flexDirection: 'row', gap: 12, marginTop: 16 },
  softText: { flex: 1, fontSize: 13, lineHeight: 21 },
  safetyCard: { flexDirection: 'row', gap: 12, marginTop: 16 },
  flex: { flex: 1 },
  noteInput: { minHeight: 160, borderRadius: radius.panel, borderWidth: StyleSheet.hairlineWidth, padding: 16, fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, textAlignVertical: 'top' },
  nameInput: { minHeight: 56, borderRadius: radius.panel, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, fontFamily: fonts.regular, fontSize: 15 },
  bottom: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  reveal: { paddingTop: 30 },
  revealIcon: { width: 56, height: 56, borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  revealTitle: { marginTop: 26, fontSize: 36, lineHeight: 42, letterSpacing: -1.3 },
  revealCopy: { marginTop: 14, fontSize: 15, lineHeight: 24 },
  summaryCard: { alignSelf: 'stretch', marginTop: 30, gap: 0 },
  summaryRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryLabel: { width: 88, fontSize: 12 },
  summaryValue: { flex: 1, textAlign: 'right', fontSize: 13, lineHeight: 20 },
});
