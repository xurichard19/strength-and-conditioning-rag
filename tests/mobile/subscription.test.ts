import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Purchases from 'react-native-purchases';
import type { CustomerInfo, PurchasesOffering } from 'react-native-purchases';
import type { BillingStatus } from '../../mobile/src/services/backend';
import type { PurchasesAdapter } from '../../mobile/src/services/purchases';
import { deferred, load, jsx, nodes, type TestValue, type TestNode, type TestModule } from './helpers.ts';

const logic = load<typeof import('../../mobile/src/state/subscription-store')>('state/subscription-store.ts');
const adapterModule = load<typeof import('../../mobile/src/services/purchases')>('services/purchases.ts', {
  'react-native': { Platform: { OS: 'ios' }, NativeModules: {} },
});
const backend = load<typeof import('../../mobile/src/services/backend')>('services/backend.ts');
const status = (has_access = false): BillingStatus => ({ enabled: true, has_access, entitlement: 'arcel_pro',
  phase: has_access ? 'paid' : 'inactive', product_id: has_access ? 'annual' : null,
  expires_at: has_access ? '2099-01-01T00:00:00Z' : null, will_renew: has_access, verified_at: '2026-09-19T00:00:00Z' });
const billingOff = (): BillingStatus => ({ ...status(), enabled: false, has_access: true, will_renew: null, verified_at: null });
const info = (active = false) => ({ entitlements: { active: active ? { arcel_pro: { isActive: true } } : {} } }) as CustomerInfo;
const offering = { monthly: {}, annual: {} } as PurchasesOffering;
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

function fixture(overrides: Partial<PurchasesAdapter> = {}, enabled = true) {
  let value = status();
  let read: (id: string) => Promise<BillingStatus> = async () => value;
  let sync: (id: string) => Promise<BillingStatus> = async () => value;
  const calls: string[] = [];
  const lostAccess: string[] = [];
  const purchases: PurchasesAdapter = {
    identify: async id => { calls.push(`identify:${id}`); }, customerInfo: async () => info(),
    restore: async () => info(), offering: async () => offering, paywall: async () => 'purchased',
    manage: async () => {}, subscribe: () => () => {}, ...overrides,
  };
  const store = logic.createSubscriptionStore({ enabled, purchases, onAccessLost: id => { lostAccess.push(id); }, api: id => ({
    getBillingStatus: () => { calls.push(`read:${id}`); return read(id); },
    syncBilling: () => { calls.push(`sync:${id}`); return sync(id); },
  }) });
  return { store, calls, lostAccess, setStatus: (next: BillingStatus) => { value = next; },
    setRead: (next: typeof read) => { read = next; }, setSync: (next: typeof sync) => { sync = next; } };
}

function timedBillingSync(request: Parameters<typeof backend.createBackend>[0]) {
  const timers = new Set<() => void>();
  const timedBackend = load<typeof import('../../mobile/src/services/backend')>('services/backend.ts', {}, {
    setTimeout: (callback: () => void, delay: number) => {
      assert.equal(delay, 15_000); timers.add(callback); return callback;
    },
    clearTimeout: (callback: () => void) => { timers.delete(callback); },
  });
  return { api: timedBackend.createBackend(request), expire() {
    assert.equal(timers.size, 1);
    for (const callback of [...timers]) callback();
  }, timers };
}

test('disabled billing performs no SDK or backend calls and preserves existing destinations', async () => {
  const f = fixture({}, false); f.store.setUser('a'); await f.store.refresh(); await f.store.purchase();
  assert.deepEqual(f.calls, []);
  for (const destination of ['/(tabs)/today', '/chat', '/(tabs)/you'] as const) {
    assert.equal(logic.subscriptionDestination(false, 'a', f.store.getSnapshot(), destination), destination);
  }
  for (const platform of ['android', 'web']) {
    const module = load<typeof import('../../mobile/src/services/purchases')>('services/purchases.ts', {
      'react-native': { Platform: { OS: platform }, NativeModules: {} },
    });
    assert.equal(module.billingEnabled, false);
    await module.purchases.identify('a');
  }
});

test('enabled gate rejects unknown and other-account access, but trusts server time for a paid grant', async () => {
  const f = fixture();
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), false);
  f.store.setUser('a'); await flush();
  assert.equal(logic.subscriptionDestination(true, 'a', f.store.getSnapshot()), '/paywall');
  f.setStatus(status(true)); await f.store.refresh();
  assert.equal(logic.subscriptionDestination(true, 'a', f.store.getSnapshot(), '/chat'), '/chat');
  assert.equal(logic.subscriptionAllowsAccess(true, 'b', f.store.getSnapshot()), false);
  f.setStatus({ ...status(true), expires_at: '2000-01-01T00:00:00Z' }); await f.store.refresh();
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), true);
  f.setRead(async () => { throw new Error('offline'); }); await f.store.refresh();
  assert.equal(f.store.getSnapshot().status?.has_access, true);
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), true);
  assert.match(f.store.getSnapshot().error!, /Could not verify/);
});

test('network, timeout, rate-limit and service failures preserve a previously paid screen until recovery', async () => {
  for (const failure of [new Error('offline'), new Error('timeout'), new backend.BackendError(408, 'timeout'),
    new backend.BackendError(429, 'busy'), new backend.BackendError(503, 'billing_unavailable')]) {
    const f = fixture(); f.setStatus(status(true)); f.store.setUser('a'); await flush();
    f.setRead(async () => { throw failure; }); await f.store.refresh();
    assert.equal(logic.subscriptionDestination(true, 'a', f.store.getSnapshot()), '/(tabs)/today');
    assert.match(f.store.getSnapshot().error!, /Could not verify/);
    assert.deepEqual(f.lostAccess, []);
    const retry = deferred<BillingStatus>(); f.setRead(() => retry.promise);
    const retrying = f.store.refresh();
    assert.equal(f.store.getSnapshot().loading, true);
    assert.ok(f.store.getSnapshot().error, 'keep the warning visible while retrying');
    retry.resolve(status(true)); await retrying;
    assert.equal(f.store.getSnapshot().error, null);
  }
});

test('SDK and unpaid statuses cannot become an outage grant', async () => {
  for (const previous of [null, status()]) {
    const f = fixture({ customerInfo: async () => info(true) });
    if (previous) f.setStatus(previous);
    else f.setRead(async () => { throw new Error('offline'); });
    f.store.setUser('a'); await flush();
    f.setRead(async () => { throw new backend.BackendError(503, 'billing_unavailable'); });
    await f.store.refresh();
    assert.equal(f.store.getSnapshot().status, null);
    assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), false);
  }
});

test('backend billing-off access survives failed refresh and soft invalidation until confirmed denial', async () => {
  const granted = billingOff();
  const f = fixture(); f.setStatus(granted); f.store.setUser('a'); await flush();
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), true);
  for (const failure of [new Error('offline'), new backend.BackendError(503, 'unavailable')]) {
    f.setRead(async () => { throw failure; }); await f.store.refresh();
    assert.equal(f.store.getSnapshot().status, granted);
    assert.equal(logic.subscriptionDestination(true, 'a', f.store.getSnapshot()), '/(tabs)/today');
    assert.ok(f.store.getSnapshot().error);
    assert.deepEqual(f.lostAccess, []);
  }
  const retry = deferred<BillingStatus>(); f.setRead(() => retry.promise);
  f.store.invalidate('a');
  assert.equal(f.store.getSnapshot().status, granted);
  assert.ok(f.store.getSnapshot().error, 'the retry warning stays visible while checking');
  retry.resolve(granted); await flush();
  assert.equal(f.store.getSnapshot().error, null);
  f.setRead(async () => status()); await f.store.refresh();
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), false);
  assert.deepEqual(f.lostAccess, ['a']);
});

for (const granted of [status(true), billingOff()]) test(`authentication and non-transient errors clear the server grant (billing ${granted.enabled ? 'on' : 'off'})`, async () => {
  for (const httpStatus of [400, 401, 403]) {
    const f = fixture(); f.setStatus(granted); f.store.setUser('a'); await flush();
    f.setRead(async () => { throw new backend.BackendError(httpStatus, 'request rejected'); });
    await f.store.refresh();
    assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), false);
    if (httpStatus === 401) assert.match(f.store.getSnapshot().error!, /session.*sign in again/);
    assert.deepEqual(f.lostAccess, [], 'a generic HTTP error is not an exact subscription-required denial');
  }
});

test('backend status is authoritative even when the SDK has no active entitlement', async () => {
  const f = fixture(); f.setStatus(status(true)); f.store.setUser('a'); await flush();
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), true);
  assert.equal(logic.hasSDKEntitlement(info()), false);
});

test('only confirmed access loss clears protected memory; verification failures preserve the previous-grant latch', async () => {
  const f = fixture(); f.setStatus(status(true)); f.store.setUser('a'); await flush();
  const read = deferred<BillingStatus>(); f.setRead(() => read.promise);
  const refreshing = f.store.refresh();
  assert.deepEqual(f.lostAccess, []);
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), true);
  read.resolve(status(true)); await refreshing;
  assert.deepEqual(f.lostAccess, []);
  f.setRead(async () => status()); await f.store.refresh();
  assert.deepEqual(f.lostAccess, ['a']);
  await f.store.refresh(); assert.deepEqual(f.lostAccess, ['a']);
  f.setRead(async () => status(true)); await f.store.refresh();
  f.store.deny('other'); assert.deepEqual(f.lostAccess, ['a']);
  f.store.deny('a'); assert.deepEqual(f.lostAccess, ['a', 'a']);
  await flush();
  f.setRead(async () => { throw new Error('offline'); }); await f.store.refresh();
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), true);
  assert.deepEqual(f.lostAccess, ['a', 'a']);
  f.setRead(async () => status()); await f.store.refresh();
  assert.deepEqual(f.lostAccess, ['a', 'a', 'a']);
  await f.store.refresh(); assert.deepEqual(f.lostAccess, ['a', 'a', 'a']);
});

test('expiry re-verification keeps the paid screen until the server confirms renewal or denial', async () => {
  const f = fixture(); f.setStatus(status(true)); f.store.setUser('a'); await flush();
  const read = deferred<BillingStatus>(); f.setRead(() => read.promise);
  f.store.invalidate('a');
  assert.equal(f.store.getSnapshot().status?.has_access, true);
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), true);
  assert.deepEqual(f.lostAccess, []);
  read.resolve(status(true)); await flush();
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), true);
  assert.deepEqual(f.lostAccess, []);
  f.setRead(async () => status()); f.store.invalidate('a'); await flush();
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), false);
  assert.deepEqual(f.lostAccess, ['a']);
});

for (const granted of [status(true), billingOff()]) test(`exact API denial clears once after an outage and fences an older grant (billing ${granted.enabled ? 'on' : 'off'})`, async () => {
  const f = fixture(); f.setStatus(granted); f.store.setUser('a'); await flush();
  f.setRead(async () => { throw new Error('billing_unavailable'); }); await f.store.refresh();
  assert.deepEqual(f.lostAccess, []);
  const old = deferred<BillingStatus>(); let reads = 0;
  f.setRead(() => ++reads === 1 ? old.promise : Promise.resolve(status()));
  const refreshing = f.store.refresh(); f.store.deny('a'); await flush();
  assert.deepEqual(f.lostAccess, ['a']);
  old.resolve(granted); await refreshing;
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), false);
  f.store.deny('a'); await flush(); assert.deepEqual(f.lostAccess, ['a']);
});

test('API denial fences a purchase-management verification that started before the denial', async () => {
  const f = fixture(); f.setStatus(status(true)); f.store.setUser('a'); await flush();
  const syncing = deferred<BillingStatus>(); f.setSync(() => syncing.promise);
  const manage = f.store.manage(); await flush();
  f.setStatus(status()); f.store.deny('a');
  assert.deepEqual(f.lostAccess, ['a']);
  const grants: boolean[] = []; const stop = f.store.subscribe(() => { grants.push(Boolean(f.store.getSnapshot().status?.has_access)); });
  syncing.resolve(status(true)); await manage; await flush(); stop();
  assert.equal(grants.includes(true), false);
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), false);
});

test('late verification cannot clear a replacement account protected data', async () => {
  const f = fixture(); f.setStatus(status(true)); f.store.setUser('a'); await flush();
  const read = deferred<BillingStatus>(); f.setRead(id => id === 'a' ? read.promise : Promise.resolve(status(true)));
  const refresh = f.store.refresh(); f.store.setUser('b'); await flush();
  read.resolve(status()); await refresh;
  assert.deepEqual(f.lostAccess, []);
  assert.equal(logic.subscriptionAllowsAccess(true, 'b', f.store.getSnapshot()), true);
});

test('late account reads and failures cannot overwrite the next account or logout', async () => {
  for (const reject of [false, true]) {
    const pending = deferred<BillingStatus>(); const f = fixture();
    f.setRead(id => id === 'a' ? pending.promise : Promise.resolve(status()));
    f.store.setUser('a'); f.store.setUser('b'); await flush();
    if (reject) pending.reject(new Error('old')); else pending.resolve(status(true));
    await flush(); assert.equal(f.store.getSnapshot().owner, 'b');
    assert.equal(f.store.getSnapshot().status?.has_access, false);
    assert.equal(f.store.getSnapshot().error, null);
    f.store.setUser(null);
    assert.equal(logic.subscriptionAllowsAccess(true, null, f.store.getSnapshot()), false);
  }
});

for (const granted of [status(true), billingOff()]) test(`account change and signout discard an outage grant and fence older responses (billing ${granted.enabled ? 'on' : 'off'})`, async () => {
  for (const nextUser of ['b', null]) {
    const f = fixture(); f.setStatus(granted); f.store.setUser('a'); await flush();
    f.setRead(async () => { throw new Error('offline'); }); await f.store.refresh();
    assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), true);
    const old = deferred<BillingStatus>();
    f.setRead(id => id === 'a' ? old.promise : Promise.reject(new Error('offline')));
    const refreshing = f.store.refresh(); f.store.setUser(nextUser); await flush();
    assert.equal(logic.subscriptionAllowsAccess(true, nextUser, f.store.getSnapshot()), false);
    old.resolve(granted); await refreshing;
    assert.equal(f.store.getSnapshot().owner, nextUser);
    assert.equal(f.store.getSnapshot().status, null);
  }
});

test('purchase cannot sync or unlock a replacement account', async () => {
  const purchase = deferred<'purchased'>();
  const f = fixture({ paywall: () => purchase.promise });
  f.store.setUser('a'); await flush(); const pending = f.store.purchase(); await flush();
  f.store.setUser('b'); await flush(); purchase.resolve('purchased'); await pending;
  assert.equal(f.store.getSnapshot().owner, 'b');
  assert.equal(f.calls.some(call => call.startsWith('sync:')), false);
  assert.equal(f.store.getSnapshot().busy, null);
});

test('confirmed purchase remains locked and cannot repeat while server propagation is pending', async () => {
  let purchases = 0;
  const f = fixture({ paywall: async () => { purchases++; return 'purchased'; } });
  f.store.setUser('a'); await flush(); await f.store.purchase();
  assert.equal(f.store.getSnapshot().confirming, true);
  assert.match(f.store.getSnapshot().error!, /purchase is confirmed/);
  await f.store.purchase(); assert.equal(purchases, 1);
  f.setStatus(status(true)); await f.store.refresh();
  assert.equal(f.store.getSnapshot().confirming, false);
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), true);
});

test('failed purchase reconciliation is retried as sync without another purchase', async () => {
  const f = fixture(); f.store.setUser('a'); await flush();
  f.setSync(async () => { throw new Error('billing_unavailable'); }); await f.store.purchase();
  assert.equal(f.store.getSnapshot().status, null);
  assert.equal(f.store.getSnapshot().confirming, true);
  f.setSync(async () => status(true)); await f.store.refresh();
  assert.equal(f.store.getSnapshot().status?.has_access, true);
  assert.equal(f.calls.filter(call => call === 'sync:a').length, 2);
});

test('purchase, restore, and management sync timeouts clear busy and recover without repeating the native action', async () => {
  for (const kind of ['purchase', 'restore', 'manage'] as const) {
    let nativeCalls = 0; let syncs = 0; let signal: AbortSignal | null | undefined;
    const late = deferred<Response>();
    const http = timedBillingSync(async (path, options) => {
      assert.equal(path, '/billing/sync');
      if (++syncs === 1) { signal = options?.signal; return late.promise; }
      return new Response(JSON.stringify(status(true)));
    });
    const f = fixture({
      paywall: async () => { nativeCalls++; return 'purchased'; },
      restore: async () => { nativeCalls++; return info(true); },
      manage: async () => { nativeCalls++; },
    });
    f.setStatus(status(kind !== 'purchase')); f.setSync(() => http.api.syncBilling());
    f.store.setUser('a'); await flush();
    const pending = f.store[kind](); await flush();
    assert.equal(f.store.getSnapshot().busy, kind);
    http.expire(); await pending;
    const failed = f.store.getSnapshot();
    assert.equal(failed.busy, null); assert.equal(failed.loading, false);
    assert.equal(failed.status?.has_access ?? false, kind !== 'purchase');
    assert.equal(logic.subscriptionAllowsAccess(true, 'a', failed), kind !== 'purchase');
    assert.equal(failed.confirming, kind !== 'manage');
    assert.match(failed.error!, kind === 'purchase' ? /purchase is confirmed/
      : kind === 'restore' ? /was restored/ : /Could not verify/);
    assert.deepEqual(f.lostAccess, []);
    assert.equal(signal?.aborted, true); assert.equal(http.timers.size, 0);
    assert.equal(syncs, 1, 'timing out must not automatically retry the request');
    if (kind !== 'manage') { await f.store.purchase(); assert.equal(nativeCalls, 1); }

    f.setStatus(status(true)); await f.store.refresh();
    assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), true);
    assert.equal(f.store.getSnapshot().confirming, false);
    assert.equal(f.store.getSnapshot().error, null);
    assert.equal(nativeCalls, 1);
    assert.equal(syncs, kind === 'manage' ? 1 : 2);
    const recovered = f.store.getSnapshot();
    late.resolve(new Response(JSON.stringify(status()))); await flush();
    assert.equal(f.store.getSnapshot(), recovered, 'a late response cannot undo successful recovery');
    assert.deepEqual(f.lostAccess, []);
  }
});

test('a timed-out billing grant cannot override a later denial or unlock a replacement account', async () => {
  for (const replaceAccount of [false, true]) {
    const late = deferred<Response>();
    const http = timedBillingSync(async () => late.promise);
    const f = fixture(); f.setStatus(status(true)); f.setSync(() => http.api.syncBilling());
    f.store.setUser('a'); await flush();
    const pending = f.store.manage(); await flush(); http.expire(); await pending;
    f.setStatus(status());
    if (replaceAccount) f.store.setUser('b'); else f.store.deny('a');
    await flush();
    const denied = f.store.getSnapshot();
    late.resolve(new Response(JSON.stringify(status(true)))); await flush();
    assert.equal(f.store.getSnapshot(), denied);
    assert.equal(denied.owner, replaceAccount ? 'b' : 'a');
    assert.equal(logic.subscriptionAllowsAccess(true, denied.owner, denied), false);
    assert.deepEqual(f.lostAccess, replaceAccount ? [] : ['a']);
  }
});

test('both explicit and paywall empty restores report no purchase without trapping the user', async () => {
  for (const native of [false, true]) {
    const f = fixture({ paywall: async () => 'restored' }); f.store.setUser('a'); await flush();
    await (native ? f.store.purchase() : f.store.restore());
    assert.equal(f.store.getSnapshot().confirming, false);
    assert.equal(f.store.getSnapshot().error, null);
    assert.match(f.store.getSnapshot().message!, /No active subscription/);
    assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), false);
  }
});

test('restored SDK entitlement waits for backend confirmation', async () => {
  const f = fixture({ restore: async () => info(true) }); f.store.setUser('a'); await flush(); await f.store.restore();
  assert.equal(f.store.getSnapshot().confirming, true);
  assert.match(f.store.getSnapshot().error!, /restored/);
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), false);
});

test('explicit and paywall restores report completion only after server-confirmed access', async () => {
  for (const native of [false, true]) {
    const f = fixture({ paywall: async () => 'restored' });
    f.store.setUser('a'); await flush(); f.setStatus(status(true));
    await (native ? f.store.purchase() : f.store.restore());
    assert.equal(f.store.getSnapshot().message, 'Restore complete. Arcel Pro is active.');
    assert.equal(f.store.getSnapshot().error, null);
    assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), true);
  }
});

test('one restore retains completion feedback through a queued SDK refresh and ignores duplicate taps', async () => {
  const restored = deferred<CustomerInfo>(); let restores = 0;
  const f = fixture({ restore: () => { restores++; return restored.promise; } });
  f.setStatus(status(true)); f.store.setUser('a'); await flush();
  const pending = f.store.restore(); await flush();
  await f.store.restore(); f.store.sdkChanged();
  assert.equal(restores, 1);
  assert.equal(f.store.getSnapshot().message, null);
  assert.equal(f.store.getSnapshot().busy, 'restore');
  restored.resolve(info(true)); await pending; await flush();
  assert.equal(f.calls.filter(call => call === 'sync:a').length, 2);
  assert.equal(f.store.getSnapshot().busy, null);
  assert.equal(f.store.getSnapshot().message, 'Restore complete. Arcel Pro is active.');
});

test('restore completion cannot survive a new operation, denial, failed check, expiry, or account change', async () => {
  for (const change of ['operation', 'denial', 'failure', 'expiry', 'account']) {
    const f = fixture({ paywall: async () => 'cancelled' });
    f.setStatus(status(true)); f.store.setUser('a'); await flush(); await f.store.restore();
    assert.match(f.store.getSnapshot().message!, /Restore complete/);
    if (change === 'operation') await f.store.purchase();
    if (change === 'denial') { f.setStatus(status()); await f.store.refresh(); }
    if (change === 'failure') { f.setRead(async () => { throw new Error('offline'); }); await f.store.refresh(); }
    if (change === 'expiry') { f.store.invalidate('a'); await flush(); }
    if (change === 'account') { f.store.setUser('b'); await flush(); }
    assert.equal(f.store.getSnapshot().message, null, change);
    f.setRead(async () => status(true)); await f.store.refresh();
    assert.equal(f.store.getSnapshot().message, null, `${change} cannot resurrect old completion`);
  }
});

test('confirmed trial and grace periods stop purchase-sync waiting and recover through management', async () => {
  for (const phase of ['trial', 'grace'] as const) {
    for (const restore of [false, true]) {
      let purchases = 0;
      const f = fixture({ paywall: async () => { purchases++; return 'purchased'; }, restore: async () => info(true) });
      f.store.setUser('a'); await flush();
      f.setStatus({ ...status(), phase, expires_at: '2099-01-01T00:00:00Z' });
      await (restore ? f.store.restore() : f.store.purchase());
      const value = f.store.getSnapshot();
      assert.equal(logic.subscriptionAllowsAccess(true, 'a', value), false);
      assert.equal(value.confirming, false); assert.equal(value.error, null);
      assert.match(value.message!, phase === 'trial' ? /trial period.*confirmed payment/ : /payment needs attention.*Manage your subscription/);
      const previousPurchases = purchases;
      await f.store.purchase(); assert.equal(purchases, previousPurchases, 'an existing non-paid period does not prompt another purchase');
      await f.store.refresh(); assert.equal(f.store.getSnapshot().confirming, false);
      f.setStatus(status(true)); await f.store.manage();
      assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), true);
      assert.equal(f.store.getSnapshot().message, null);
    }
  }
});

test('trial and grace discovered after an unavailable purchase check replace the syncing message', async () => {
  for (const phase of ['trial', 'grace'] as const) {
    const f = fixture(); f.store.setUser('a'); await flush();
    f.setSync(async () => { throw new Error('offline'); }); await f.store.purchase();
    assert.equal(f.store.getSnapshot().confirming, true);
    f.setSync(async () => ({ ...status(), phase })); await f.store.refresh();
    assert.equal(f.store.getSnapshot().confirming, false); assert.equal(f.store.getSnapshot().error, null);
    assert.equal(f.store.getSnapshot().message, logic.subscriptionRecoveryMessage({ ...status(), phase }));
  }
});

test('Customer Center verification failure keeps paid access; presentation failure does not invent access', async () => {
  const f = fixture(); f.setStatus(status(true)); f.store.setUser('a'); await flush();
  f.setSync(async () => { throw new Error('503'); }); await f.store.manage();
  assert.equal(f.store.getSnapshot().status?.has_access, true);
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), true);
  assert.deepEqual(f.lostAccess, []);
  f.setSync(async () => status()); await f.store.manage(); assert.deepEqual(f.lostAccess, ['a']);
  const unavailable = fixture({ manage: async () => { throw new Error('Use a development build'); } });
  unavailable.store.setUser('a'); await flush(); await unavailable.store.manage();
  assert.match(unavailable.store.getSnapshot().message!, /development build/);
  assert.equal(unavailable.store.getSnapshot().busy, null);
});

test('pending payment and cancellation codes produce distinct states without unlocking', async () => {
  for (const code of ['1', '20', '10', '6']) {
    const f = fixture({ paywall: async () => { throw { code }; } }); f.store.setUser('a'); await flush();
    await f.store.purchase(); assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), false);
    assert.equal(f.store.getSnapshot().confirming, code === '20');
    if (code === '1') assert.equal(f.store.getSnapshot().message, null);
    if (code === '20') assert.match(f.store.getSnapshot().message!, /awaiting approval/);
    if (code === '10') assert.match(f.store.getSnapshot().message!, /connection/);
    if (code === '6') assert.match(f.store.getSnapshot().message!, /Restore/);
  }
});

test('API denial and SDK signals during cancelled native UI run their queued refresh', async () => {
  for (const sdk of [false, true]) {
    const pending = deferred<'cancelled'>(); const f = fixture({ paywall: () => pending.promise });
    f.store.setUser('a'); await flush(); const purchase = f.store.purchase(); await flush();
    if (sdk) f.store.sdkChanged(); else f.store.deny('a');
    f.setStatus(status(true)); pending.resolve('cancelled'); await purchase; await flush();
    assert.equal(f.store.getSnapshot().status?.has_access, true);
    assert.equal(f.calls.includes(sdk ? 'sync:a' : 'read:a'), true);
  }
});

test('SDK adapter serializes identity changes and refuses a queued purchase from the old account', async () => {
  let user = ''; let configured = 0; let reads = 0; const changes: string[] = [];
  const core = { configure: (config: { appUserID: string }) => { user = config.appUserID; configured++; },
    getAppUserID: async () => user, addCustomerInfoUpdateListener: () => {},
    isAnonymous: async () => user === 'anonymous', logIn: async (id: string) => { user = id; changes.push(id); },
    logOut: async () => { user = 'anonymous'; changes.push('logout'); },
    getCustomerInfo: async () => { reads++; return info(); },
  } as unknown as typeof Purchases;
  const adapter = adapterModule.createPurchasesAdapter({ enabled: true, apiKey: 'test_public',
    loadCore: async () => core, loadUI: async () => { throw new Error('must not load'); }, nativeUIAvailable: () => false });
  await adapter.identify('a');
  const stale = adapter.customerInfo('a'); const login = adapter.identify('b');
  await assert.rejects(stale, /account changed/); await login;
  await adapter.identify(null); await adapter.identify('c');
  assert.equal(configured, 1); assert.equal(reads, 0); assert.deepEqual(changes, ['b', 'logout', 'c']);
  await assert.rejects(adapter.manage('c'), /development build/);
});

test('billing HTTP calls are scoped, empty-body, and subscription-required notifications retain error status', async () => {
  const calls: TestValue[] = []; let denied = 0;
  const api = backend.createBackend(async (path, options) => {
    calls.push([path, options]); return new Response(JSON.stringify(status()), { status: 200 });
  });
  await api.getBillingStatus(); await api.syncBilling();
  assert.deepEqual(calls.map(call => call[0]), ['/billing/status', '/billing/sync']);
  assert.ok(calls[0][1].signal instanceof AbortSignal);
  assert.equal(calls[0][1].body, undefined);
  assert.equal(calls[1][1].method, 'POST');
  assert.equal(calls[1][1].body, undefined);
  assert.ok(calls[1][1].signal instanceof AbortSignal);
  const failing = backend.createBackend(async () => new Response(JSON.stringify({ detail: 'subscription_required' }), { status: 403 }), () => { denied++; });
  await assert.rejects(failing.getConversations(), error => {
    assert.equal((error as InstanceType<typeof backend.BackendError>).status, 403); return true;
  });
  assert.equal(denied, 1);
  for (const [httpStatus, detail] of [[503, 'billing_unavailable'], [403, 'forbidden']] as const) {
    const unavailable = backend.createBackend(async () => new Response(JSON.stringify({ detail }), { status: httpStatus }), () => { denied++; });
    await assert.rejects(unavailable.getConversations());
    assert.equal(denied, 1, 'only an exact subscription-required response confirms denial');
  }
});

test('missing current, monthly, or annual catalog packages never present a native paywall', async () => {
  for (const current of [null, { monthly: {} }, { annual: {} }]) {
    let opened = false;
    const core = { configure() {}, getAppUserID: async () => 'a', addCustomerInfoUpdateListener() {},
      getOfferings: async () => ({ current }),
    } as unknown as typeof Purchases;
    const adapter = adapterModule.createPurchasesAdapter({ enabled: true, apiKey: 'test_public',
      loadCore: async () => core, loadUI: async () => { opened = true; throw new Error('must not open'); }, nativeUIAvailable: () => true });
    await adapter.identify('a');
    await assert.rejects(async () => adapter.paywall('a', await adapter.offering('a')), /plans are temporarily unavailable/);
    assert.equal(opened, false);
  }
});

test('native paywall results preserve purchase, restore, cancellation, dismissal, and failure', async () => {
  const expected = { PURCHASED: 'purchased', RESTORED: 'restored', CANCELLED: 'cancelled', NOT_PRESENTED: 'dismissed', ERROR: null };
  for (const [result, value] of Object.entries(expected)) {
    const core = { configure() {}, getAppUserID: async () => 'a', addCustomerInfoUpdateListener() {} } as unknown as typeof Purchases;
    const ui = { presentPaywall: async () => result } as unknown as typeof import('react-native-purchases-ui').default;
    const adapter = adapterModule.createPurchasesAdapter({ enabled: true, apiKey: 'test_public',
      loadCore: async () => core, loadUI: async () => ui, nativeUIAvailable: () => true });
    await adapter.identify('a');
    if (value) assert.equal(await adapter.paywall('a', offering), value);
    else await assert.rejects(adapter.paywall('a', offering), /could not be completed/);
  }
});

test('manually reopening after a startup error does not reopen again after cancellation', () => {
  let calls = 0; const attempted = { current: null }; let effects: (() => void)[] = [];
  const subscription = { enabled: true, hasAccess: false, status: status(), loading: false, busy: null,
    error: null, message: 'Initial store connection failed' as string | null, confirming: false,
    purchase: async () => { calls++; subscription.message = null; },
  };
  const screen = load('screens/paywall-screen.tsx', {
    react: { useRef: () => attempted, useEffect: effect => { effects.push(effect); } },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'expo-router': { router: { replace() {}, push() {} } },
    'react-native': { StyleSheet: { create: value => value } }, 'react-native-safe-area-context': {},
    '@/components/ui': {}, '@/components/policy-links': {},
    '@/state/app-context': { useApp: () => ({ colors: {}, authSession: { user: { id: 'a' } },
      accountReady: true, profile: { onboardingComplete: true }, passwordRecovery: false, signOut() {} }) },
    '@/state/subscription-context': { useSubscription: () => subscription },
    '@/state/subscription-store': logic,
  });
  const tree = screen.default() as TestNode;
  effects.forEach(effect => effect()); effects = [];
  assert.equal(calls, 0);
  const card = tree.props.children.props.children[1];
  card.props.children[3].props.children[1].props.onPress();
  screen.default(); effects.forEach(effect => effect());
  assert.equal(calls, 1);
  assert.equal(attempted.current, 'a');
});

function subscriptionScreen(page: 'account' | 'paywall', subscription: TestModule) {
  const calls: string[] = []; const effects: (() => void)[] = []; const attempted = { current: null };
  const state = { enabled: true, hasAccess: false, loading: false, busy: null, error: null, message: null, confirming: false,
    refresh: async () => { calls.push('refresh'); }, purchase: async () => { calls.push('purchase'); },
    restore: async () => { calls.push('restore'); }, manage: async () => { calls.push('manage'); }, ...subscription };
  const screen = load(`screens/${page}-screen.tsx`, {
    react: { useRef: () => attempted, useState: initial => [initial, () => {}], useEffect: fn => { effects.push(fn); } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { router: { replace: (route: string) => calls.push(route), push: (route: string) => calls.push(route), back() {} } },
    'react-native': { StyleSheet: { create: value => value }, Platform: { OS: 'ios' }, View: 'view', ScrollView: 'scroll',
      KeyboardAvoidingView: 'keyboard', Pressable: 'pressable', ActivityIndicator: 'spinner' },
    'react-native-safe-area-context': { SafeAreaView: 'safe' }, 'lucide-react-native': {},
    '@/components/ui': { AppText: 'text', Card: 'card', PrimaryButton: 'button', SecondaryButton: 'button' },
    '@/components/policy-links': { PolicyLinks: 'policies' }, '@/design/tokens': { fonts: {}, radius: {} },
    '@/services/api': { liveApiConfigured: true },
    '@/state/app-context': { useApp: () => ({ colors: {}, authSession: { user: { id: 'a' } }, accountReady: true,
      profile: { onboardingComplete: true }, passwordRecovery: false, signOut() {} }) },
    '@/state/subscription-context': { useSubscription: () => state }, '@/state/subscription-store': logic,
  });
  const expand = (node: TestValue): TestValue => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(expand);
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  };
  const tree = expand(screen.default()); effects.forEach(fn => fn());
  const buttons = nodes(tree).filter(node => node.type === 'button');
  const text = (node: TestValue): string => Array.isArray(node) ? node.map(text).join('')
    : node && typeof node === 'object' ? text(node.props.children) : typeof node === 'string' ? node : '';
  return { calls, text: text(tree), button: (label: string) => buttons.find(node => node.props.children === label) };
}

test('account and paywall describe denied trial/grace without active-access promises or another purchase prompt', () => {
  for (const phase of ['trial', 'grace'] as const) {
    const billing = { ...status(), phase, expires_at: '2099-01-01T00:00:00Z', will_renew: false };
    for (const page of ['account', 'paywall'] as const) {
      const f = subscriptionScreen(page, { status: billing });
      assert.match(f.text, phase === 'trial' ? /trial period.*confirmed payment/ : /payment needs attention/);
      assert.doesNotMatch(f.text, /trial is active|active during the billing grace period|Access until|still syncing/);
      assert.equal(f.calls.includes('purchase'), false);
      assert.equal(f.button('Choose a plan'), undefined); assert.equal(f.button('View plans'), undefined);
      assert.ok(f.button('Manage subscription')); f.button('Manage subscription')!.props.onPress();
      assert.deepEqual(f.calls, ['manage']); assert.ok(f.button('Restore purchases'));
      if (page === 'account') assert.match(f.text, phase === 'trial' ? /Trial ends/ : /Paid period ended/);
    }
  }
  const paid = subscriptionScreen('account', { hasAccess: true, status: { ...status(true), will_renew: false } });
  assert.match(paid.text, /Arcel Pro is active.*Access until/);
  const unknown = subscriptionScreen('paywall', { status: null, error: 'Could not verify your subscription.' });
  assert.equal(unknown.calls.length, 0); assert.equal(unknown.button('Choose a plan')?.props.disabled, true);
  assert.ok(unknown.button('Retry subscription check'));
});

test('the purchase sheet only auto-opens for an explicit backend denial, never a clock-based or unknown state', () => {
  for (const billing of [null, { ...status(true), expires_at: '2000-01-01T00:00:00Z' }]) {
    const f = subscriptionScreen('paywall', { status: billing });
    assert.equal(f.calls.includes('purchase'), false);
  }
  const denied = subscriptionScreen('paywall', { status: status() });
  assert.deepEqual(denied.calls, ['purchase']);
});
