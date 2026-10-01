import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Check, ChevronLeft, ChevronRight, Send, ShieldCheck, X } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BalanceSlider } from '@/components/balance-slider';
import { DurationWheel } from '@/components/duration-wheel';
import { AppText, Card, PrimaryButton, SecondaryButton } from '@/components/ui';
import { fonts, radius, shadow } from '@/design/tokens';
import {
  BALANCE_LABELS, onboardingDraft, onboardingSubmission, QUESTION_IDS, questionError,
  SPORTS, TRAINING_DAYS, VENUE_LABELS, type OnboardingDraft, type QuestionId, type Venue,
} from '@/lib/onboarding';
import { formatSessionDuration } from '@/lib/session-duration';
import { useApp } from '@/state/app-context';

const NOTE_PROMPTS = [
  "I'm training for something", 'I have some discomfort',
  'My week is unpredictable', "I'm coming back from a break",
];
const NOTE_HINTS: Record<string, string> = {
  "I'm training for something": 'What are you training for, and roughly when?',
  'I have some discomfort': 'Where do you feel it, and which movements bring it on?',
  'My week is unpredictable': 'What usually changes, and what time can you count on?',
  "I'm coming back from a break": 'How long has it been, and what would you like to get back to?',
};

function selectionFeedback() {
  if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
}

export default function OnboardingScreen() {
  const { accountReady, colors } = useApp();
  if (!accountReady) return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.tint} /></View>;
  return <OnboardingFlow />;
}

function OnboardingFlow() {
  const { accountReady, colors, profile, onboardingAnswers, notice, finishOnboarding } = useApp();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = edit === '1' && profile.onboardingComplete;
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [draft, setDraft] = useState(() => onboardingDraft(profile, onboardingAnswers));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const saveInFlight = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const question = QUESTION_IDS[step - 1];
  const reviewing = step === QUESTION_IDS.length + 1;
  const shouldRedirect = accountReady && profile.onboardingComplete && !editing && step === 0;
  const update = (patch: Partial<OnboardingDraft>) => {
    setDraft(current => ({ ...current, ...patch }));
    setValidation(null);
  };

  useEffect(() => {
    if (shouldRedirect) router.replace('/(tabs)/today');
  }, [shouldRedirect]);

  const move = (to: number) => {
    Keyboard.dismiss();
    selectionFeedback();
    setDirection(to > step ? 1 : -1);
    setValidation(null);
    setStep(to);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const next = () => {
    const error = questionError(question, draft);
    if (error) { setValidation(error); return; }
    // The final typed note is saved even when the send arrow wasn't tapped.
    if (question === 'notes' && note.trim()) {
      update({ notes: [...draft.notes, note.trim()] });
      setNote('');
    }
    move(step + 1);
  };
  const finish = async () => {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    const submission = onboardingSubmission(profile, draft, note);
    try {
      const saved = await finishOnboarding(submission.profile, submission.answers);
      if (saved) router.replace(editing ? '/(tabs)/you' : '/(tabs)/chat');
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  if (!accountReady || shouldRedirect) {
    return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.tint} /></View>;
  }
  if (step === 0) return <WelcomeStep editing={editing} onStart={() => move(1)} />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topbar}>
          <View style={styles.topSpacer} />
          <View accessibilityRole="progressbar" accessibilityLabel={reviewing ? 'Review your answers' : `Question ${step} of ${QUESTION_IDS.length}`}
            accessibilityValue={{ min: 0, max: QUESTION_IDS.length, now: Math.min(step, QUESTION_IDS.length) }}
            style={[styles.progress, { backgroundColor: colors.fillStrong }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.tint, width: `${Math.min(step, QUESTION_IDS.length) / QUESTION_IDS.length * 100}%` }]} />
          </View>
          {editing ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Close onboarding without saving" disabled={saving}
              onPress={() => router.replace('/(tabs)/you')} style={styles.close}>
              <X color={colors.textSecondary} size={21} />
            </Pressable>
          ) : <View style={styles.topSpacer} />}
        </View>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <Animated.View key={step} entering={(direction > 0 ? FadeInRight : FadeInLeft).duration(220).reduceMotion(ReduceMotion.System)} style={styles.stage}>
            {reviewing ? <ReviewStep draft={draft} /> : (
              <Question id={question} draft={draft} update={update} note={note} setNote={setNote} />
            )}
            {validation ? <AppText accessibilityRole="alert" style={[styles.message, { color: colors.danger }]}>{validation}</AppText> : null}
            {reviewing && notice ? <AppText accessibilityRole="alert" style={[styles.message, { color: colors.danger }]}>{notice}</AppText> : null}
          </Animated.View>
        </ScrollView>
        {reviewing ? (
          <View style={styles.reviewFooter}>
            <PrimaryButton loading={saving} onPress={() => void finish()}>{editing ? 'Save changes' : 'Save and open chat'}</PrimaryButton>
            <SecondaryButton disabled={saving} onPress={() => move(QUESTION_IDS.length)}>Back to my answers</SecondaryButton>
          </View>
        ) : (
          <View style={styles.footer}>
            <Pressable accessibilityRole="button" onPress={() => move(step - 1)} style={styles.navLink}>
              <ChevronLeft color={colors.textSecondary} size={19} /><AppText tone="secondary" weight="medium">Back</AppText>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={next} style={styles.navLink}>
              <AppText tone="tint" weight="semibold">{question === 'notes' ? 'Review answers' : 'Next'}</AppText><ChevronRight color={colors.tintText} size={19} />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function WelcomeStep({ editing, onStart }: { editing: boolean; onStart: () => void }) {
  const { colors } = useApp();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.welcomeBrand}><AppText weight="medium" style={styles.brand}>Arcel</AppText></View>
      <ScrollView contentContainerStyle={styles.welcome}>
        <AppText accessibilityRole="header" style={styles.welcomeTitle}>{editing ? 'Make room for\nwhat’s changed.' : 'Your sport.\nYour week.'}</AppText>
        <AppText tone="secondary" style={styles.welcomeCopy}>{editing
          ? 'Update your sport, your schedule, and what you want to work toward. Your current answers stay saved until you finish.'
          : 'Tell us what you play and what fits your life. We’ll keep that context close as you train.'}</AppText>
      </ScrollView>
      <View style={styles.welcomeFooter}>
        <PrimaryButton onPress={onStart}>{editing ? 'Update my answers' : 'Let’s get started'}</PrimaryButton>
        {editing ? <SecondaryButton onPress={() => router.replace('/(tabs)/you')}>Keep my current answers</SecondaryButton>
          : <AppText tone="secondary" style={styles.footerNote}>8 short questions · change your answers anytime</AppText>}
      </View>
    </SafeAreaView>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <AppText accessibilityRole="header" style={styles.title}>{children}</AppText>;
}

function ChoiceTile({ label, selected, onPress, multi = false, compact = false }: {
  label: string; selected: boolean; onPress: () => void; multi?: boolean; compact?: boolean;
}) {
  const { colors, colorScheme } = useApp();
  const foreground = selected ? colorScheme === 'dark' ? colors.background : colors.white : colors.text;
  return (
    <Pressable accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityLabel={label}
      accessibilityState={{ checked: selected }} aria-checked={selected} onPress={() => { selectionFeedback(); onPress(); }}
      style={({ pressed }) => [styles.tile, compact && styles.dayTile, {
        backgroundColor: selected ? colors.tint : colors.card, borderColor: selected ? colors.tint : colors.separator,
      }, pressed && styles.pressed]}>
      <AppText weight={selected ? 'semibold' : 'medium'} style={[styles.tileText, compact && styles.dayText, { color: foreground }]}>{label}</AppText>
      {selected ? <Check color={foreground} size={compact ? 12 : 16} strokeWidth={2.5} style={compact ? styles.dayCheck : styles.check} /> : null}
    </Pressable>
  );
}

function Choices({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.choices, wide && styles.wide]}>{children}</View>;
}

type QuestionProps = {
  id: QuestionId; draft: OnboardingDraft; update: (value: Partial<OnboardingDraft>) => void;
  note: string; setNote: (value: string) => void;
};

function Question({ id, draft, update, note, setNote }: QuestionProps) {
  const { colors } = useApp();
  const inputStyle = [styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.separator }];
  switch (id) {
    case 'sport': return <>
      <Heading>What sport do you play?</Heading>
      <Choices label="Your sport">{SPORTS.map(sport => <ChoiceTile key={sport} label={sport}
        selected={draft.sport === sport} onPress={() => update({ sport })} />)}</Choices>
    </>;
    case 'sportGoal': return <>
      <Heading>Any goals for {draft.sport.trim() ? draft.sport.trim().toLowerCase() : 'your sport'} this season?</Heading>
      <TextInput accessibilityLabel="Goals for your sport" value={draft.sportGoal} onChangeText={sportGoal => update({ sportGoal })}
        multiline placeholder="Make the starting team, get faster off the line, last the whole game…"
        placeholderTextColor={colors.textTertiary} style={[inputStyle, styles.textarea]} />
      <AppText tone="secondary" style={styles.hint}>Optional — it’s okay to figure this out as you go.</AppText>
    </>;
    case 'balance': return <>
      <Heading>Around your sport, what should the week lean toward?</Heading>
      <View style={styles.wide}>
        <View style={styles.sliderLabels}><AppText tone="secondary">Lifting</AppText><AppText tone="secondary">Cardio</AppText></View>
        <BalanceSlider balance={draft.balance} onChange={balance => { if (balance !== draft.balance) { selectionFeedback(); update({ balance }); } }} />
        <AppText weight="medium" style={styles.balanceLabel}>{BALANCE_LABELS[draft.balance]}</AppText>
      </View>
    </>;
    case 'trainingDays': return <>
      <Heading>Which days can you train?</Heading>
      <View accessibilityLabel="Training days" style={styles.days}>{TRAINING_DAYS.map(day => <ChoiceTile key={day} compact multi label={day}
        selected={draft.trainingDays.includes(day)} onPress={() => update({ trainingDays: draft.trainingDays.includes(day)
          ? draft.trainingDays.filter(value => value !== day) : [...draft.trainingDays, day] })} />)}</View>
      <AppText tone="secondary" style={styles.hint}>Select all the days that usually work.</AppText>
    </>;
    case 'minutes': return <>
      <Heading>How long per session?</Heading>
      <DurationWheel minutes={draft.sessionMinutes} onChange={sessionMinutes => { selectionFeedback(); update({ sessionMinutes }); }} />
      <AppText tone="secondary" style={styles.hint}>Scroll to choose · 15 min to 2 hours+</AppText>
    </>;
    case 'venue': return <>
      <Heading>Where will you train?</Heading>
      <Choices label="Training setup" wide>{(Object.keys(VENUE_LABELS) as Venue[]).map(venue => <ChoiceTile key={venue} label={VENUE_LABELS[venue]}
        selected={draft.venue === venue} onPress={() => update({ venue })} />)}</Choices>
    </>;
    case 'lifts14': return <>
      <Heading>How many times have you lifted in the last two weeks?</Heading>
      <Choices label="Lifting sessions in the last two weeks">{[0, 1, 2, 3, 4, 5, 6].map(count => <ChoiceTile key={count} label={count === 6 ? '6+' : String(count)}
        selected={draft.lifts14 === count} onPress={() => update({ lifts14: count })} />)}</Choices>
    </>;
    case 'notes': return <NotesStep draft={draft} update={update} note={note} setNote={setNote} />;
  }
}

function NotesStep({ draft, update, note, setNote }: Pick<QuestionProps, 'draft' | 'update' | 'note' | 'setNote'>) {
  const { colors } = useApp();
  const lastNote = draft.notes.at(-1);
  const hint = lastNote ? NOTE_HINTS[lastNote] : undefined;
  const add = (value: string, clearInput = true) => {
    if (!value.trim()) return;
    selectionFeedback();
    update({ notes: [...draft.notes, value.trim()] });
    if (clearInput) setNote('');
  };
  return <>
    <Heading>Anything else I should know?</Heading>
    {!draft.notes.length ? <View style={[styles.choices, styles.wide]}>{NOTE_PROMPTS.map(prompt => (
      <Pressable key={prompt} accessibilityRole="button" onPress={() => add(prompt, false)}
        style={({ pressed }) => [styles.tile, { backgroundColor: colors.card, borderColor: colors.separator }, pressed && styles.pressed]}>
        <AppText style={styles.promptText}>{prompt}</AppText>
      </Pressable>
    ))}</View> : (
      <View style={[styles.thread, styles.wide]}>{draft.notes.map((text, index) => (
        <View key={`${index}-${text}`} style={[styles.bubble, { backgroundColor: colors.tintSoft }]}>
          <AppText style={styles.noteText}>{text}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove note: ${text}`}
            onPress={() => update({ notes: draft.notes.filter((_, i) => i !== index) })} style={styles.removeNote}>
            <X color={colors.textSecondary} size={15} />
          </Pressable>
        </View>
      ))}</View>
    )}
    {hint ? <AppText accessibilityLiveRegion="polite" tone="secondary" style={[styles.noteHint, styles.wide]}>{hint}</AppText> : null}
    <View style={[styles.composer, styles.wide, { backgroundColor: colors.card, borderColor: colors.separator }]}>
      <TextInput accessibilityLabel="Tell Arcel anything else" value={note} onChangeText={setNote} multiline
        placeholder="Type anything…" placeholderTextColor={colors.textTertiary}
        style={[styles.noteInput, { color: colors.text }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Add note" accessibilityState={{ disabled: !note.trim() }}
        disabled={!note.trim()} onPress={() => add(note)} style={[styles.send, { backgroundColor: colors.strong }, !note.trim() && styles.disabled]}>
        <Send color={colors.strongText} size={18} />
      </Pressable>
    </View>
    <AppText tone="secondary" style={styles.hint}>Optional. Your notes will be saved with your answers.</AppText>
    {draft.notes.includes('I have some discomfort') ? <AppText tone="secondary" style={styles.hint}>
      Sharp, worsening, or unexplained pain is a reason to stop and seek medical advice.
    </AppText> : null}
  </>;
}

function ReviewStep({ draft }: { draft: OnboardingDraft }) {
  const { colors } = useApp();
  const days = TRAINING_DAYS.filter(day => draft.trainingDays.includes(day));
  return <>
    <View style={[styles.reviewIcon, { backgroundColor: colors.tintSoft }]}><ShieldCheck color={colors.tintText} size={26} strokeWidth={1.5} /></View>
    <Heading>A little more you.</Heading>
    <AppText tone="secondary" style={styles.reviewCopy}>Your sport, your goals, and the time you have. Save these answers so Arcel has your context when you chat.</AppText>
    <Card style={styles.summary}>
      <Summary label="Sport" value={draft.sport} />
      {draft.sportGoal.trim() ? <Summary label="This season" value={draft.sportGoal.trim()} /> : null}
      <Summary label="Focus" value={BALANCE_LABELS[draft.balance]} />
      <Summary label="Your week" value={`${days.length} days · ${formatSessionDuration(draft.sessionMinutes)}\n${days.join(' · ')}`} />
      <Summary label="Setup" value={VENUE_LABELS[draft.venue]} />
      <Summary label="Recent lifting" value={`${draft.lifts14 === 6 ? '6+' : draft.lifts14} sessions in 2 weeks`} />
      {draft.notes.length ? <Summary label="Your notes" value={draft.notes.join('\n\n')} /> : null}
    </Card>
    <AppText tone="secondary" style={styles.hint}>You can update these anytime in You → Settings.</AppText>
  </>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <View style={styles.summaryRow}><AppText tone="secondary" style={styles.summaryLabel}>{label}</AppText><AppText weight="medium" style={styles.summaryValue}>{value}</AppText></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topbar: { width: '100%', maxWidth: 600, alignSelf: 'center', minHeight: 60, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topSpacer: { width: 44 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  progress: { width: 120, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 28 },
  stage: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  title: { fontSize: 30, lineHeight: 37, letterSpacing: -0.9, textAlign: 'center', marginBottom: 32 },
  choices: { width: '100%', maxWidth: 300, alignSelf: 'center', gap: 10 },
  wide: { width: '100%', maxWidth: 340, alignSelf: 'center' },
  tile: { ...shadow, minHeight: 56, borderWidth: 1, borderRadius: radius.card, paddingVertical: 16, paddingHorizontal: 32, justifyContent: 'center' },
  tileText: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  check: { position: 'absolute', right: 12, top: 19 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  days: { width: '100%', maxWidth: 340, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 },
  dayTile: { flex: 1, minWidth: 44, maxWidth: 48, minHeight: 66, paddingHorizontal: 1, paddingTop: 12, paddingBottom: 24, borderRadius: radius.segment },
  dayText: { fontSize: 12, lineHeight: 18 },
  dayCheck: { position: 'absolute', bottom: 8, alignSelf: 'center' },
  input: { width: '100%', maxWidth: 340, alignSelf: 'center', minHeight: 56, borderWidth: 1, borderRadius: radius.card, padding: 16, fontFamily: fonts.regular, fontSize: 16, lineHeight: 25 },
  textarea: { minHeight: 148, textAlignVertical: 'top' },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  balanceLabel: { textAlign: 'center', marginTop: 14, fontSize: 18 },
  hint: { fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 20, maxWidth: 340, alignSelf: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18, width: '100%', maxWidth: 520, alignSelf: 'center' },
  navLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  message: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 20 },
  welcomeBrand: { paddingHorizontal: 28, paddingTop: 28 },
  brand: { fontSize: 14, lineHeight: 20, letterSpacing: 3, textTransform: 'uppercase' },
  welcome: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 28, paddingVertical: 44, width: '100%', maxWidth: 460, alignSelf: 'center' },
  welcomeTitle: { fontSize: 46, lineHeight: 52, letterSpacing: -1.7 },
  welcomeCopy: { marginTop: 22, fontSize: 16, lineHeight: 26 },
  welcomeFooter: { width: '100%', maxWidth: 460, alignSelf: 'center', paddingHorizontal: 24, paddingBottom: 24, gap: 14 },
  footerNote: { textAlign: 'center', fontSize: 12, lineHeight: 19 },
  promptText: { fontSize: 15, lineHeight: 22 },
  thread: { gap: 12 },
  bubble: { maxWidth: '94%', alignSelf: 'flex-end', borderRadius: radius.card, borderBottomRightRadius: 4, paddingLeft: 16, paddingVertical: 12, paddingRight: 46, minHeight: 48 },
  noteText: { fontSize: 15, lineHeight: 23 },
  removeNote: { position: 'absolute', right: 0, top: 2, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  noteHint: { fontSize: 14, lineHeight: 23, marginTop: 16 },
  composer: { marginTop: 24, borderWidth: 1, borderRadius: 28, padding: 6, paddingLeft: 18, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  noteInput: { flex: 1, minWidth: 0, minHeight: 44, maxHeight: 140, paddingVertical: 10, fontFamily: fonts.regular, fontSize: 15, lineHeight: 24, textAlignVertical: 'top' },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  reviewIcon: { width: 56, height: 56, borderRadius: 28, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  reviewCopy: { textAlign: 'center', fontSize: 15, lineHeight: 24, marginTop: -12, marginBottom: 24 },
  summary: { gap: 0 },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 12 },
  summaryLabel: { width: 92, fontSize: 12, lineHeight: 20 },
  summaryValue: { flex: 1, textAlign: 'right', fontSize: 13, lineHeight: 20 },
  reviewFooter: { width: '100%', maxWidth: 460, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16, gap: 8 },
});
