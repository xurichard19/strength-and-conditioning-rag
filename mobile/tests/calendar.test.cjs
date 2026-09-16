const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the real date helpers and screen callbacks without credentials or native UI.
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
const calendar = load('lib/calendar.ts');
const { createCalendarCache } = load('state/calendar-cache.ts', {
  '../lib/calendar': calendar, './memory-cache': load('state/memory-cache.ts'),
});
const { createBackend } = load('services/backend.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const empty = () => ({ workouts: [], sports_workouts: [], revision: null });
const workout = (id, date, fields = {}) => ({ id, scheduled_date: date, name: id, status: 'planned', notes: null, superseded_at: null, exercises: [], ...fields });
const sports = (id, date, fields = {}) => ({ id, scheduled_date: date, sport: 'boxing', status: 'planned', notes: null,
  start_time: null, planned_duration_minutes: null, intensity: null, ...fields });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('month grid includes leap days, all six rows, and adjacent months in order', () => {
  const cells = calendar.monthDates('2028-02-29');
  assert.equal(cells.length, 42);
  assert.deepEqual(plain(cells[0]), { date: '2028-01-30', inMonth: false });
  assert.equal(cells.filter(cell => cell.inMonth).length, 29);
  assert.equal(cells.at(-1).date, '2028-03-11');
  assert.equal(new Set(cells.map(cell => cell.date)).size, 42);
  for (let i = 1; i < cells.length; i++) assert.equal(cells[i].date, calendar.shiftDays(cells[i - 1].date, 1));
  assert.equal(calendar.monthDates('2026-05-15').filter(cell => cell.inMonth).length, 31);
  assert.equal(calendar.monthDates('2100-02-15').filter(cell => cell.inMonth).length, 28);
});

test('week and month navigation handle year boundaries and clamp short months', () => {
  assert.equal(calendar.shiftMonth('2026-01-31', 1), '2026-02-28');
  assert.equal(calendar.shiftMonth('2028-01-31', 1), '2028-02-29');
  assert.equal(calendar.shiftMonth('2026-12-15', 1), '2027-01-15');
  assert.equal(calendar.shiftMonth('2026-01-15', -1), '2025-12-15');
  assert.deepEqual(plain(calendar.weekDates('2027-01-01')), [
    '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02',
  ]);
});

test('local date arithmetic stays on the intended days across DST and extreme timezones', () => {
  const original = process.env.TZ;
  try {
    for (const zone of ['America/New_York', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      process.env.TZ = zone;
      assert.equal(calendar.shiftDays('2026-03-07', 1), '2026-03-08', zone);
      assert.equal(calendar.shiftDays('2026-03-08', 1), '2026-03-09', zone);
      assert.equal(calendar.shiftDays('2026-11-01', -1), '2026-10-31', zone);
      assert.equal(calendar.monthDates('2026-03-15')[0].date, '2026-03-01', zone);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

function fixture(sessions = [], state = {}) {
  const today = '2026-01-31';
  const slots = []; let cursor = 0; const routes = []; const ranges = [];
  const jsx = (type, props) => ({ type, props });
  const refresh = async () => {};
  const colors = load('design/tokens.ts').palettes.dark;
  const { default: Screen } = load('screens/week-screen.tsx', {
    react: {
      useState: initial => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], value => { slots[index] = value; }];
      },
      useMemo: fn => fn(),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-native': { View: 'view', Pressable: 'button', ScrollView: 'scroll', StyleSheet: { create: value => value } },
    'expo-router': { router: { push: path => routes.push(path) } },
    'lucide-react-native': { Check: 'check', ChevronLeft: 'left', ChevronRight: 'right', Clock3: 'clock' },
    '@/components/ui': { AppText: 'text', Card: 'card', Screen: 'screen', SectionTitle: 'heading', SecondaryButton: 'retry' },
    '@/components/calendar-day-actions': { CalendarDayActions: 'day-actions' },
    '@/components/sports-workout-details': { SportsWorkoutDetails: 'sport-details' },
    '@/lib/calendar': calendar,
    '@/lib/dates': { todayIso: () => today, isToday: date => date === today, formatDay: date => calendar.calendarLabel(date, { weekday: 'short' }) },
    '@/state/app-context': { useApp: () => ({ sessions, colors, authSession: { user: { id: 'owner' } }, block: { week: 3, of: 8, name: 'Strength' }, refreshPreview: refresh }) },
    '@/state/use-calendar-range': { useCalendarRange: (start, end) => {
      ranges.push([start, end]);
      return { data: { entries: sessions.filter(row => row.date >= start && row.date <= end), revision: null }, loading: false, error: null, refresh, ...state };
    } },
  });
  const expand = node => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(expand);
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  };
  const render = () => { cursor = 0; return expand(Screen()); };
  const nodes = node => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props.children)];
  };
  const find = label => nodes(render()).find(node => node.props.accessibilityLabel === label);
  return { render, refresh, routes, ranges, find,
    menu: () => nodes(render()).find(node => node.type === 'day-actions'),
    details: () => nodes(render()).find(node => node.type === 'sport-details'),
    click: label => { const node = find(label); assert.ok(node, `missing control: ${label}`); node.props.onPress(); },
    text: () => JSON.stringify(render()),
    days: () => nodes(render()).filter(node => node.props.accessibilityLabel?.includes(', 2026.')),
  };
}

test('week/month switching preserves selection, month navigation and Today work with no workouts', () => {
  const screen = fixture();
  assert.equal(screen.render().props.onRefresh, screen.refresh);
  assert.equal(screen.find('Week view').props['aria-selected'], true);
  screen.click('Month view');
  assert.match(screen.text(), /January 2026/);
  assert.match(screen.text(), /No workouts planned for this day/);
  screen.click('Next month');
  assert.match(screen.text(), /February 2026/);
  assert.equal(screen.find('Saturday, February 28, 2026. No workouts planned').props.accessibilityState.selected, true);
  screen.click('Week view');
  assert.equal(screen.find('Saturday, February 28, 2026. No workouts planned').props.accessibilityState.selected, true);
  screen.click('Next week');
  assert.equal(screen.find('Saturday, March 7, 2026. No workouts planned').props.accessibilityState.selected, true);
  screen.click('Month view');
  assert.match(screen.text(), /March 2026/);
  screen.click('Go to today');
  assert.match(screen.text(), /January 2026/);
  screen.click('Previous month');
  assert.match(screen.text(), /December 2025/);
});

test('sports cards open cached details in week/month without navigating to mock workouts', () => {
  const session = { id: 'sport', kind: 'sport', date: '2026-01-31', title: 'Boxing', status: 'planned', notes: 'All notes' };
  const screen = fixture([session, { ...session, id: 'generated', kind: 'workout', title: 'Strength' }]);
  assert.equal(screen.details(), undefined);
  for (const view of ['Week view', 'Month view']) {
    screen.click(view);
    screen.click('View Boxing workout');
    assert.equal(screen.details().props.session, session);
    assert.equal(screen.details().props.userId, 'owner');
    screen.details().props.onClose();
    assert.equal(screen.details(), undefined);
    assert.equal(screen.find('View Strength workout'), undefined);
  }
  screen.click('Week view'); screen.click('Sat: Boxing');
  assert.equal(screen.details().props.session, session);
  assert.equal(screen.routes.length, 0);
});

test('sports start times display midnight/noon and saved minutes without timezone conversion', () => {
  assert.equal(calendar.calendarTime('00:00:00'), '12:00 AM');
  assert.equal(calendar.calendarTime('12:00:00'), '12:00 PM');
  assert.equal(calendar.calendarTime('23:45:00'), '11:45 PM');
  assert.equal(calendar.calendarTime(null), null);
});

test('holding a date opens that day’s actions in week and month views, with an accessible alternative', () => {
  const screen = fixture();
  const day = screen.find('Friday, January 30, 2026. No workouts planned');
  assert.equal(day.props.delayLongPress, 450);
  day.props.onLongPress();
  assert.equal(screen.menu().props.date, '2026-01-30');
  screen.menu().props.onClose();
  assert.equal(screen.menu(), undefined);
  screen.click('Month view');
  screen.find('Sunday, February 1, 2026. Workouts not loaded').props.onAccessibilityAction({ nativeEvent: { actionName: 'longpress' } });
  assert.equal(screen.menu().props.date, '2026-02-01');
  screen.menu().props.onClose();
  screen.click('Options for selected day');
  assert.equal(screen.menu().props.date, '2026-02-01');
  assert.equal(screen.routes.length, 0);
});

test('multiple same-day sessions appear in the agenda and adjacent-month selection follows the date', () => {
  const sessions = ['Strength session', 'Evening run'].map((title, index) => ({
    id: `session-${index}`, title, date: '2026-01-31', kind: index ? 'sport' : 'workout',
    minutes: index ? 30 : null, startTime: index ? '18:30:00' : null, intensity: index ? 'easy' : null,
    status: 'planned', notes: null, exerciseCount: 2,
  }));
  const screen = fixture(sessions);
  screen.click('Month view');
  const day = screen.find('Saturday, January 31, 2026, today. Strength session, planned; Evening run, planned');
  assert.equal(day.props.accessibilityState.selected, true);
  assert.match(screen.text(), /Strength session/);
  assert.match(screen.text(), /Evening run/);
  assert.match(screen.text(), /6:30 PM · 30 min · Easy/);
  screen.click('Sunday, February 1, 2026. Workouts not loaded');
  assert.match(screen.text(), /February 2026/);
  assert.equal(screen.find('Sunday, February 1, 2026. No workouts planned').props.accessibilityState.selected, true);
  assert.match(screen.text(), /No workouts planned for this day/);
  assert.equal(screen.routes.length, 0); // Selecting a date never starts a workout or a plan.
  screen.click('Go to today');
  screen.click('Week view');
  screen.click('Sat: Evening run');
  assert.deepEqual(screen.routes, []); // Saved rows must never open the mock session tracker.
});

test('screen requests only its week/month and distinguishes loading, errors, and actual empty results', () => {
  const screen = fixture();
  assert.equal(screen.render().props.preview, false);
  assert.deepEqual(screen.ranges.at(-1), ['2026-01-25', '2026-01-31']);
  screen.click('Month view'); screen.render();
  assert.deepEqual(screen.ranges.at(-1), ['2026-01-01', '2026-01-31']);
  const loading = fixture([], { data: undefined, loading: true });
  assert.match(loading.text(), /Loading calendar/);
  assert.doesNotMatch(loading.text(), /No workouts planned/);
  const failed = fixture([], { data: undefined, error: 'offline' });
  assert.match(failed.text(), /offline/);
  assert.match(failed.text(), /Retry calendar/);
  assert.doesNotMatch(failed.text(), /No workouts planned/);
  assert.match(fixture([], { error: 'offline' }).text(), /Showing the last loaded calendar/);
});

test('range helper requests local calendar months within the backend limit, including leap years and DST', () => {
  for (const [date, start, end] of [
    ['2028-02-29', '2028-02-01', '2028-02-29'], ['2100-02-15', '2100-02-01', '2100-02-28'],
    ['2026-03-15', '2026-03-01', '2026-03-31'], ['2026-12-31', '2026-12-01', '2026-12-31'],
  ]) assert.deepEqual(plain(calendar.calendarRange(date, 'month')), [start, end]);
  assert.deepEqual(plain(calendar.calendarRange('2027-01-01', 'week')), ['2026-12-27', '2027-01-02']);
});

test('calendar GET uses inclusive range parameters, preserves empty responses, and retries only one 409', async () => {
  const paths = [];
  const api = createBackend(async (path, config) => {
    assert.equal(config, undefined);
    paths.push(path);
    return new Response(JSON.stringify(paths.length === 1 ? { detail: 'changed' } : empty()), { status: paths.length === 1 ? 409 : 200 });
  });
  assert.deepEqual(await api.getCalendarRange('2026-12-27', '2027-01-02'), empty());
  assert.deepEqual(paths, Array(2).fill('/calendar?start_date=2026-12-27&end_date=2027-01-02'));
  for (const status of [401, 409, 500]) {
    let calls = 0;
    const failing = createBackend(async () => { calls++; return new Response('{"detail":"failed"}', { status }); });
    await assert.rejects(failing.getCalendarRange('2026-01-01', '2026-01-31'), /failed/);
    assert.equal(calls, status === 409 ? 2 : 1);
  }
});

test('calendar summaries combine both types without mock fields or retained nested exercise data', () => {
  const result = calendar.calendarSnapshot({ revision: 3,
    workouts: [workout('lift', '2026-01-02', { exercises: [{ id: 'exercise', name: 'Squat', sets: [{ planned_reps: 5 }] }] }),
      workout('old', '2026-01-02', { superseded_at: '2026-01-01T00:00:00Z' })],
    sports_workouts: [sports('late', '2026-01-02', { start_time: '18:30:00' }), sports('early', '2026-01-01'),
      sports('cancelled', '2026-01-01', { status: 'cancelled' })],
  });
  assert.equal(result.revision, 3);
  assert.deepEqual(plain(result.entries.map(row => row.id)), ['early', 'lift', 'late']);
  assert.equal(result.entries[1].exerciseCount, 1);
  assert.equal('exercises' in result.entries[1], false);
  assert.equal('minutes' in result.entries[1], false);
  assert.equal(result.entries[0].startTime, null);
});

test('calendar caches empty ranges until TTL, and containing months satisfy weeks without new calls', async () => {
  let clock = 0; let calls = 0;
  const cache = createCalendarCache({ now: () => clock });
  const api = { getCalendarRange: async () => { calls++; return empty(); } };
  await cache.load(api, '2026-01-01', '2026-01-31');
  await cache.load(api, '2026-01-04', '2026-01-10');
  clock = 59_999;
  await cache.load(api, '2026-01-01', '2026-01-31');
  assert.equal(calls, 1);
  assert.equal(cache.peek('2026-01-04', '2026-01-10').data.entries.length, 0);
  clock = 60_000;
  assert.equal(cache.peek('2026-01-01', '2026-01-31').fresh, false);
  await cache.load(api, '2026-01-04', '2026-01-10');
  assert.equal(calls, 2);
});

test('overlapping concurrent calendar reads share a covering request and filter rows to their own dates', async () => {
  let calls = 0; const request = deferred(); const cache = createCalendarCache();
  const api = { getCalendarRange: () => { calls++; return request.promise; } };
  const month = cache.load(api, '2026-01-01', '2026-01-31');
  const week = cache.load(api, '2026-01-04', '2026-01-10');
  request.resolve({ ...empty(), workouts: [workout('first', '2026-01-01'), workout('second', '2026-01-05')] });
  assert.equal((await month).entries.length, 2);
  assert.deepEqual(plain((await week).entries.map(row => row.id)), ['second']);
  assert.equal(calls, 1);
});

test('sports invalidation fences old reads, invalidates overlapping months and weeks, and preserves unrelated ranges', async () => {
  const cache = createCalendarCache();
  const api = { getCalendarRange: async () => empty() };
  await cache.load(api, '2026-01-01', '2026-01-31');
  await cache.load(api, '2026-02-01', '2026-02-28');
  const old = deferred();
  const stale = cache.load({ getCalendarRange: () => old.promise }, '2026-01-04', '2026-01-10', true);
  const events = []; const unsubscribe = cache.subscribe(range => events.push(plain(range)));
  cache.invalidate('2026-01-05', '2026-01-05');
  assert.equal(cache.peek('2026-01-01', '2026-01-31').fresh, false);
  assert.equal(cache.peek('2026-02-01', '2026-02-28').fresh, true);
  const latest = cache.load({ getCalendarRange: async () => ({ ...empty(), sports_workouts: [sports('new', '2026-01-05')] }) }, '2026-01-04', '2026-01-10');
  await latest;
  old.resolve(empty()); assert.equal(await stale, undefined);
  assert.equal(cache.peek('2026-01-04', '2026-01-10').data.entries[0].id, 'new');
  assert.deepEqual(events, [{ start: '2026-01-05', end: '2026-01-05' }]);
  unsubscribe(); cache.invalidate(); assert.equal(events.length, 1);
});

test('calendar clear fences account reads, failed refresh retains stale data, and force refresh bypasses a fresh hit', async () => {
  const cache = createCalendarCache(); const request = deferred(); let calls = 0;
  const api = { getCalendarRange: async () => { calls++; return { ...empty(), workouts: [workout('one', '2026-01-01')] }; } };
  await cache.load(api, '2026-01-01', '2026-01-31');
  await cache.load(api, '2026-01-01', '2026-01-31', true);
  assert.equal(calls, 2);
  await assert.rejects(cache.load({ getCalendarRange: async () => { throw new Error('offline'); } }, '2026-01-01', '2026-01-31', true), /offline/);
  assert.equal(cache.peek('2026-01-01', '2026-01-31').data.entries[0].id, 'one');
  assert.equal(cache.peek('2026-01-01', '2026-01-31').fresh, false);
  const pending = cache.load({ getCalendarRange: () => request.promise }, '2026-01-01', '2026-01-31');
  cache.clear(); request.resolve({ ...empty(), workouts: [workout('private', '2026-01-01')] });
  assert.equal(await pending, undefined);
  assert.equal(cache.peek('2026-01-01', '2026-01-31'), undefined);
});

test('calendar LRU and content budgets bound memory without truncating displayed results', async () => {
  const cache = createCalendarCache({ maxRanges: 2, maxBytes: 1500 });
  const api = { getCalendarRange: async () => empty() };
  await cache.load(api, '2026-01-01', '2026-01-31');
  await cache.load(api, '2026-02-01', '2026-02-28');
  cache.peek('2026-01-01', '2026-01-31');
  await cache.load(api, '2026-03-01', '2026-03-31');
  assert.equal(cache.peek('2026-02-01', '2026-02-28'), undefined);
  assert.ok(cache.peek('2026-01-01', '2026-01-31'));
  const huge = await cache.load({ getCalendarRange: async () => ({ ...empty(), workouts: [workout('large', '2026-04-01', { notes: 'x'.repeat(2000) })] }) }, '2026-04-01', '2026-04-30');
  assert.equal(huge.entries[0].notes.length, 2000);
  assert.equal(cache.peek('2026-04-01', '2026-04-30'), undefined);
});

// Run the actual focus hook with deterministic React/native lifecycle boundaries.
function rangeFixture(api, cache = createCalendarCache()) {
  const slots = []; let cursor = 0; let dirty = true; let effects = []; let value;
  let dates = ['2026-01-01', '2026-01-31']; let owner = 'a'; let focused = true;
  const events = new Set();
  const changed = (a, b) => !a || a.some((v, i) => v !== b[i]);
  const hooks = {
    useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState: initial => {
      const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], update => { slots[i] = typeof update === 'function' ? update(slots[i]) : update; dirty = true; }];
    },
    useCallback: (fn, deps) => {
      const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn;
    },
  };
  const { useCalendarRange } = load('state/use-calendar-range.ts', {
    react: hooks,
    'expo-router': { useFocusEffect: fn => {
      const i = cursor++; const prev = slots[i];
      if (prev?.fn !== fn || prev?.focused !== focused) {
        slots[i] = { fn, focused };
        effects.push(() => { prev?.cleanup?.(); if (slots[i].focused) slots[i].cleanup = fn(); });
      }
    } },
    'react-native': { AppState: { addEventListener: (_, fn) => { events.add(fn); return { remove: () => events.delete(fn) }; } } },
    '@/lib/errors': { errorMessage: error => error.message },
    '@/services/api': { backendFor: userId => { assert.equal(userId, owner); return api; } },
    '@/state/app-context': { useApp: () => ({ authSession: owner ? { user: { id: owner } } : null, calendarCache: cache }) },
  });
  function render() { cursor = 0; dirty = false; value = useCalendarRange(...dates); return value; }
  async function flush() {
    for (let i = 0; i < 8; i++) {
      if (dirty) render();
      const work = effects; effects = []; work.forEach(fn => fn());
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  return { flush, cache, render, get value() { return value; },
    range: (...next) => { dates = next; dirty = true; },
    focus: status => { focused = status; dirty = true; },
    owner: next => { cache.clear(); owner = next; dirty = true; },
    active: () => events.forEach(fn => fn('active')),
  };
}

test('focused calendar reuses TTL on tab return, refreshes on app resume/expiration and active invalidation', async () => {
  let clock = 0; let calls = 0;
  const f = rangeFixture({ getCalendarRange: async () => { calls++; return empty(); } }, createCalendarCache({ now: () => clock }));
  await f.flush(); assert.equal(calls, 1); assert.equal(f.value.loading, false);
  f.focus(false); await f.flush(); f.focus(true); await f.flush(); assert.equal(calls, 1);
  f.active(); await f.flush(); assert.equal(calls, 1);
  clock = 60_000; f.active(); await f.flush(); assert.equal(calls, 2);
  f.cache.invalidate('2026-01-20', '2026-01-20'); await f.flush(); assert.equal(calls, 3);
  f.cache.invalidate('2026-02-01', '2026-02-01'); await f.flush(); assert.equal(calls, 3);
  await f.value.refresh(); await f.flush(); assert.equal(calls, 4);
  f.focus(false); await f.flush(); clock += 60_000; f.active(); await f.flush(); assert.equal(calls, 4);
});

test('range switches never show the previous dates and late results cannot replace the visible range', async () => {
  const january = deferred(); const february = deferred();
  const f = rangeFixture({ getCalendarRange: start => start === '2026-01-01' ? january.promise : february.promise });
  await f.flush(); assert.equal(f.value.loading, true);
  f.range('2026-02-01', '2026-02-28');
  assert.equal(f.render().data, undefined); await f.flush();
  february.resolve({ ...empty(), workouts: [workout('february', '2026-02-01')] }); await f.flush();
  january.resolve({ ...empty(), workouts: [workout('january', '2026-01-01')] }); await f.flush();
  assert.equal(f.value.data.entries[0].id, 'february');
  assert.equal(f.value.loading, false);
  f.owner(null); assert.equal(f.render().data, undefined); await f.flush();
  assert.match(f.value.error, /Sign in/);
});

test('failed revalidation shows stale results with an error and a successful retry clears it', async () => {
  let fail = false;
  const f = rangeFixture({ getCalendarRange: async () => {
    if (fail) throw new Error('offline');
    return { ...empty(), workouts: [workout('saved', '2026-01-02')] };
  } });
  await f.flush(); fail = true;
  await f.value.refresh(); await f.flush();
  assert.equal(f.value.error, 'offline'); assert.equal(f.value.data.entries[0].id, 'saved');
  assert.equal(f.value.loading, false);
  fail = false; await f.value.refresh(); await f.flush(); assert.equal(f.value.error, null);
});

test('late calendar failures cannot replace another account or the signed-out state', async () => {
  const old = deferred(); let reads = 0;
  const f = rangeFixture({ getCalendarRange: () => ++reads === 1 ? old.promise
    : Promise.resolve({ ...empty(), workouts: [workout('new-owner', '2026-01-02')] }) });
  await f.flush(); f.owner('b'); await f.flush();
  old.reject(new Error('old account failure')); await f.flush();
  assert.equal(f.value.data.entries[0].id, 'new-owner');
  assert.equal(f.value.error, null);
  assert.equal(f.value.loading, false);
  f.owner(null); await f.flush();
  await f.value.refresh(); await f.flush();
  assert.equal(reads, 2);
  assert.equal(f.value.data, undefined);
  assert.equal(f.value.loading, false);
  assert.match(f.value.error, /Sign in/);
});
