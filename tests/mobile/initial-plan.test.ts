import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deferred, load, type Stubs, type TestValue } from './helpers.ts';
import type { CalendarResponse, PlanningJob, PlanningSchedule } from '../../mobile/src/services/backend';

const job: PlanningJob = { id: 'first', kind: 'refresh', status: 'failed', reason: 'initial plan', effective_from: null,
  effective_through: null, scheduled_for: null, change_id: null, created_at: '2026-11-01T00:00:00Z', completed_at: null };
const schedule = (status: PlanningSchedule['initial_plan_status']): PlanningSchedule => ({ user_id: 'a',
  horizon_days: 21, refresh_interval_days: 7, horizon_end: status === 'ready' ? '2026-11-30' : null,
  revision: status === 'ready' ? 1 : 0, next_refresh_at: '2026-11-15T00:00:00Z', created_at: job.created_at,
  updated_at: job.created_at, initial_plan_status: status, initial_plan_job: job });

function fixture(read: () => Promise<PlanningSchedule | null>, retry: (id: string) => Promise<PlanningJob> = async () => job,
  calendarCache?: { invalidate: () => void }) {
  const slots: TestValue[] = []; let cursor = 0; let dirty = true; let focused = true; let owner = 'a';
  let effects: (() => void)[] = []; let value!: ReturnType<typeof import('../../mobile/src/state/use-initial-plan').useInitialPlan>;
  const timers = new Set<() => void>(); const events = new Set<(status: string) => void>(); let invalidations = 0;
  const hooks = {
    useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], (next: TestValue) => { slots[i] = next; dirty = true; }]; },
    useCallback: (fn, deps) => { const i = cursor++;
      if (!slots[i] || deps.some((v: TestValue, j: number) => v !== slots[i].deps[j])) slots[i] = { fn, deps };
      return slots[i].fn; },
  } satisfies Stubs;
  const cache = { invalidate: () => { invalidations++; calendarCache?.invalidate(); } };
  const native = { currentState: 'active', addEventListener: (_: string, fn: (status: string) => void) => {
    events.add(fn); return { remove: () => events.delete(fn) };
  } };
  const { useInitialPlan } = load('state/use-initial-plan.ts', { react: hooks,
    'expo-router': { useFocusEffect: fn => { const i = cursor++; const old = slots[i];
      if (old?.fn !== fn || old?.focused !== focused) { slots[i] = { fn, focused };
        effects.push(() => { old?.cleanup?.(); if (slots[i].focused) slots[i].cleanup = fn(); }); }
    } },
    'react-native': { AppState: native }, '@/lib/errors': { errorMessage: error => error.message },
    '@/lib/initial-plan': load('lib/initial-plan.ts'),
    '@/services/api': { backendFor: () => ({ getPlanningSchedule: read, retryPlanningJob: retry }) },
    '@/state/app-context': { useApp: () => ({ authSession: { user: { id: owner } }, calendarCache: cache }) },
  }, { setTimeout: (fn: () => void, delay: number) => { assert.equal(delay, 10_000); timers.add(fn); return fn; },
    clearTimeout: (fn: () => void) => timers.delete(fn) });
  function render() {
    cursor = 0; dirty = false;
    // eslint-disable-next-line react-hooks/rules-of-hooks -- deterministic React lifecycle test harness.
    value = useInitialPlan(); return value;
  }
  async function flush() { for (let i = 0; i < 6; i++) { if (dirty) render();
    const work = effects; effects = []; work.forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); } }
  return { flush, render, get value() { return value; }, get timers() { return timers.size; },
    get invalidations() { return invalidations; },
    tick: () => { const work = [...timers]; timers.clear(); work.forEach(fn => fn()); },
    focus: (next: boolean) => { focused = next; dirty = true; }, owner: (next: string) => { owner = next; dirty = true; },
    appState: (next: string) => { native.currentState = next; events.forEach(fn => fn(next)); },
  };
}

test('Today polls queued and deferred first plans, pauses offscreen and reloads workouts on publication', async () => {
  let current = schedule('queued'); let reads = 0;
  const f = fixture(async () => { reads++; return current; }); await f.flush();
  assert.equal(f.timers, 1); assert.equal(f.invalidations, 0);
  f.appState('background'); assert.equal(f.timers, 0); f.tick(); await f.flush(); assert.equal(reads, 1);
  current = schedule('deferred'); f.appState('active'); await f.flush(); assert.equal(f.timers, 1);
  f.focus(false); await f.flush(); assert.equal(f.timers, 0);
  f.focus(true); await f.flush(); assert.equal(f.timers, 1);
  current = schedule('running'); f.tick(); await f.flush(); assert.equal(f.timers, 1);
  current = schedule('ready'); f.tick(); await f.flush();
  assert.equal(f.value.schedule?.initial_plan_status, 'ready'); assert.equal(f.timers, 0); assert.equal(f.invalidations, 1);
});

test('publication while Today is unfocused refreshes an empty calendar before its cache TTL expires', async () => {
  const { createCalendarCache } = load<typeof import('../../mobile/src/state/calendar-cache')>('state/calendar-cache.ts', {
    '../lib/calendar': load('lib/calendar.ts'), './memory-cache': load('state/memory-cache.ts'),
  });
  const cache = createCalendarCache({ now: () => 1_000 });
  let calendar: CalendarResponse = { revision: null, workouts: [], sports_workouts: [] };
  let current = schedule('queued'); let reads = 0;
  const api = { getCalendarRange: async () => { reads++; return calendar; } };
  await cache.load(api, '2026-11-01', '2026-11-01');
  const f = fixture(async () => current, undefined, cache); await f.flush();
  f.focus(false); await f.flush();
  calendar = { revision: 1, sports_workouts: [], workouts: [{ id: 'workout', scheduled_date: '2026-11-01',
    name: 'First workout', status: 'planned', notes: null, superseded_at: null, exercises: [] }] };
  current = schedule('ready');
  assert.equal(cache.peek('2026-11-01', '2026-11-01')?.fresh, true);
  // The calendar hook initially reuses the fresh empty cache on focus.
  assert.equal((await cache.load(api, '2026-11-01', '2026-11-01'))?.entries.length, 0);
  assert.equal(reads, 1);
  const unsubscribe = cache.subscribe(() => { void cache.load(api, '2026-11-01', '2026-11-01'); });
  f.focus(true); await f.flush();
  assert.equal(f.value.schedule?.initial_plan_status, 'ready'); assert.equal(f.invalidations, 1);
  assert.equal(cache.peek('2026-11-01', '2026-11-01')?.data.entries[0].title, 'First workout'); assert.equal(reads, 2);
  // Once ready, later focus events keep the fresh calendar instead of invalidating again.
  f.focus(false); await f.flush(); f.focus(true); await f.flush();
  assert.equal(f.invalidations, 1); assert.equal(reads, 2); unsubscribe();
});

test('first ready read invalidates previously cached coverage once, not on every focus', async () => {
  const f = fixture(async () => schedule('ready')); await f.flush();
  assert.equal(f.invalidations, 1); assert.equal(f.timers, 0);
  f.focus(false); await f.flush(); f.focus(true); await f.flush();
  await f.value.refresh(); await f.flush();
  assert.equal(f.invalidations, 1);
});

test('failed generation remains visible, prevents double retry and resumes after retry', async () => {
  let current = schedule('failed'); const response = deferred<PlanningJob>(); let retries = 0;
  const f = fixture(async () => current, async id => { assert.equal(id, job.id); retries++; return response.promise; });
  await f.flush(); assert.equal(f.timers, 0);
  const pending = f.value.retry(); await f.flush(); assert.equal(f.value.retrying, true);
  await f.value.retry(); assert.equal(retries, 1);
  current = schedule('queued'); response.resolve(job); await pending; await f.flush();
  assert.equal(f.value.retrying, false); assert.equal(f.timers, 1);
});

test('retry errors preserve failed plan and permit a later explicit attempt', async () => {
  const f = fixture(async () => schedule('failed'), async () => { throw new Error('Could not retry.'); });
  await f.flush(); await f.value.retry(); await f.flush();
  assert.equal(f.value.schedule?.initial_plan_status, 'failed'); assert.equal(f.value.error, 'Could not retry.');
  assert.equal(f.value.retrying, false); assert.equal(f.timers, 0);
});

test('obsolete first-plan reads and retries cannot publish into another account', async () => {
  for (const retrying of [false, true]) {
    const read = deferred<PlanningSchedule>(); const retry = deferred<PlanningJob>(); let reads = 0;
    const f = fixture(() => ++reads === 1 && !retrying ? read.promise : Promise.resolve(schedule('failed')), () => retry.promise);
    await f.flush(); const pending = retrying ? f.value.retry() : Promise.resolve();
    f.owner('b'); assert.equal(f.render().schedule, null); await f.flush();
    read.resolve(schedule('ready')); retry.resolve(job); await pending; await f.flush();
    assert.equal(f.value.userId, 'b'); assert.equal(f.value.schedule?.initial_plan_status, 'failed'); assert.equal(f.invalidations, 0);
  }
});
