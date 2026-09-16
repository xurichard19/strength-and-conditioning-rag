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
  } });
  return exports;
}
const calendar = load('lib/calendar.ts');
const plain = value => JSON.parse(JSON.stringify(value));

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

function fixture(sessions = []) {
  const today = '2026-01-31';
  const slots = []; let cursor = 0; const routes = [];
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
    '@/components/ui': { AppText: 'text', Card: 'card', ModalityBadge: 'badge', Screen: 'screen', SectionTitle: 'heading', ShieldLine: 'shield' },
    '@/components/calendar-day-actions': { CalendarDayActions: 'day-actions' },
    '@/lib/calendar': calendar,
    '@/lib/dates': { todayIso: () => today, isToday: date => date === today, formatDay: date => calendar.calendarLabel(date, { weekday: 'short' }) },
    '@/state/app-context': { useApp: () => ({ sessions, colors, block: { week: 3, of: 8, name: 'Strength' }, refreshPreview: refresh }) },
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
  return { render, refresh, routes, find,
    menu: () => nodes(render()).find(node => node.type === 'day-actions'),
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

test('holding a date opens that day’s actions in week and month views, with an accessible alternative', () => {
  const screen = fixture();
  const day = screen.find('Friday, January 30, 2026. No workouts planned');
  assert.equal(day.props.delayLongPress, 450);
  day.props.onLongPress();
  assert.equal(screen.menu().props.date, '2026-01-30');
  screen.menu().props.onClose();
  assert.equal(screen.menu(), undefined);
  screen.click('Month view');
  screen.find('Sunday, February 1, 2026. No workouts planned').props.onAccessibilityAction({ nativeEvent: { actionName: 'longpress' } });
  assert.equal(screen.menu().props.date, '2026-02-01');
  screen.menu().props.onClose();
  screen.click('Options for selected day');
  assert.equal(screen.menu().props.date, '2026-02-01');
  assert.equal(screen.routes.length, 0);
});

test('multiple same-day sessions appear in the agenda and adjacent-month selection follows the date', () => {
  const sessions = ['Strength session', 'Evening run'].map((title, index) => ({
    id: `session-${index}`, title, date: '2026-01-31', modality: index ? 'endurance' : 'strength',
    minutes: 30, status: 'planned', exercises: [],
  }));
  const screen = fixture(sessions);
  screen.click('Month view');
  const day = screen.find('Saturday, January 31, 2026, today. Strength session, planned; Evening run, planned');
  assert.equal(day.props.accessibilityState.selected, true);
  assert.ok(screen.find('Strength session'));
  assert.ok(screen.find('Evening run'));
  screen.click('Sunday, February 1, 2026. No workouts planned');
  assert.match(screen.text(), /February 2026/);
  assert.equal(screen.find('Sunday, February 1, 2026. No workouts planned').props.accessibilityState.selected, true);
  assert.match(screen.text(), /No workouts planned for this day/);
  assert.equal(screen.routes.length, 0); // Selecting a date never starts a workout or a plan.
  screen.click('Go to today');
  screen.click('Evening run');
  assert.deepEqual(screen.routes, ['/session/session-1']);
});
