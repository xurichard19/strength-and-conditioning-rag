const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, modules = {}) {
  const code = ts.transpileModule(readFileSync(resolve(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (!(name in modules)) throw new Error(`unexpected import: ${name}`);
    return modules[name];
  }, URLSearchParams, TextDecoder });
  return exports;
}
const options = load('lib/sports-workout.ts');
const calendar = load('lib/calendar.ts');
const { createBackend } = load('services/backend.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const jsx = (type, props) => ({ type, props });
const children = node => {
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
  assert.equal(options.startTimeOptions.at(-1).value, '23:30');
  assert.equal(options.durationOptions[0].value, '5');
  assert.equal(options.durationOptions.at(-1).value, '180');
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
  const good = ['2026-09-15', 'boxing', '09:00', '60', 'moderate', ''];
  for (const [index, bad] of [[0, 'bad'], [1, 'golf'], [2, '24:00'], [3, '181'], [4, 'max']]) {
    const input = [...good]; input[index] = bad;
    assert.throws(() => options.sportsWorkoutInput(...input));
  }
});

test('sports writes use the existing POST endpoint and never make calendar/planning calls or retry automatically', async () => {
  const calls = [];
  const input = options.sportsWorkoutInput('2026-09-20', 'tennis', '18:30', '90', 'hard', 'Practice');
  const api = createBackend(async (path, config) => {
    calls.push({ path, config });
    return new Response(JSON.stringify({ ...input, id: 'sport-id', user_id: 'owner', status: 'planned' }), { status: 201 });
  });
  assert.equal((await api.createSportsWorkout(input)).id, 'sport-id');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/sports-workouts');
  assert.equal(calls[0].config.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].config.body), plain(input));
  assert.equal('user_id' in JSON.parse(calls[0].config.body), false);
  let attempts = 0;
  const failed = createBackend(async () => { attempts++; return new Response('{"detail":"unavailable"}', { status: 503 }); });
  await assert.rejects(failed.createSportsWorkout(input), /unavailable/);
  assert.equal(attempts, 1);
});

function formFixture(write, date = '2026-09-20', userId = 'owner') {
  const slots = []; let cursor = 0; const calls = [];
  const screen = load('screens/sports-workout-screen.tsx', {
    react: {
      useState: initial => {
        const index = cursor++; if (!(index in slots)) slots[index] = initial;
        return [slots[index], value => { slots[index] = value; }];
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
    '@/services/api': { backendFor: owner => ({ createSportsWorkout: async input => { calls.push({ owner, input }); return write(input); } }) },
    '@/state/app-context': { useApp: () => ({ colors: {}, authSession: userId ? { user: { id: userId } } : null }) },
  });
  const expand = node => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(expand);
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  };
  const render = () => { cursor = 0; return expand(screen.default()); };
  return { calls, render,
    field: label => children(render()).find(node => node.type === 'field' && node.props.label === label).props,
    notes: () => children(render()).find(node => node.type === 'input').props,
    save: () => children(render()).find(node => node.type === 'save' && node.props.children === 'Save sports workout')?.props,
  };
}

test('form saves for the signed-in owner, blocks repeated taps, and confirms only after persistence', async () => {
  let finish;
  const form = formFixture(input => new Promise(resolve => { finish = () => resolve({ ...input, id: 'saved' }); }));
  form.field('Sport').onChange('basketball');
  form.field('Duration').onChange('180');
  form.notes().onChangeText('  Game  ');
  const submit = form.save().onPress;
  submit(); submit();
  assert.equal(form.calls.length, 1);
  assert.equal(form.calls[0].owner, 'owner');
  assert.equal(form.calls[0].input.scheduled_date, '2026-09-20');
  assert.equal(form.calls[0].input.notes, 'Game');
  assert.equal(form.calls[0].input.planned_duration_minutes, 180);
  assert.equal(form.save().loading, true);
  assert.equal(form.field('Sport').disabled, true);
  finish(); await new Promise(resolve => setImmediate(resolve));
  submit(); // Even an old callback cannot write again after success.
  assert.equal(form.calls.length, 1);
  assert.equal(form.save(), undefined);
  assert.match(JSON.stringify(form.render()), /Sports workout saved/);
});

test('failed saves keep field values, show an error, and do not claim success', async () => {
  const form = formFixture(async () => { throw new Error('offline'); });
  form.field('Sport').onChange('football');
  form.notes().onChangeText('Keep this draft');
  form.save().onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(form.save().loading, false);
  assert.equal(form.field('Sport').value, 'football');
  assert.equal(form.notes().value, 'Keep this draft');
  assert.match(JSON.stringify(form.render()), /offline/);
  assert.doesNotMatch(JSON.stringify(form.render()), /Sports workout saved/);
  assert.equal(formFixture(async () => {}, '2026-02-30').save(), undefined);
  assert.equal(formFixture(async () => {}, '2026-09-20', null).save(), undefined);
});

test('day menu opens Chat without prompting and carries the chosen date into the sports screen', () => {
  const routes = []; let closes = 0;
  const { CalendarDayActions } = load('components/calendar-day-actions.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { router: { push: target => routes.push(target) } },
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
