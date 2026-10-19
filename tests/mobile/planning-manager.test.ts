import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deferred, load, plain, type Stubs, type TestValue } from './helpers.ts';
import type { CalendarResponse, createBackend, PlanningChange, PlanningHistory, PlanningJob, PlanningSchedule } from '../../mobile/src/services/backend';

type Api = Pick<ReturnType<typeof createBackend>, 'getPlanningJobs' | 'getPlanningHistory'>
  & Partial<Pick<ReturnType<typeof createBackend>, 'getPlanningSchedule' | 'getCalendarRange'>>;
const calendar = load<typeof import('../../mobile/src/lib/calendar')>('lib/calendar.ts');
const { createCalendarCache } = load<typeof import('../../mobile/src/state/calendar-cache')>('state/calendar-cache.ts', {
  '../lib/calendar': calendar, './memory-cache': load('state/memory-cache.ts'),
});
const change = (revision: number): PlanningChange => ({ id: `change-${revision}`, user_id: 'a', revision,
  kind: 'refresh', status: 'applied', reason: 'Weekly refresh', effective_from: '2026-10-18',
  effective_through: '2026-11-07', horizon_end_before: null, horizon_end_after: '2026-11-07', created_at: '2026-10-18T12:00:00Z' });
const job: PlanningJob = { id: 'job', kind: 'refresh', status: 'running', reason: 'Weekly refresh',
  effective_from: null, effective_through: null, scheduled_for: null, change_id: null,
  created_at: '2026-10-18T12:00:00Z', completed_at: null };
const history = (changes: PlanningChange[] = []): PlanningHistory => ({ changes, revision: changes[0]?.revision ?? null });
const schedule = (revision = 1): PlanningSchedule => ({ user_id: 'a', horizon_days: 21, refresh_interval_days: 7,
  horizon_end: '2026-11-07', next_refresh_at: '2026-10-25T12:00:00Z', revision,
  created_at: '2026-10-18T12:00:00Z', updated_at: '2026-10-18T12:00:00Z' });

/** Exercise the actual hook across focus, account, network and timer boundaries. */
function fixture(api: Api, initialAppState = 'active') {
  const slots: TestValue[] = []; let cursor = 0; let dirty = true; let effects: (() => void)[] = [];
  let owner: string | null = 'a'; let focused = true; let timerId = 0; let clock = Date.parse('2026-10-18T12:00:00Z');
  let value!: ReturnType<typeof import('../../mobile/src/state/use-planning-manager').usePlanningManager>;
  const events = new Set<(status: string) => void>();
  const timers = new Map<number, () => void>();
  const calendarCache = createCalendarCache({ now: () => clock });
  const hooks = {
    useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState: initial => {
      const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], (update: TestValue) => { slots[i] = typeof update === 'function' ? update(slots[i]) : update; dirty = true; }];
    },
    useCallback: (fn, deps) => {
      const i = cursor++;
      if (!slots[i] || deps.some((v: unknown, j: number) => slots[i].deps[j] !== v)) slots[i] = { fn, deps };
      return slots[i].fn;
    },
  } satisfies Stubs;
  const native = { currentState: initialAppState,
    addEventListener: (_: string, fn: (state: string) => void) => { events.add(fn); return { remove: () => events.delete(fn) }; } };
  const { usePlanningManager } = load('state/use-planning-manager.ts', {
    react: hooks,
    'expo-router': { useFocusEffect: fn => {
      const i = cursor++; const prev = slots[i];
      if (prev?.fn !== fn || prev?.focused !== focused) {
        slots[i] = { fn, focused };
        effects.push(() => { prev?.cleanup?.(); if (slots[i].focused) slots[i].cleanup = fn(); });
      }
    } },
    'react-native': { AppState: native },
    '@/lib/calendar': calendar,
    '@/lib/errors': { errorMessage: error => error.message },
    '@/services/api': { backendFor: userId => { assert.equal(userId, owner); return { getPlanningSchedule: async () => null, ...api }; } },
    '@/state/app-context': { useApp: () => ({ authSession: owner ? { user: { id: owner } } : null, calendarCache }) },
  }, { Date: class extends Date { static now() { return clock; } },
    setTimeout: (fn: () => void, ms: number) => { assert.equal(ms, 10_000); timers.set(++timerId, fn); return timerId; },
    clearTimeout: (id: number) => timers.delete(id) });
  // eslint-disable-next-line react-hooks/rules-of-hooks -- deterministic React lifecycle test harness.
  function render() { cursor = 0; dirty = false; value = usePlanningManager(); return value; }
  async function flush() {
    for (let i = 0; i < 6; i++) {
      if (dirty) render();
      const work = effects; effects = []; work.forEach(fn => fn());
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  return { flush, render, calendarCache, advance: (ms: number) => { clock += ms; },
    get value() { return value; }, get timerCount() { return timers.size; },
    tick: () => { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); },
    focus: (next: boolean) => { focused = next; dirty = true; },
    owner: (next: string | null) => { owner = next; dirty = true; },
    appState: (next: string) => { native.currentState = next; events.forEach(fn => fn(next)); },
  };
}

test('planning polls active jobs, refreshes history on completion, and then stops', async () => {
  let calls = 0;
  const f = fixture({ getPlanningJobs: async () => ++calls === 1 ? [job] : [],
    getPlanningHistory: async () => history(calls > 1 ? [change(1)] : []) });
  assert.equal(f.render().loaded, false);
  await f.flush(); assert.equal(f.value.jobs.length, 1); assert.equal(f.timerCount, 1);
  f.tick(); await f.flush();
  assert.equal(f.value.jobs.length, 0); assert.equal(f.value.changes[0].revision, 1);
  assert.equal(f.timerCount, 0); assert.equal(calls, 2);
});

test('planning pauses polling off screen and in background and refreshes on return', async () => {
  let calls = 0;
  const f = fixture({ getPlanningJobs: async () => { calls++; return [job]; }, getPlanningHistory: async () => history() });
  await f.flush(); f.appState('background'); assert.equal(f.timerCount, 0);
  f.tick(); await f.flush(); assert.equal(calls, 1);
  f.appState('active'); await f.flush(); assert.equal(calls, 2);
  f.focus(false); await f.flush(); assert.equal(f.timerCount, 0);
  f.appState('active'); await f.flush(); assert.equal(calls, 2);
  f.focus(true); await f.flush(); assert.equal(calls, 3);
  f.focus(false); await f.flush();
});

test('planning does not request data when mounted in the background', async () => {
  let calls = 0;
  const f = fixture({ getPlanningJobs: async () => { calls++; return []; }, getPlanningHistory: async () => history() }, 'background');
  await f.flush(); assert.equal(calls, 0);
  f.appState('active'); await f.flush(); assert.equal(calls, 1);
});

test('idle plans reuse fresh data on return; TTL, edits and manual refresh still fetch, including before the first plan', async () => {
  for (const hasPlan of [false, true]) {
    let jobs = 0; let calendars = 0;
    const api = { getPlanningJobs: async () => { jobs++; return []; }, getPlanningHistory: async () => history(),
      getPlanningSchedule: async () => hasPlan ? schedule() : null,
      getCalendarRange: async () => { calendars++; return { workouts: [], sports_workouts: [], revision: 1 }; } };
    const f = fixture(api);
    if (hasPlan) await f.calendarCache.load(api, '2026-10-01', '2026-10-31');
    await f.flush();
    if (hasPlan) {
      assert.equal(calendars, 2);
      assert.equal(f.calendarCache.peek('2026-10-01', '2026-10-31')?.fresh, true, 'visiting Plans preserves an unchanged month');
    }
    const returnToPlans = async () => { f.focus(false); await f.flush(); f.focus(true); await f.flush(); };
    f.advance(59_999); await returnToPlans();
    f.appState('background'); f.appState('active'); await f.flush();
    assert.equal(jobs, 1); assert.equal(calendars, hasPlan ? 2 : 0);
    f.advance(1); await returnToPlans(); assert.equal(jobs, 2);
    await f.value.refresh(); await f.flush(); assert.equal(jobs, 3);
    f.focus(false); await f.flush(); f.calendarCache.invalidate(); f.focus(true); await f.flush();
    assert.equal(jobs, 4); assert.equal(calendars, hasPlan ? 5 : 0);
    assert.equal(f.timerCount, 0);
  }
});

test('planning reads history after job completion rather than leaving a stale empty history', async () => {
  const jobs = deferred<PlanningJob[]>(); let reads = 0;
  const f = fixture({ getPlanningJobs: () => jobs.promise, getPlanningHistory: async () => { reads++; return history([change(1)]); } });
  await f.flush(); assert.equal(reads, 0);
  jobs.resolve([]); await f.flush(); assert.equal(reads, 1);
  assert.equal(f.value.changes[0].revision, 1); assert.equal(f.timerCount, 0);
});

test('planning shows jobs before history finishes and preserves them if history fails', async () => {
  const pending = deferred<PlanningHistory>();
  const f = fixture({ getPlanningJobs: async () => [job], getPlanningHistory: () => pending.promise });
  await f.flush();
  assert.equal(f.value.jobs[0].id, job.id);
  assert.equal(f.value.jobsLoaded, true); assert.equal(f.value.loaded, false);
  pending.reject(new Error('history offline')); await f.flush();
  assert.equal(f.value.jobs[0].id, job.id); assert.equal(f.value.error, 'history offline');
  assert.equal(f.timerCount, 1);
  f.focus(false); await f.flush();
});

test('returning to planning keeps loaded data visible while revalidating it', async () => {
  const pending = deferred<PlanningJob[]>(); let reads = 0;
  const f = fixture({ getPlanningJobs: () => ++reads === 1 ? Promise.resolve([job]) : pending.promise,
    getPlanningHistory: async () => history([change(reads)]) });
  await f.flush(); f.focus(false); await f.flush(); f.focus(true); await f.flush();
  assert.equal(f.value.loaded, true); assert.equal(f.value.loading, false);
  assert.equal(f.value.jobs[0].id, job.id); assert.equal(f.value.changes[0].revision, 1);
  pending.resolve([]); await f.flush();
  assert.equal(f.value.jobs.length, 0); assert.equal(f.value.changes[0].revision, 2);
  assert.equal(f.value.loading, false); assert.equal(f.timerCount, 0);
});

test('poll recovery restores pagination when the first history read failed', async () => {
  let reads = 0;
  const f = fixture({ getPlanningJobs: async () => [job], getPlanningHistory: async () => {
    if (++reads === 1) throw new Error('offline');
    return history(Array.from({ length: 20 }, (_, i) => change(30 - i)));
  } });
  await f.flush(); assert.equal(f.value.loaded, false); assert.equal(f.value.hasMore, false);
  f.tick(); await f.flush();
  assert.equal(f.value.loaded, true); assert.equal(f.value.hasMore, true); assert.equal(f.value.error, null);
  f.focus(false); await f.flush();
});

test('resuming or editing during an outstanding read queues a fresh read', async () => {
  for (const event of ['resume', 'edit']) {
    const old = deferred<PlanningHistory>(); let reads = 0;
    const f = fixture({ getPlanningJobs: async () => [], getPlanningHistory: () => ++reads === 1 ? old.promise : Promise.resolve(history([change(2)])) });
    await f.flush();
    if (event === 'resume') { f.appState('background'); f.appState('active'); }
    else f.calendarCache.invalidate();
    old.resolve(history([change(1)])); await f.flush();
    assert.equal(reads, 2); assert.equal(f.value.changes[0].revision, 2); assert.equal(f.value.loading, false);
  }
});

test('late planning responses cannot cross accounts or restore signed-out data', async () => {
  const old = deferred<PlanningHistory>(); const oldSchedule = deferred<PlanningSchedule>(); let reads = 0;
  const f = fixture({ getPlanningJobs: async () => [],
    getPlanningHistory: () => ++reads === 1 ? old.promise : Promise.resolve(history([change(2)])),
    getPlanningSchedule: () => reads === 1 ? oldSchedule.promise : Promise.resolve(null) });
  await f.flush(); f.owner('b'); assert.equal(f.render().loaded, false); await f.flush();
  old.resolve(history([change(1)])); oldSchedule.resolve(schedule()); await f.flush();
  assert.equal(f.value.changes[0].revision, 2);
  assert.equal(f.value.schedule, null); assert.equal(f.value.calendar, null); assert.equal(f.value.overviewLoaded, true);
  f.owner(null); assert.deepEqual(plain(f.render().changes), []); await f.flush();
  await f.value.refresh(); assert.equal(reads, 2); assert.match(f.value.error ?? '', /Sign in/);
});

test('planning keeps loaded history on errors, reports stale data and supports retry', async () => {
  let fail = false;
  const f = fixture({ getPlanningJobs: async () => [], getPlanningHistory: async () => {
    if (fail) throw new Error('offline'); return history([change(3)]);
  } });
  await f.flush(); fail = true; await f.value.refresh(); await f.flush();
  assert.equal(f.value.error, 'offline'); assert.equal(f.value.changes[0].revision, 3); assert.equal(f.value.loading, false);
  fail = false; await f.value.refresh(); await f.flush(); assert.equal(f.value.error, null);
});

test('planning pages by revision without overlapping requests and preserves older entries during polling', async () => {
  const cursors: (number | undefined)[] = [];
  let overviewReads = 0;
  const older = deferred<PlanningHistory>(); let firstPage = Array.from({ length: 20 }, (_, i) => change(30 - i));
  const f = fixture({ getPlanningJobs: async () => [job], getPlanningSchedule: async () => { overviewReads++; return null; }, getPlanningHistory: before => {
    cursors.push(before); return before === undefined ? Promise.resolve(history(firstPage)) : older.promise;
  } });
  await f.flush(); assert.equal(f.value.hasMore, true);
  const load = f.value.loadMore(); await f.flush(); assert.equal(f.value.loadingMore, true);
  await f.value.loadMore(); await f.value.refresh(); assert.deepEqual(cursors, [undefined, 11]);
  older.resolve(history([change(10)])); await load; await f.flush();
  assert.equal(overviewReads, 1);
  assert.equal(f.value.changes.length, 21); assert.equal(f.value.hasMore, false);
  firstPage = [change(31), ...firstPage.slice(0, 19)]; f.tick(); await f.flush();
  assert.equal(f.value.changes.length, 22); assert.equal(f.value.changes[0].revision, 31);
  assert.equal(f.value.changes.at(-1)?.revision, 10); assert.equal(f.value.hasMore, false);
  f.focus(false); await f.flush();
});

test('overview loads independently, avoids calendar reads on unchanged polls, and refreshes changed coverage', async () => {
  const jobs = deferred<PlanningJob[]>(); let current = schedule(); let overviewReads = 0;
  let calendarRead = deferred<CalendarResponse>();
  const ranges: string[][] = [];
  const f = fixture({ getPlanningJobs: () => jobs.promise, getPlanningHistory: async () => history([change(current.revision)]),
    getPlanningSchedule: async () => { overviewReads++; return current; },
    getCalendarRange: (start, end) => { ranges.push([start, end]); return calendarRead.promise; } });
  await f.flush(); assert.equal(overviewReads, 0);
  jobs.resolve([job]); await f.flush();
  assert.equal(f.value.loaded, true); assert.equal(f.value.overviewLoaded, false);
  assert.equal(f.value.schedule?.revision, 1); assert.deepEqual(ranges, [['2026-10-18', '2026-11-07']]);
  calendarRead.resolve({ workouts: [], sports_workouts: [], revision: 1 }); await f.flush();
  assert.equal(f.value.overviewLoaded, true); assert.equal(f.value.calendar?.revision, 1);
  f.tick(); await f.flush(); assert.equal(overviewReads, 2); assert.equal(ranges.length, 1);

  current = { ...schedule(2), horizon_days: 60 }; calendarRead = deferred<CalendarResponse>();
  f.tick(); await f.flush();
  assert.equal(f.value.changes[0].revision, 2); assert.equal(f.value.calendar, null);
  assert.deepEqual(ranges[1], ['2026-10-08', '2026-11-07']);
  calendarRead.reject(new Error('calendar offline')); await f.flush();
  assert.equal(f.value.error, null); assert.equal(f.value.overviewError, 'calendar offline');
  assert.equal(f.value.overviewLoaded, false);

  calendarRead = deferred<CalendarResponse>();
  const retry = f.value.refresh(); await f.flush();
  calendarRead.resolve({ workouts: [], sports_workouts: [], revision: 2 }); await retry; await f.flush();
  assert.equal(f.value.overviewError, null); assert.equal(f.render().calendar?.revision, 2);
  assert.equal(f.value.overviewLoaded, true);
  await f.value.refresh(); await f.flush(); assert.equal(ranges.length, 4);
  f.focus(false); await f.flush();
});
