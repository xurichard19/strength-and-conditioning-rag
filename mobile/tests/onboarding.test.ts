import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Profile } from '../src/domain/types';
import type { Answers } from '../src/services/backend';
import { jsx, load, plain, type Stubs, type TestNode, type TestValue } from './helpers.ts';

const backend = load<typeof import('../src/services/backend')>('services/backend.ts');
const sportsWorkout = load<typeof import('../src/lib/sports-workout')>('lib/sports-workout.ts');
const sessionDuration = load<typeof import('../src/lib/session-duration')>('lib/session-duration.ts');
const onboarding = load<typeof import('../src/lib/onboarding')>('lib/onboarding.ts', {
  '../services/backend': backend, './sports-workout': sportsWorkout, './session-duration': sessionDuration,
});
const profile: Profile = {
  displayName: 'Ada', goal: 'Mostly strength', experienceLevel: 'experienced',
  trainingDays: ['Mon', 'Wed', 'Fri'], daysPerWeek: 3, sessionMinutes: 60,
  equipment: 'Dumbbells', cardio: 'Bike', theme: 'dark', onboardingComplete: false,
};

test('legacy completion remains valid without a version or a database write', () => {
  const answers = { goal: 'Mostly strength', note: 'Travel on Fridays', pain: 'Nothing current' };
  const restored = backend.profileFromApi({ id: 'athlete', display_name: 'Ada', timezone: 'UTC' },
    { answers, completed_at: '2026-09-01T12:00:00Z' }, profile);
  assert.equal(restored.onboardingComplete, true);
  const draft = onboarding.onboardingDraft(restored, answers);
  assert.equal(draft.balance, 'lifting');
  assert.equal(draft.venue, 'dumbbells');
  assert.equal(draft.lifts14, null, 'do not invent an exact count from old experience bands');
  assert.deepEqual(plain(draft.notes), ['Travel on Fridays']);
  assert.equal('onboardingVersion' in answers, false);
});

test('v2 saves the actual questions, typed notes, and a consistent profile that round trips', () => {
  const draft = { ...onboarding.onboardingDraft(profile, {}), sport: '  Tennis  ', sportGoal: ' Last the whole match ',
    balance: 'cardio' as const, venue: 'home' as const, lifts14: 0,
    trainingDays: ['Sat', 'Tue', 'Tue'], sessionMinutes: 75, notes: [' My week is unpredictable '] };
  const result = onboarding.onboardingSubmission(profile, draft, '  Weekends are easier  ');
  assert.equal(result.answers.onboardingVersion, 2);
  assert.equal(result.answers.sport, 'Tennis');
  assert.equal(result.answers.sportGoal, 'Last the whole match');
  assert.deepEqual(plain(result.answers.notes), ['My week is unpredictable', 'Weekends are easier']);
  assert.deepEqual(plain(result.answers.trainingDays), ['Tue', 'Sat']);
  assert.equal(result.answers.daysPerWeek, 2);
  assert.equal(result.profile.equipment, 'Home setup');
  assert.equal(result.profile.experienceLevel, 'new');
  for (const key of ['pushups', 'runCapacity', 'pain', 'displayName', 'theme', 'onboardingComplete']) assert.equal(key in result.answers, false);
  const restored = backend.profileFromApi({ id: 'athlete', display_name: 'Ada', timezone: 'UTC' },
    { answers: result.answers, completed_at: '2026-10-01T12:00:00Z' }, profile);
  assert.deepEqual(plain(restored), { ...plain(result.profile), onboardingComplete: true });
  const reopened = onboarding.onboardingDraft(restored, result.answers);
  assert.equal(reopened.lifts14, 0);
  assert.equal(reopened.sport, 'Tennis');
  assert.equal(reopened.venue, 'home');
  assert.deepEqual(plain(reopened.notes), plain(result.answers.notes));
});

test('required choices are checked while goals and notes remain optional', () => {
  const draft = onboarding.onboardingDraft(profile, {});
  assert.ok(onboarding.questionError('sport', draft));
  assert.ok(onboarding.questionError('sport', { ...draft, sport: 'Cycling' }));
  assert.ok(onboarding.questionError('trainingDays', { ...draft, trainingDays: [] }));
  assert.ok(onboarding.questionError('lifts14', { ...draft, lifts14: null }));
  assert.equal(onboarding.questionError('lifts14', { ...draft, lifts14: 0 }), null);
  assert.equal(onboarding.questionError('sportGoal', draft), null);
  assert.equal(onboarding.questionError('notes', draft), null);
});

test('all durations keep their saved value and readable label when reopened', () => {
  const durations = [
    [15, '15 min'], [20, '20 min'], [25, '25 min'], [30, '30 min'], [35, '35 min'],
    [40, '40 min'], [45, '45 min'], [50, '50 min'], [55, '55 min'], [60, '1 hour'],
    [75, '1 hour 15 min'], [90, '1 hour 30 min'], [105, '1 hour 45 min'], [120, '2 hours+'],
  ] as const;
  for (const [minutes, label] of durations) {
    const draft = { ...onboarding.onboardingDraft(profile, {}), sessionMinutes: minutes };
    const saved = onboarding.onboardingSubmission(profile, draft);
    const restored = backend.profileFromApi({ id: 'athlete', display_name: 'Ada', timezone: 'UTC' },
      { answers: saved.answers, completed_at: '2026-10-01T12:00:00Z' }, profile);
    const reopened = onboarding.onboardingDraft(restored, saved.answers);
    assert.equal(saved.answers.sessionMinutes, minutes);
    assert.equal(reopened.sessionMinutes, minutes);
    assert.equal(sessionDuration.formatSessionDuration(reopened.sessionMinutes), label);
  }
  const legacyProfile = { ...profile, sessionMinutes: 20, onboardingComplete: true };
  assert.equal(onboarding.onboardingDraft(legacyProfile, {}).sessionMinutes, 20);
  assert.equal(legacyProfile.sessionMinutes, 20, 'opening the new wheel must not alter the saved legacy profile');
});

test('native duration wheel snaps swipes, bounds both ends, and supports accessibility adjustments', () => {
  const refs: TestValue[] = [];
  let cursor = 0;
  let minutes = 45;
  const { DurationWheel } = load('components/duration-wheel.tsx', {
    react: { useRef: initial => refs[cursor++] ??= { current: initial }, useState: initial => [initial()], useEffect: effect => effect() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Pressable: 'button', ScrollView: 'scroll', View: 'view', StyleSheet: { create: value => value } },
    '@/components/ui': { AppText: 'text' },
    '@/design/tokens': { radius: {} },
    '@/state/app-context': { useApp: () => ({ colors: {} }) },
    '@/lib/session-duration': { ...sessionDuration, SESSION_DURATIONS: [...sessionDuration.SESSION_DURATIONS] },
  });
  const render = () => { cursor = 0; return DurationWheel({ minutes, onChange: (value: number) => { minutes = value; } }); };
  const wheel = () => render().props.children.find((node: TestNode) => node.type === 'scroll');
  const offsets: number[] = [];
  wheel().props.ref.current = { scrollTo: ({ y }: { y: number }) => offsets.push(y) };
  const swipe = (offset: number) => wheel().props.onScroll({ nativeEvent: { contentOffset: { y: offset } } });
  swipe(-100); assert.equal(minutes, 15);
  for (const value of [20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 105, 120, 120]) {
    render().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
    assert.equal(minutes, value);
  }
  assert.equal(render().props.accessibilityValue.text, '2 hours+');
  swipe(90); assert.equal(minutes, 25, 'a partial swipe rounds to the nearest centered option');
  swipe(8 * 52); assert.equal(minutes, 55);
  swipe(9 * 52); assert.equal(minutes, 60);
  swipe(10 * 52); assert.equal(minutes, 75);
  swipe(1000); assert.equal(minutes, 120);
  for (const value of [105, 90, 75, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 15]) {
    render().props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } });
    assert.equal(minutes, value);
  }
  assert.equal(offsets.at(-1), 0);
});

test('all five balance positions retain their distinct intent after saving and reopening', () => {
  const positions = [
    [0, 'only-lifting', 'Only lifting'], [25, 'lifting', 'Mostly lifting'], [50, 'both', 'An even mix'],
    [75, 'cardio', 'Mostly cardio'], [100, 'only-cardio', 'Only cardio'],
  ] as const;
  for (const [position, balance, label] of positions) {
    const draft = { ...onboarding.onboardingDraft(profile, {}), balance };
    const saved = onboarding.onboardingSubmission(profile, draft);
    const restored = backend.profileFromApi({ id: 'athlete', display_name: 'Ada', timezone: 'UTC' },
      { answers: saved.answers, completed_at: '2026-10-01T12:00:00Z' }, profile);
    const reopened = onboarding.onboardingDraft(restored, saved.answers);
    assert.equal(reopened.balance, balance);
    assert.equal(onboarding.balanceValue(reopened.balance), position);
    assert.equal(onboarding.BALANCE_LABELS[reopened.balance], label);
    assert.equal(onboarding.onboardingDraft(restored, {}).balance, balance);
  }
  assert.equal(onboarding.balanceValue(onboarding.onboardingDraft(profile, { balance: 'lifting' }).balance), 25);
  assert.equal(onboarding.balanceValue(onboarding.onboardingDraft(profile, { balance: 'cardio' }).balance), 75);
});

test('native slider reaches both ends by touch and steps through every position with accessibility actions', () => {
  let width = 0;
  let balance: import('../src/lib/onboarding').Balance = 'both';
  const { BalanceSlider } = load('components/balance-slider.tsx', {
    react: { useState: () => [width, (value: number) => { width = value; }] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'view', StyleSheet: { create: value => value } },
    '@/state/app-context': { useApp: () => ({ colors: {} }) },
    '@/lib/onboarding': { ...onboarding, TRAINING_DAYS: [...onboarding.TRAINING_DAYS], SPORTS: [...onboarding.SPORTS], QUESTION_IDS: [...onboarding.QUESTION_IDS] },
  });
  const render = () => BalanceSlider({ balance, onChange: (value: typeof balance) => { balance = value; } });
  render().props.onLayout({ nativeEvent: { layout: { width: 340 } } });
  render().props.onResponderGrant({ nativeEvent: { locationX: 0 } });
  assert.equal(balance, 'only-lifting');
  assert.equal(render().props.accessibilityValue.now, 0);
  for (const position of [25, 50, 75, 100, 100]) {
    render().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
    assert.equal(render().props.accessibilityValue.now, position);
  }
  for (const position of [75, 50, 25, 0, 0]) {
    render().props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } });
    assert.equal(render().props.accessibilityValue.now, position);
  }
  render().props.onResponderMove({ nativeEvent: { locationX: 340 } });
  assert.equal(balance, 'only-cardio');
  render().props.onResponderMove({ nativeEvent: { locationX: 16 + 308 * 0.25 } });
  assert.equal(balance, 'lifting');
  render().props.onResponderMove({ nativeEvent: { locationX: 16 + 308 * 0.75 } });
  assert.equal(balance, 'cardio');
});

function fixture(editing = false, savedAnswers: Answers = {}) {
  const slots: TestValue[] = [];
  let cursor = 0;
  const paths: string[] = [];
  const saves: { profile: Profile; answers: Answers }[] = [];
  let complete!: (success: boolean) => void;
  const state = {
    accountReady: true, colors: {}, colorScheme: 'dark', notice: null as string | null,
    profile: { ...profile, onboardingComplete: editing }, onboardingAnswers: savedAnswers,
    finishOnboarding: (nextProfile: Profile, answers: Answers) => {
      saves.push({ profile: nextProfile, answers });
      return new Promise<boolean>(resolve => { complete = resolve; });
    },
  };
  const transition = { duration: () => ({ reduceMotion: () => undefined }) };
  const modules = {
    react: {
      useState: initial => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [slots[index], (value: TestValue) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
      },
      useRef: initial => { const index = cursor++; return slots[index] ??= { current: initial }; },
      useEffect: effect => effect(),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'expo-router': { router: { replace: (path: string) => paths.push(path) }, useLocalSearchParams: () => editing ? { edit: '1' } : {} },
    'expo-haptics': {},
    'lucide-react-native': { Check: 'check', ChevronLeft: 'left', ChevronRight: 'right', Send: 'send', ShieldCheck: 'shield', X: 'x' },
    'react-native': { ActivityIndicator: 'spinner', Keyboard: { dismiss: () => {} }, KeyboardAvoidingView: 'keyboard', Platform: { OS: 'web' },
      Pressable: 'button', ScrollView: 'scroll', TextInput: 'input', View: 'view', StyleSheet: { create: styles => styles } },
    'react-native-reanimated': { default: { View: 'animated' }, __esModule: true, FadeInLeft: transition, FadeInRight: transition, ReduceMotion: { System: 'system' } },
    'react-native-safe-area-context': { SafeAreaView: 'safe' },
    '@/components/balance-slider': { BalanceSlider: 'slider' },
    '@/components/duration-wheel': { DurationWheel: 'duration-wheel' },
    '@/components/ui': { AppText: 'text', Card: 'card', PrimaryButton: 'primary', SecondaryButton: 'secondary' },
    '@/design/tokens': { fonts: {}, radius: {}, shadow: {} },
    '@/lib/onboarding': { ...onboarding, TRAINING_DAYS: [...onboarding.TRAINING_DAYS], SPORTS: [...onboarding.SPORTS], QUESTION_IDS: [...onboarding.QUESTION_IDS] },
    '@/lib/session-duration': { ...sessionDuration, SESSION_DURATIONS: [...sessionDuration.SESSION_DURATIONS] },
    '@/state/app-context': { useApp: () => state },
  } satisfies Stubs;
  const { default: Screen } = load('screens/onboarding-screen.tsx', modules);
  function expand(node: TestValue): TestNode[] {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(expand);
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return [node, ...expand(node.props?.children)];
  }
  const render = () => { cursor = 0; return expand(Screen()); };
  const button = (label: string) => {
    const result = render().find(node => ['button', 'primary', 'secondary'].includes(node.type)
      && (node.props.accessibilityLabel === label || expand(node).some(child => child.type === 'text' && child.props.children === label) || node.props.children === label));
    assert.ok(result, `missing button: ${label}`);
    return result;
  };
  const press = (label: string) => button(label).props.onPress();
  const input = (label: string, text: string) => render().find(node => node.type === 'input' && node.props.accessibilityLabel === label)!.props.onChangeText(text);
  const text = (value: string) => render().some(node => node.type === 'text' && node.props.children === value);
  function toNotes() {
    press(editing ? 'Update my answers' : 'Let’s get started');
    press('Tennis'); press('Next'); press('Next'); press('Next'); press('Next'); press('Next'); press('Next');
    press('0'); press('Next');
  }
  return { render, press, button, input, text, toNotes, paths, saves, state, complete: (success: boolean) => complete(success) };
}

test('question flow uses the workout sports, keeps manual navigation, and retains answers on Back', () => {
  const f = fixture();
  f.press('Let’s get started');
  f.press('Next');
  assert.ok(f.text('Choose a sport to continue.'));
  assert.deepEqual(f.render().filter(node => node.props.accessibilityRole === 'radio').map(node => node.props.accessibilityLabel),
    plain(sportsWorkout.sportOptions.map(option => option.label)));
  f.press('Boxing');
  assert.equal(f.button('Boxing').props.accessibilityState.checked, true);
  f.press('Next'); f.input('Goals for your sport', 'First competition'); f.press('Back');
  assert.equal(f.button('Boxing').props.accessibilityState.checked, true);
  f.press('Next');
  assert.equal(f.render().find(node => node.type === 'input')?.props.value, 'First competition');
  assert.equal(f.saves.length, 0);
});

test('duration wheel choice survives navigation and is shown in hours before saving', async () => {
  const f = fixture();
  f.press('Let’s get started'); f.press('Tennis');
  f.press('Next'); f.press('Next'); f.press('Next'); f.press('Next');
  const wheel = () => f.render().find(node => node.type === 'duration-wheel')!;
  wheel().props.onChange(105);
  f.press('Next'); f.press('Back');
  assert.equal(wheel().props.minutes, 105);
  f.press('Next'); f.press('Next'); f.press('0'); f.press('Next'); f.press('Review answers');
  assert.ok(f.text('3 days · 1 hour 45 min\nMon · Wed · Fri'));
  f.press('Save and open chat'); f.complete(true); await new Promise(setImmediate);
  assert.equal(f.saves[0].answers.sessionMinutes, 105);
});

test('notes and unsent text survive review and save once; a failed save can be retried', async () => {
  const f = fixture(); f.toNotes();
  f.input('Tell Arcel anything else', ' Shoulder discomfort overhead ');
  f.press('I have some discomfort');
  assert.ok(f.text('Where do you feel it, and which movements bring it on?'));
  assert.equal(f.render().find(node => node.type === 'input')?.props.value, ' Shoulder discomfort overhead ');
  f.press('Review answers'); f.press('Back to my answers');
  assert.ok(f.text('Shoulder discomfort overhead'));
  f.press('Review answers');
  const save = f.button('Save and open chat').props.onPress;
  save(); save();
  assert.equal(f.saves.length, 1);
  assert.deepEqual(plain(f.saves[0].answers.notes), ['I have some discomfort', 'Shoulder discomfort overhead']);
  assert.equal(f.saves[0].answers.onboardingVersion, 2);
  assert.equal(f.saves[0].answers.lifts14, 0);
  f.state.notice = 'Unable to save'; f.complete(false); await new Promise(setImmediate);
  assert.ok(f.text('Unable to save'));
  assert.deepEqual(f.paths, []);
  f.press('Save and open chat'); f.complete(true); await new Promise(setImmediate);
  assert.deepEqual(f.paths, ['/(tabs)/chat']);
});

test('redo may be cancelled without changing saved answers, and successful redo returns to Settings', async () => {
  const cancelled = fixture(true, { note: 'Old note' });
  cancelled.press('Update my answers'); cancelled.press('Close onboarding without saving');
  assert.deepEqual(cancelled.paths, ['/(tabs)/you']);
  assert.equal(cancelled.saves.length, 0);
  assert.deepEqual(cancelled.state.onboardingAnswers, { note: 'Old note' });
  const f = fixture(true, { note: 'Old note' }); f.toNotes();
  assert.ok(f.text('Old note'));
  f.press('Review answers'); f.press('Save changes'); f.complete(true); await new Promise(setImmediate);
  assert.deepEqual(f.paths, ['/(tabs)/you']);
  assert.equal(f.saves[0].answers.onboardingVersion, 2);
});

test('completed users are not forced into v2 and slow account hydration initializes the saved answers', () => {
  const f = fixture();
  f.state.profile.onboardingComplete = true;
  f.render();
  assert.deepEqual(f.paths, ['/(tabs)/today']);
  const delayed = fixture(true, { sport: 'Tennis' });
  delayed.state.accountReady = false;
  assert.ok(delayed.render().some(node => node.type === 'spinner'));
  delayed.state.onboardingAnswers = { sport: 'Swimming', lifts14: 0 };
  delayed.state.accountReady = true;
  delayed.press('Update my answers');
  assert.equal(delayed.button('Swimming').props.accessibilityState.checked, true);
});
