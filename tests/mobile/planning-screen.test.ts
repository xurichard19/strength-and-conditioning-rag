import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deferred, jsx, load, type Stubs, type TestModule, type TestNode, type TestValue } from './helpers.ts';
import type { PlanningChange, PlanningChangePreview, PlanningJob } from '../../mobile/src/services/backend';

const change: PlanningChange = { id: 'change-1', user_id: 'owner', revision: 3, kind: 'adjustment', status: 'applied',
  reason: 'sport schedule changed', effective_from: '2026-10-18', effective_through: '2026-10-22',
  horizon_end_before: '2026-11-01', horizon_end_after: '2026-11-01', created_at: '2026-10-18T12:00:00Z' };
const job: PlanningJob = { id: 'job-1', kind: 'refresh', status: 'running', reason: 'scheduled refresh',
  effective_from: null, effective_through: null, scheduled_for: null, change_id: null, completed_at: null,
  created_at: '2026-10-18T12:00:00Z' };
const preview: PlanningChangePreview = { change, revision: 3, before: [], after: [{ id: 'workout-1', name: 'Full body strength',
  scheduled_date: '2026-10-20', status: 'planned', superseded_at: null, notes: null, exercises: [{ id: 'exercise-1', name: 'Goblet squat' }] }] };

function fixture(state: TestModule = {}, detail = async () => preview) {
  const slots: TestValue[] = []; let cursor = 0; let dirty = true; let tree: TestNode;
  let effects: (() => void)[] = []; const reads: string[] = []; let refreshes = 0; let older = 0;
  const hooks = {
    useState: initial => {
      const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value: TestValue) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; dirty = true; }];
    },
    useEffect: (fn, deps) => {
      const i = cursor++; const previous = slots[i];
      if (!previous || deps.some((value: TestValue, index: number) => value !== previous.deps[index])) {
        slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  } satisfies Stubs;
  const { default: Screen } = load('screens/plans-screen.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-native': { View: 'view', Pressable: 'button', ActivityIndicator: 'spinner', StyleSheet: { create: value => value } },
    'lucide-react-native': { ChevronDown: 'down', ChevronUp: 'up', Clock3: 'clock' },
    '@/components/ui': { AppText: 'text', Card: 'card', Screen: 'screen', SectionTitle: 'heading', SecondaryButton: 'action' },
    '@/lib/calendar': load('lib/calendar.ts'),
    '@/services/api': { backendFor: userId => { assert.equal(userId, 'owner'); return {
      getPlanningChange: async (id: string) => { reads.push(id); return detail(); },
    }; } },
    '@/state/app-context': { useApp: () => ({ colors: {}, authSession: { user: { id: 'owner' } } }) },
    '@/state/use-planning-manager': { usePlanningManager: () => ({ jobs: [], changes: [], jobsLoaded: true, loaded: true,
      loading: false, loadingMore: false, hasMore: false, error: null,
      refresh: async () => { refreshes++; }, loadMore: async () => { older++; }, ...state }) },
  });
  const expand = (node: TestValue): TestValue => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(expand);
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  };
  const nodes = (node: TestValue): TestNode[] => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props.children)];
  };
  const render = () => { cursor = 0; dirty = false; tree = expand(Screen()); return tree; };
  async function flush() {
    for (let i = 0; i < 5; i++) {
      if (dirty) render();
      const work = effects; effects = []; work.forEach(fn => fn());
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  return { render, flush, reads, state, text: () => JSON.stringify(tree),
    get refreshes() { return refreshes; }, get older() { return older; },
    click: (label: string) => {
      const button = nodes(tree).find(node => node.props.accessibilityLabel === label || node.props.accessibilityLabel?.startsWith(`${label}.`)
        || node.type === 'action' && node.props.children === label);
      assert.ok(button, `missing control: ${label}`); button.props.onPress();
    },
    unmount: () => slots.forEach(slot => slot?.cleanup?.()),
  };
}

test('plan loading and errors do not announce an empty job queue or empty history', async () => {
  const f = fixture({ jobsLoaded: false, loaded: false, loading: true }); await f.flush();
  assert.match(f.text(), /Loading plans/); assert.doesNotMatch(f.text(), /No plan updates|No plan history/);
  f.state.loading = false; f.state.error = 'Could not load your plans.'; f.render();
  assert.match(f.text(), /Could not load your plans/); assert.doesNotMatch(f.text(), /No plan updates|No plan history/);
  f.click('Retry'); assert.equal(f.refreshes, 1);
});

test('activity is shown while history is still loading', async () => {
  const f = fixture({ jobsLoaded: true, loaded: false, loading: true }); await f.flush();
  assert.match(f.text(), /No plan updates in progress/);
  assert.match(f.text(), /Loading plans/);
  assert.doesNotMatch(f.text(), /No plan history yet/);
  f.state.jobs = [job]; f.render();
  assert.match(f.text(), /In progress/);
  assert.doesNotMatch(f.text(), /No plan updates/);
});

test('empty plan state uses live data and supports pull to refresh', async () => {
  const f = fixture(); await f.flush(); const screen = f.render();
  assert.equal(screen.props.preview, false);
  assert.match(f.text(), /No plan updates in progress/); assert.match(f.text(), /No plan history yet/);
  await screen.props.onRefresh(); assert.equal(f.refreshes, 1);
});

test('plan list shows running and queued work, readable reasons, history status and pagination', async () => {
  const f = fixture({ jobs: [job, { ...job, id: 'job-2', status: 'pending', scheduled_for: '2026-10-20T12:00:00Z' }],
    changes: [{ ...change, status: 'undone' }], hasMore: true }); await f.flush();
  for (const label of ['In progress', 'Queued', 'Scheduled for', 'Your sports schedule changed', 'Undone', 'Version ', 'Oct 18, 2026']) {
    assert.ok(f.text().includes(label), label);
  }
  f.click('Load older updates'); assert.equal(f.older, 1); assert.equal(f.reads.length, 0);
});

test('history fetches affected workout details only after expansion', async () => {
  const f = fixture({ changes: [change] }); await f.flush(); assert.equal(f.reads.length, 0);
  f.click('View plan update 3'); await f.flush();
  assert.deepEqual(f.reads, ['change-1']);
  assert.match(f.text(), /Only workouts affected by this update/);
  assert.match(f.text(), /Full body strength/); assert.match(f.text(), /Goblet squat/);
  f.click('View plan update 3'); await f.flush(); assert.doesNotMatch(f.text(), /Goblet squat/);
  f.click('View plan update 3'); await f.flush(); assert.match(f.text(), /Goblet squat/); assert.equal(f.reads.length, 1);
});

test('failed refresh keeps visible history marked as potentially stale', async () => {
  const f = fixture({ changes: [change], error: 'Could not refresh your plans.' }); await f.flush();
  assert.match(f.text(), /may be out of date/); assert.match(f.text(), /Your sports schedule changed/);
});

test('late history responses are ignored after closing a card and on unmount', async () => {
  const pending = deferred<PlanningChangePreview>(); const f = fixture({ changes: [change] }, () => pending.promise);
  await f.flush(); f.click('View plan update 3'); await f.flush();
  f.click('View plan update 3'); await f.flush(); pending.resolve(preview); await f.flush();
  assert.doesNotMatch(f.text(), /Goblet squat/);
  const late = deferred<PlanningChangePreview>(); const gone = fixture({ changes: [change] }, () => late.promise);
  await gone.flush(); gone.click('View plan update 3'); await gone.flush(); gone.unmount();
  late.resolve(preview); await gone.flush(); assert.doesNotMatch(gone.text(), /Goblet squat/);
});

test('failed details expose a retry without raw errors and removal-only changes show removed workouts', async () => {
  let fail = true;
  const f = fixture({ changes: [change] }, async () => {
    if (fail) throw new Error('private provider diagnostic');
    return { ...preview, before: preview.after, after: [] };
  });
  await f.flush(); f.click('View plan update 3'); await f.flush();
  assert.match(f.text(), /Could not load this update/); assert.doesNotMatch(f.text(), /private provider/);
  fail = false; f.click('Retry details'); await f.flush();
  assert.match(f.text(), /Workouts removed by this update/); assert.match(f.text(), /Goblet squat/);
});
