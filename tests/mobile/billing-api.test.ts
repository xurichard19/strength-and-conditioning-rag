import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deferred, load } from './helpers.ts';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

function fixture() {
  const timers = new Map<number, () => void>(); let next = 0;
  const backend = load<typeof import('../../mobile/src/services/backend')>('services/backend.ts', {}, {
    setTimeout: (callback: () => void, delay: number) => {
      assert.equal(delay, 15_000); const id = ++next; timers.set(id, callback); return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  return { ...backend, expire: () => [...timers.values()].forEach(callback => callback()),
    get pendingTimers() { return timers.size; } };
}

test('billing sync bounds a stalled request without replaying it or accepting a late denial', async () => {
  const f = fixture(); const request = deferred<Response>();
  let signal: AbortSignal | null | undefined; let calls = 0; let denied = 0;
  const api = f.createBackend((path, options) => {
    assert.equal(path, '/billing/sync'); assert.equal(options?.method, 'POST');
    assert.equal(options.body, undefined);
    signal = options.signal; calls++; return request.promise;
  }, () => denied++);
  const pending = api.syncBilling();
  assert.equal(f.pendingTimers, 1); f.expire();
  await assert.rejects(pending, /Request timed out/);
  assert.equal(signal?.aborted, true); assert.equal(f.pendingTimers, 0); assert.equal(calls, 1);
  request.resolve(response({ detail: 'subscription_required' }, 403));
  await settle();
  assert.equal(denied, 0); assert.equal(calls, 1);
});

for (const status of [200, 403]) {
  test(`billing sync also times out decoding a ${status} response without late access changes`, async () => {
    const f = fixture(); let signal: AbortSignal | null | undefined; let denied = 0;
    let body!: ReadableStreamDefaultController<Uint8Array>;
    const api = f.createBackend(async (_path, options) => {
      signal = options?.signal;
      return new Response(new ReadableStream({ start(controller) { body = controller; } }), { status });
    }, () => denied++);
    const pending = api.syncBilling(); await settle();
    f.expire(); await assert.rejects(pending, /Request timed out/);
    assert.equal(signal?.aborted, true); assert.equal(f.pendingTimers, 0);
    body.enqueue(new TextEncoder().encode(JSON.stringify(status === 200
      ? { has_access: true } : { detail: 'subscription_required' })));
    body.close(); await settle();
    assert.equal(denied, 0);
  });
}

test('billing sync releases its deadline on success and API errors without automatic retries', async () => {
  const f = fixture(); let denied = 0; let calls = 0;
  const results = [response({ has_access: true }), response({ detail: 'billing_unavailable' }, 503),
    response({ detail: 'subscription_required' }, 403), response({ detail: 'conflict' }, 409)];
  const api = f.createBackend(async () => results[calls++], () => denied++);
  assert.deepEqual(await api.syncBilling(), { has_access: true });
  assert.equal(f.pendingTimers, 0);
  for (const detail of ['billing_unavailable', 'subscription_required', 'conflict']) {
    await assert.rejects(api.syncBilling(), { message: detail });
    assert.equal(f.pendingTimers, 0);
  }
  assert.equal(denied, 1); assert.equal(calls, 4);
});
