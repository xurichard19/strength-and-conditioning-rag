import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './helpers.ts';
import type { ApiRequest, PlanningChangePreview, PlanningHistory, PlanningJob } from '../../mobile/src/services/backend';

const { createBackend } = load<typeof import('../../mobile/src/services/backend')>('services/backend.ts');
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const job: PlanningJob = { id: 'job', kind: 'refresh', status: 'running', reason: 'Weekly refresh',
  effective_from: null, effective_through: null, scheduled_for: null, change_id: null,
  created_at: '2026-10-18T12:00:00Z', completed_at: null };
const history: PlanningHistory = { changes: [{ id: 'change', user_id: 'user', revision: 3, kind: 'refresh',
  status: 'applied', reason: 'Weekly refresh', effective_from: '2026-10-18', effective_through: '2026-11-07',
  horizon_end_before: null, horizon_end_after: '2026-11-07', created_at: '2026-10-18T12:00:00Z' }], revision: 3 };
const preview: PlanningChangePreview = { change: history.changes[0], before: [], after: [{
  id: 'workout', scheduled_date: '2026-10-19', name: 'Strength', notes: null, status: 'planned',
  superseded_at: null, exercises: [{ id: 'exercise', name: 'Squat' }],
}], revision: 3 };

test('planning reads use authenticated GETs and encode preview ids as one path segment', async () => {
  const calls: string[] = [];
  const request: ApiRequest = async (path, options) => {
    calls.push(path);
    assert.equal(options?.method ?? 'GET', 'GET');
    assert.equal(options?.body, undefined);
    assert.ok(options?.signal instanceof AbortSignal);
    return response(path.startsWith('/planning/jobs') ? [job]
      : path.startsWith('/planning/changes?') ? history : preview);
  };
  const api = createBackend(request);
  assert.deepEqual(await api.getPlanningJobs(), [job]);
  assert.deepEqual(await api.getPlanningHistory(), history);
  assert.deepEqual(await api.getPlanningChange('a/b?c#d'), preview);
  assert.deepEqual(calls, ['/planning/jobs?limit=20', '/planning/changes?limit=20', '/planning/changes/a%2Fb%3Fc%23d']);
});

test('planning history preserves revision cursors, zero, and empty pages', async () => {
  const calls: string[] = [];
  const empty = { changes: [], revision: null };
  const api = createBackend(async path => { calls.push(path); return response(calls.length === 1 ? history : empty); });
  assert.deepEqual(await api.getPlanningHistory(3), history);
  assert.deepEqual(await api.getPlanningHistory(0), empty);
  assert.deepEqual(calls, ['/planning/changes?limit=20&before_revision=3', '/planning/changes?limit=20&before_revision=0']);
});

test('planning reads surface API failures without retrying or falling back to empty data', async () => {
  let calls = 0;
  const api = createBackend(async () => { calls++; return response({ detail: 'Sign in again.' }, 401); });
  await assert.rejects(api.getPlanningJobs(), /Sign in again\./);
  await assert.rejects(api.getPlanningHistory(), /Sign in again\./);
  await assert.rejects(api.getPlanningChange('missing'), /Sign in again\./);
  assert.equal(calls, 3);
});
