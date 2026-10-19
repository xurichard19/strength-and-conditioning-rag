import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deferred, jsx, load, nodes, type Stubs, type TestModule, type TestNode, type TestValue } from './helpers.ts';
import type { CalendarSnapshot } from '../../mobile/src/lib/calendar';
import type { PlanningChange, PlanningChangePreview, PlanningJob, PlanningSchedule } from '../../mobile/src/services/backend';

const change: PlanningChange = { id: 'change-1', user_id: 'owner', revision: 3, kind: 'adjustment', status: 'applied',
  reason: 'sport schedule changed', effective_from: '2026-10-18', effective_through: '2026-10-22',
  horizon_end_before: '2026-11-01', horizon_end_after: '2026-11-01', created_at: '2026-10-18T12:00:00Z' };
const job: PlanningJob = { id: 'job-1', kind: 'refresh', status: 'running', reason: 'scheduled refresh',
  effective_from: null, effective_through: null, scheduled_for: null, change_id: null, completed_at: null,
  created_at: '2026-10-18T12:00:00Z' };
const schedule: PlanningSchedule = { user_id: 'owner', horizon_days: 21, refresh_interval_days: 7,
  horizon_end: '2026-11-07', next_refresh_at: '2026-10-25T12:00:00Z', revision: 3,
  created_at: change.created_at, updated_at: change.created_at };
const calendar: CalendarSnapshot = { revision: 3, entries: [
  { id: 'one', kind: 'workout', date: '2026-10-20', title: 'Lower body', notes: null, status: 'planned' },
  { id: 'two', kind: 'sport', date: '2026-10-22', title: 'Boxing', notes: null, status: 'planned' },
  { id: 'three', kind: 'workout', date: '2026-10-25', title: 'Upper body', notes: null, status: 'planned' },
  { id: 'four', kind: 'workout', date: '2026-10-30', title: 'Lower body', notes: null, status: 'planned' },
] };
const preview: PlanningChangePreview = { change, revision: 3,
  before: [{ id: 'before', name: 'Original lower body', scheduled_date: '2026-10-20', status: 'planned',
    superseded_at: change.created_at, notes: 'Original prescription', exercises: [{ id: 'squat', name: 'Goblet squat',
      sets: [{ planned_reps: 10, planned_rpe: 7 }] }] }],
  after: [{ id: 'after', name: 'Adjusted lower body', scheduled_date: '2026-10-24', status: 'planned',
    superseded_at: null, notes: null, exercises: [{ id: 'squat', name: 'Goblet squat',
      sets: [{ planned_reps: 8, planned_rpe: 6 }, { planned_reps: 8, planned_rpe: 6 }] }] }] };

function fixture(state: TestModule = {}, detail = async () => preview) {
  type Instance = { slots: TestValue[]; mounted: boolean };
  const instances = new Map<string, Instance>(); let active: Instance; let cursor = 0; let dirty = true; let tree: TestNode;
  let effects: (() => void)[] = []; const reads: string[] = []; let refreshes = 0; let older = 0; let lateWrites = 0;
  const app = { colors: {}, authSession: { user: { id: 'owner' } } };
  const hooks = {
    useState: initial => {
      const instance = active; const i = cursor++; const slots = instance.slots;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (value: TestValue) => {
        slots[i] = typeof value === 'function' ? value(slots[i]) : value;
        if (instance.mounted) dirty = true; else lateWrites++;
      }];
    },
    useEffect: (fn, deps) => {
      const slots = active.slots; const i = cursor++; const previous = slots[i];
      if (!previous || deps.some((value: TestValue, index: number) => value !== previous.deps[index])) {
        slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  } satisfies Stubs;
  const keyedJsx = (type: TestValue, props: TestModule, key?: string) => ({ type, props, key });
  const { default: Screen } = load('screens/plans-screen.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx: keyedJsx, jsxs: keyedJsx, Fragment: 'fragment' },
    'react-native': { View: 'view', Pressable: 'button', ScrollView: 'scroll', ActivityIndicator: 'spinner',
      StyleSheet: { create: value => value, hairlineWidth: 1 } },
    'lucide-react-native': { ArrowLeft: 'left', ArrowUpRight: 'right', ChevronRight: 'chevron', Clock3: 'clock', History: 'history', Layers3: 'layers' },
    '@/components/action-sheet': { ActionSheet: 'sheet' },
    '@/components/ui': { AppText: 'text', Card: 'card', Screen: 'screen', SecondaryButton: 'action' },
    '@/lib/calendar': load('lib/calendar.ts'),
    '@/services/api': { backendFor: () => ({ getPlanningChange: async (id: string) => { reads.push(id); return detail(); } }) },
    '@/state/app-context': { useApp: () => app },
    '@/state/use-planning-manager': { usePlanningManager: () => ({ jobs: [], changes: [], schedule: null, calendar: null,
      jobsLoaded: true, loaded: true, overviewLoaded: true, overviewError: null, checkedAt: Date.parse('2026-10-19T12:00:00Z'),
      loading: false, loadingMore: false, hasMore: false, error: null,
      refresh: async () => { refreshes++; }, loadMore: async () => { older++; }, ...state }) },
  }, { Date: class extends Date { static now() { return Date.parse('2026-10-19T12:00:00Z'); } } });
  const dispose = (instance: Instance) => { instance.mounted = false; instance.slots.forEach(slot => slot?.cleanup?.()); };
  const expand = (node: TestValue, path: string, seen: Set<string>): TestValue => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((child, index) => expand(child, `${path}/${child?.key ?? index}`, seen));
    if (typeof node.type === 'function') {
      const id = `${path}:${node.type.name}:${node.key ?? ''}`;
      active = instances.get(id) ?? { slots: [], mounted: true }; instances.set(id, active); seen.add(id); cursor = 0;
      return expand(node.type(node.props), id, seen);
    }
    return { ...node, props: { ...node.props, children: expand(node.props.children, `${path}/children`, seen) } };
  };
  const render = () => {
    dirty = false; const seen = new Set<string>(); tree = expand(jsx(Screen, {}), 'root', seen);
    for (const [id, instance] of instances) if (!seen.has(id)) { dispose(instance); instances.delete(id); }
    return tree;
  };
  async function flush() {
    for (let i = 0; i < 5; i++) {
      if (dirty) render();
      const work = effects; effects = []; work.forEach(fn => fn());
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  const text = (node: TestValue): string => Array.isArray(node) ? node.map(text).join('')
    : node && typeof node === 'object' ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
  return { render, flush, reads, state, app, text: () => text(tree),
    screen: () => nodes(tree).find(node => node.type === 'screen')!,
    get refreshes() { return refreshes; }, get older() { return older; }, get lateWrites() { return lateWrites; },
    labels: () => nodes(tree).map(node => node.props.accessibilityLabel).filter(Boolean).join(' '),
    click: (label: string) => {
      const button = nodes(tree).find(node => node.props.accessibilityLabel === label || node.props.accessibilityLabel?.startsWith(`${label}.`)
        || node.type === 'action' && node.props.children === label);
      assert.ok(button, `missing control: ${label}`); button.props.onPress();
    },
    close: () => { const sheet = nodes(tree).find(node => node.type === 'sheet'); assert.ok(sheet); sheet.props.onClose(); },
    unmount: () => { instances.forEach(dispose); dirty = false; },
  };
}

test('loading, failures and empty state stay truthful and support retry and pull to refresh', async () => {
  const f = fixture({ jobsLoaded: false, loaded: false, overviewLoaded: false, loading: true }); await f.flush();
  assert.match(f.labels(), /Loading plans/); assert.doesNotMatch(f.text(), /No plan updates|No plan history|Complete onboarding/);
  f.state.jobsLoaded = true; f.render(); assert.match(f.text(), /No plan updates in progress/);
  f.state.loading = false; f.state.error = 'Could not load your plans.'; f.render();
  assert.match(f.text(), /Could not load your plans/); assert.doesNotMatch(f.text(), /No plan history|Complete onboarding/);
  f.click('Retry'); assert.equal(f.refreshes, 1);
  Object.assign(f.state, { loaded: true, overviewLoaded: true, error: null }); f.render();
  assert.equal(f.screen().props.preview, false);
  assert.match(f.text(), /Your plan starts here/); assert.match(f.text(), /No plan history yet/);
  await f.screen().props.onRefresh(); assert.equal(f.refreshes, 2);
});

test('overview uses saved weeks and counts, distinguishes missing summary and expired coverage', async () => {
  const f = fixture({ schedule, calendar }); await f.flush();
  assert.equal(f.screen().props.title, 'Your plan'); assert.match(f.text(), /3 weeks · refreshes weekly/);
  assert.match(f.text(), /Oct 18 – Oct 24/); assert.match(f.text(), /1 training session · 1 sports session/);
  assert.match(f.text(), /Boxing on your schedule/); assert.match(f.text(), /Next refresh/);
  f.click('Plan week 2'); await f.flush();
  assert.match(f.text(), /Oct 25 – Oct 31/); assert.match(f.text(), /2 training sessions · 0 sports sessions/);
  assert.doesNotMatch(f.text(), /Boxing on your schedule/);
  f.click('Plan week 3'); await f.flush(); assert.match(f.text(), /Nov 1 – Nov 7/);
  assert.match(f.text(), /0 training sessions · 0 sports sessions/);
  f.state.calendar = null; f.state.overviewError = 'Could not refresh your plan overview.'; f.render();
  assert.match(f.text(), /Session summary unavailable/); assert.match(f.text(), /may be out of date/);
  assert.doesNotMatch(f.text(), /0 training sessions/);
  f.state.schedule = { ...schedule, horizon_end: '2026-10-17', next_refresh_at: '2026-10-18T12:00:00Z' }; f.render();
  assert.match(f.text(), /PAST COVERAGE/); assert.match(f.text(), /Refresh due/);
});

test('overview and timeline expose real job and history status, filtering and pagination', async () => {
  const f = fixture({ jobs: [job, { ...job, id: 'job-2', status: 'pending', scheduled_for: '2026-10-20T12:00:00Z' }],
    changes: [{ ...change, status: 'undone' }, { ...change, id: 'refresh', revision: 2, kind: 'refresh', status: 'discarded' },
      { ...change, id: 'first', revision: 1, kind: 'refresh', horizon_end_before: null }], hasMore: true,
    error: 'Could not refresh your plans.' }); await f.flush();
  for (const label of ['In progress', 'Queued', 'Scheduled for', 'Your sports schedule changed', 'Undone', 'Discarded', 'may be out of date']) {
    assert.ok(f.text().includes(label), label);
  }
  assert.equal(f.reads.length, 0); f.click('View all plan history'); await f.flush();
  assert.equal(f.screen().props.title, 'Plan history'); assert.match(f.text(), /FIRST PLAN/);
  f.click('Adjustments'); await f.flush(); assert.match(f.labels(), /View plan update 3/);
  assert.doesNotMatch(f.labels(), /View plan update [12]/);
  f.click('Load older updates'); assert.equal(f.older, 1);
  f.click('All updates'); await f.flush(); assert.match(f.labels(), /View plan update 2/);
  f.click('Back to plan overview'); await f.flush(); assert.equal(f.screen().props.title, 'Your plan');
});

test('details load lazily and reuse the preview while preserving superseded prescriptions on both sides', async () => {
  const f = fixture({ changes: [change] }); await f.flush(); assert.equal(f.reads.length, 0);
  f.click('View plan update 3'); await f.flush(); assert.deepEqual(f.reads, ['change-1']);
  for (const label of ['Only workouts affected', 'BEFORE', 'AFTER', 'Original lower body', 'Adjusted lower body',
    'Goblet squat', 'Set 1 · 10 reps · RPE 7', 'Sets 1–2 · 8 reps · RPE 6']) assert.ok(f.text().includes(label), label);
  f.close(); await f.flush(); assert.doesNotMatch(f.text(), /Goblet squat/);
  f.click('View all plan history'); await f.flush(); f.click('View plan update 3'); await f.flush();
  assert.match(f.text(), /Goblet squat/); assert.equal(f.reads.length, 1);
});

test('late details cannot reopen a closed sheet or update an unmounted or different account', async () => {
  for (const action of ['close', 'unmount', 'account'] as const) {
    const pending = deferred<PlanningChangePreview>(); const f = fixture({ changes: [change] }, () => pending.promise);
    await f.flush(); f.click('View plan update 3'); await f.flush();
    if (action === 'close') { f.close(); await f.flush(); }
    else if (action === 'unmount') f.unmount();
    else { f.app.authSession.user.id = 'other'; f.render(); await f.flush(); }
    pending.resolve(preview); await f.flush();
    assert.doesNotMatch(f.text(), /Goblet squat/); assert.equal(f.lateWrites, 0);
  }
});

test('failed details hide diagnostics and retry removal-only updates', async () => {
  let fail = true;
  const f = fixture({ changes: [change] }, async () => {
    if (fail) throw new Error('private provider diagnostic');
    return { ...preview, after: [] };
  });
  await f.flush(); f.click('View plan update 3'); await f.flush();
  assert.match(f.text(), /Could not load this update/); assert.doesNotMatch(f.text(), /private provider/);
  fail = false; f.click('Retry details'); await f.flush();
  assert.match(f.text(), /Original lower body/); assert.match(f.text(), /No workouts in this part of the update/);
});
