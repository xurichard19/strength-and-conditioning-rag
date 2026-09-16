import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load, plain, jsx, type TestValue, type TestModule, type TestNode } from './helpers.ts';
import type { SportsWorkoutInput, SportsWorkout } from '../src/services/backend';
const options = load<typeof import('../src/lib/sports-workout')>('lib/sports-workout.ts');
const calendar = load<typeof import('../src/lib/calendar')>('lib/calendar.ts');
const { createBackend } = load<typeof import('../src/services/backend')>('services/backend.ts');
const children = (node: TestValue): TestNode[] => {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(children);
  return [node, ...children(node.props.children)];
};

test('sports choices follow the requested order, times include midnight, durations stop at three hours', () => {
  assert.deepEqual(plain(options.sportOptions.map(item => item.value)), ['boxing', 'running', 'swimming', 'tennis', 'basketball', 'football']);
  assert.deepEqual(plain(options.intensityOptions.map(item => item.value)), ['easy', 'moderate', 'hard', 'variable']);
  assert.equal(options.startTimeOptions.length, 48);
  assert.deepEqual(plain(options.startTimeOptions[0]), { label: '12:00 AM', value: '00:00' });
  assert.deepEqual(plain(options.startTimeOptions[24]), { label: '12:00 PM', value: '12:00' });
  assert.equal(options.startTimeOptions.at(-1)!.value, '23:30');
  assert.equal(options.durationOptions[0].value, '5');
  assert.equal(options.durationOptions.at(-1)!.value, '180');
});

test('form serialization preserves local dates/times, trims notes, and rejects malformed inputs', () => {
  assert.deepEqual(plain(options.sportsWorkoutInput('2028-02-29', 'swimming', '00:00', '180', 'variable', '  Pool session  ')), {
    sport: 'swimming', scheduled_date: '2028-02-29', start_time: '00:00:00', planned_duration_minutes: 180,
    intensity: 'variable', notes: 'Pool session',
  });
  assert.equal(options.sportsWorkoutInput('2026-12-31', 'boxing', '23:30', '5', 'easy', ' ').notes, null);
  for (const date of [undefined, ['2026-09-15'], '2026-02-29', '2026-13-01', '2026-09-15T00:00Z', 'bad']) {
    assert.equal(options.validScheduledDate(date), false);
  }
  const good: Parameters<typeof options.sportsWorkoutInput> = ['2026-09-15', 'boxing', '09:00', '60', 'moderate', ''];
  for (const [index, bad] of [[0, 'bad'], [1, 'golf'], [2, '24:00'], [3, '181'], [4, 'max']] as const) {
    const input: typeof good = [...good]; input[index] = bad;
    assert.throws(() => options.sportsWorkoutInput(...input));
  }
});

test('sports writes use the existing POST endpoint and never make calendar/planning calls or retry automatically', async () => {
  const calls: { path: string; config?: RequestInit }[] = [];
  const input = options.sportsWorkoutInput('2026-09-20', 'tennis', '18:30', '90', 'hard', 'Practice');
  const api = createBackend(async (path, config) => {
    calls.push({ path, config });
    return new Response(JSON.stringify({ ...input, id: 'sport-id', user_id: 'owner', status: 'planned' }), { status: 201 });
  });
  assert.equal((await api.createSportsWorkout(input)).id, 'sport-id');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/sports-workouts');
  assert.equal(calls[0].config?.method, 'POST');
  const body = calls[0].config?.body;
  assert.ok(typeof body === 'string');
  assert.deepEqual(JSON.parse(body), plain(input));
  assert.equal('user_id' in JSON.parse(body), false);
  let attempts = 0;
  const failed = createBackend(async () => { attempts++; return new Response('{"detail":"unavailable"}', { status: 503 }); });
  await assert.rejects(failed.createSportsWorkout(input), /unavailable/);
  assert.equal(attempts, 1);
});

function formFixture(write: (input: SportsWorkoutInput) => Promise<unknown>, date = '2026-09-20', userId: string | null = 'owner') {
  const slots: TestValue[] = []; let cursor = 0; const calls: { owner: string; input: SportsWorkoutInput }[] = []; const invalidations: string[][] = [];
  const screen = load('screens/sports-workout-screen.tsx', {
    react: {
      useState: initial => {
        const index = cursor++; if (!(index in slots)) slots[index] = initial;
        return [slots[index], (value: TestValue) => { slots[index] = value; }];
      },
      useRef: initial => { const index = cursor++; return slots[index] ??= { current: initial }; },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-native': { View: 'view', TextInput: 'input', ScrollView: 'scroll', Pressable: 'button', KeyboardAvoidingView: 'keyboard', Keyboard: { dismiss() {} }, Platform: { OS: 'ios' }, StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { SafeAreaView: 'safe' },
    'expo-router': { router: { canGoBack: () => true, back() {} }, useLocalSearchParams: () => ({ date }) },
    'lucide-react-native': {}, '@/design/tokens': { fonts: {} },
    '@/components/ui': { AppText: 'text', Card: 'card', PrimaryButton: 'save' },
    '@/components/selection-field': { SelectionField: 'field' },
    '@/lib/calendar': calendar, '@/lib/sports-workout': options,
    '@/lib/errors': { errorMessage: (error, fallback) => error.message || fallback },
    '@/services/api': { backendFor: owner => ({ createSportsWorkout: async (input: SportsWorkoutInput) => { calls.push({ owner, input }); return write(input); } }) },
    '@/state/app-context': { useApp: () => ({ colors: {}, authSession: userId ? { user: { id: userId } } : null,
      invalidateCalendar: (...args: string[]) => invalidations.push(args) }) },
  });
  const expand = (node: TestValue): TestValue => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(expand);
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  };
  const render = () => { cursor = 0; return expand(screen.default()); };
  return { calls, render, invalidations,
    field: (label: string) => children(render()).find(node => node.type === 'field' && node.props.label === label)!.props,
    notes: () => children(render()).find(node => node.type === 'input')!.props,
    save: () => children(render()).find(node => node.type === 'save' && node.props.children === 'Save sports workout')?.props,
  };
}

test('form saves for the signed-in owner, blocks repeated taps, and confirms only after persistence', async () => {
  let finish!: () => void;
  const form = formFixture(input => new Promise(resolve => { finish = () => resolve({ ...input, id: 'saved' }); }));
  form.field('Sport').onChange('basketball');
  form.field('Duration').onChange('180');
  form.notes().onChangeText('  Game  ');
  const submit = form.save()!.onPress;
  submit(); submit();
  assert.equal(form.calls.length, 1);
  assert.equal(form.calls[0].owner, 'owner');
  assert.equal(form.calls[0].input.scheduled_date, '2026-09-20');
  assert.equal(form.calls[0].input.notes, 'Game');
  assert.equal(form.calls[0].input.planned_duration_minutes, 180);
  assert.equal(form.save()!.loading, true);
  assert.equal(form.field('Sport').disabled, true);
  finish(); await new Promise(resolve => setImmediate(resolve));
  submit(); // Even an old callback cannot write again after success.
  assert.equal(form.calls.length, 1);
  assert.equal(form.save(), undefined);
  assert.match(JSON.stringify(form.render()), /Sports workout saved/);
  assert.deepEqual(form.invalidations, [['owner', '2026-09-20', '2026-09-20']]);
  assert.doesNotMatch(JSON.stringify(form.render()), /preview calendar/);
});

test('failed saves keep field values, show an error, and do not claim success', async () => {
  const form = formFixture(async () => { throw new Error('offline'); });
  form.field('Sport').onChange('football');
  form.notes().onChangeText('Keep this draft');
  form.save()!.onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(form.save()!.loading, false);
  assert.equal(form.field('Sport').value, 'football');
  assert.equal(form.notes().value, 'Keep this draft');
  assert.match(JSON.stringify(form.render()), /offline/);
  assert.doesNotMatch(JSON.stringify(form.render()), /Sports workout saved/);
  assert.deepEqual(form.invalidations, [['owner', '2026-09-20', '2026-09-20']]);
  assert.equal(formFixture(async () => {}, '2026-02-30').save(), undefined);
  assert.equal(formFixture(async () => {}, '2026-09-20', null).save(), undefined);
});

test('day menu opens Chat without prompting and carries the chosen date into the sports screen', () => {
  const routes: TestValue[] = []; let closes = 0;
  const { CalendarDayActions } = load('components/calendar-day-actions.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { router: { push: (target: TestValue) => routes.push(target) } },
    'lucide-react-native': {}, 'react-native': { Pressable: 'button', View: 'view', StyleSheet: { create: value => value } },
    './action-sheet': { ActionSheet: 'sheet' }, './ui': { AppText: 'text' }, '@/lib/calendar': calendar,
    '@/state/app-context': { useApp: () => ({ colors: {} }) },
  });
  const menu = CalendarDayActions({ date: '2027-01-02', onClose: () => closes++ });
  const buttons = children(menu).filter(node => node.type === 'button');
  buttons[0].props.onPress(); buttons[1].props.onPress();
  assert.deepEqual(plain(routes), ['/(tabs)/chat', { pathname: '/sports-workout', params: { date: '2027-01-02' } }]);
  assert.equal(closes, 2);
});

test('sports deletion uses the owner-authenticated DELETE endpoint and never retries writes', async () => {
  const calls: { path: string; config?: RequestInit }[] = [];
  const api = createBackend(async (path, config) => {
    calls.push({ path, config });
    return new Response(JSON.stringify({ id: 'a/b', scheduled_date: '2026-09-20' }));
  });
  assert.equal((await api.deleteSportsWorkout('a/b')).id, 'a/b');
  assert.deepEqual(plain(calls), [{ path: '/sports-workouts/a%2Fb', config: { method: 'DELETE' } }]);
  let attempts = 0;
  const failed = createBackend(async () => { attempts++; return new Response('{"detail":"offline"}', { status: 503 }); });
  await assert.rejects(failed.deleteSportsWorkout('sport'), /offline/);
  assert.equal(attempts, 1);
});

function detailFixture(write: () => Promise<unknown>, fields: TestModule = {}) {
  const slots: TestValue[] = []; let cursor = 0; let closes = 0; const cleanups: (() => void)[] = [];
  const calls: { owner: string; id: string }[] = []; const invalidations: string[][] = [];
  const session = { id: 'sport', kind: 'sport', date: '2026-09-20', title: 'Boxing', status: 'planned',
    startTime: '18:30:00', minutes: 60, intensity: 'moderate', notes: 'Technique\nBring wraps', ...fields };
  const { SportsWorkoutDetails } = load('components/sports-workout-details.tsx', {
    react: {
      useState: initial => {
        const i = cursor++; if (!(i in slots)) slots[i] = initial;
        return [slots[i], (value: TestValue) => { slots[i] = value; }];
      },
      useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial }; },
      useEffect: fn => { const i = cursor++; if (!(i in slots)) { slots[i] = true; cleanups.push(fn()); } },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react-native': { Ellipsis: 'icon' },
    'react-native': { View: 'view', Pressable: 'button', ScrollView: 'scroll', StyleSheet: { create: value => value } },
    './action-sheet': { ActionSheet: 'sheet' }, './ui': { AppText: 'text', OutlineButton: 'outline' },
    '@/lib/calendar': calendar, '@/lib/errors': { errorMessage: error => error.message },
    '@/services/api': { backendFor: owner => ({ deleteSportsWorkout: async (id: string) => { calls.push({ owner, id }); return write(); } }) },
    '@/state/app-context': { useApp: () => ({ colors: {}, invalidateCalendar: (...args: string[]) => invalidations.push(args) }) },
  });
  const expand = (node: TestValue): TestValue => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(expand);
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  };
  const render = () => { cursor = 0; return expand(SportsWorkoutDetails({ session, userId: 'owner', onClose: () => closes++ })); };
  const button = (label: string) => children(render()).find(node => node.type === 'outline' && node.props.children === label)?.props;
  const options = () => render().props.headerAction.props.onPress();
  return { render, button, options, calls, invalidations, unmount: () => cleanups.forEach(fn => fn?.()), get closes() { return closes; } };
}

test('details show all cached sports fields and full notes without requests, including empty optionals', () => {
  const f = detailFixture(async () => {});
  const text = JSON.stringify(f.render());
  for (const value of ['Boxing', 'Sunday, September 20, 2026', '6:30 PM', '60 minutes', 'Moderate', 'Planned', 'Bring wraps']) assert.ok(text.includes(value), value);
  assert.equal(f.calls.length, 0);
  const empty = JSON.stringify(detailFixture(async () => {}, { notes: null, startTime: null, minutes: null, intensity: null }).render());
  assert.match(empty, /Not set/); assert.match(empty, /No notes added/);
  assert.doesNotMatch(empty, /undefined|NaN/);
});

test('delete requires confirmation, blocks duplicate taps/dismissal, and invalidates only after the write settles', async () => {
  let finish!: (row: Pick<SportsWorkout, 'scheduled_date'>) => void;
  const f = detailFixture(() => new Promise(resolve => { finish = resolve; }));
  f.options(); f.button('Delete workout')!.onPress();
  assert.equal(f.render().props.title, 'Delete sports workout?'); assert.equal(f.calls.length, 0);
  f.button('Cancel')!.onPress(); assert.ok(f.render().props.headerAction);
  f.options(); f.button('Delete workout')!.onPress();
  const confirm = f.button('Delete workout')!.onPress;
  confirm(); confirm(); f.render().props.onClose();
  assert.equal(f.button('Deleting…')!.disabled, true);
  assert.equal(f.closes, 0); assert.deepEqual(f.invalidations, []);
  assert.deepEqual(f.calls, [{ owner: 'owner', id: 'sport' }]);
  finish({ scheduled_date: '2026-09-20' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.closes, 1);
  assert.deepEqual(f.invalidations, [['owner', '2026-09-20', '2026-09-20']]);
  confirm(); assert.equal(f.calls.length, 1);
});

test('failed deletion keeps a retryable confirmation and invalidates an uncertain result', async () => {
  const f = detailFixture(async () => { throw new Error('offline'); });
  f.options(); f.button('Delete workout')!.onPress(); f.button('Delete workout')!.onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(JSON.stringify(f.render()), /offline/);
  assert.equal(f.closes, 0); assert.equal(f.button('Delete workout')!.disabled, false);
  assert.deepEqual(f.invalidations, [['owner', '2026-09-20', '2026-09-20']]);
});

test('late deletion cannot dismiss a replacement screen and revalidates both dates if a workout moved', async () => {
  let finish!: (row: Pick<SportsWorkout, 'scheduled_date'>) => void;
  const f = detailFixture(() => new Promise(resolve => { finish = resolve; }));
  f.options(); f.button('Delete workout')!.onPress(); f.button('Delete workout')!.onPress();
  f.unmount(); finish({ scheduled_date: '2026-09-21' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.closes, 0);
  assert.deepEqual(f.invalidations, [['owner', '2026-09-21', '2026-09-21'], ['owner', '2026-09-20', '2026-09-20']]);
});
