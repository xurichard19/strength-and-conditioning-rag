import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Purchases from 'react-native-purchases';
import type { CustomerInfo, PurchasesOffering } from 'react-native-purchases';
import type { BillingStatus } from '../src/services/backend';
import type { PurchasesAdapter } from '../src/services/purchases';
import { deferred, load, plain, jsx, type TestValue, type TestNode } from './helpers.ts';

const logic = load<typeof import('../src/state/subscription-store')>('state/subscription-store.ts');
const adapterModule = load<typeof import('../src/services/purchases')>('services/purchases.ts', {
  'react-native': { Platform: { OS: 'ios' }, NativeModules: {} },
});
const backend = load<typeof import('../src/services/backend')>('services/backend.ts');
const status = (has_access = false): BillingStatus => ({ enabled: true, has_access, entitlement: 'arcel_pro',
  phase: has_access ? 'paid' : 'inactive', product_id: has_access ? 'annual' : null,
  expires_at: has_access ? '2099-01-01T00:00:00Z' : null, will_renew: has_access, verified_at: '2026-09-19T00:00:00Z' });
const info = (active = false) => ({ entitlements: { active: active ? { arcel_pro: { isActive: true } } : {} } }) as CustomerInfo;
const offering = { monthly: {}, annual: {} } as PurchasesOffering;
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

function fixture(overrides: Partial<PurchasesAdapter> = {}, enabled = true) {
  let value = status();
  let read: (id: string) => Promise<BillingStatus> = async () => value;
  let sync: (id: string) => Promise<BillingStatus> = async () => value;
  const calls: string[] = [];
  const purchases: PurchasesAdapter = {
    identify: async id => { calls.push(`identify:${id}`); }, customerInfo: async () => info(),
    restore: async () => info(), offering: async () => offering, paywall: async () => 'purchased',
    manage: async () => {}, subscribe: () => () => {}, ...overrides,
  };
  const store = logic.createSubscriptionStore({ enabled, purchases, api: id => ({
    getBillingStatus: () => { calls.push(`read:${id}`); return read(id); },
    syncBilling: () => { calls.push(`sync:${id}`); return sync(id); },
  }) });
  return { store, calls, setStatus: (next: BillingStatus) => { value = next; },
    setRead: (next: typeof read) => { read = next; }, setSync: (next: typeof sync) => { sync = next; } };
}

test('disabled billing performs no SDK or backend calls and preserves existing destinations', async () => {
  const f = fixture({}, false); f.store.setUser('a'); await f.store.refresh(); await f.store.purchase();
  assert.deepEqual(f.calls, []);
  for (const destination of ['/(tabs)/today', '/(tabs)/chat', '/(tabs)/you'] as const) {
    assert.equal(logic.subscriptionDestination(false, 'a', f.store.getSnapshot(), destination), destination);
  }
  for (const platform of ['android', 'web']) {
    const module = load<typeof import('../src/services/purchases')>('services/purchases.ts', {
      'react-native': { Platform: { OS: platform }, NativeModules: {} },
    });
    assert.equal(module.billingEnabled, false);
    await module.purchases.identify('a');
  }
});

test('enabled gate rejects unknown, failed, other-account, expired and inactive states', async () => {
  const f = fixture();
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), false);
  f.store.setUser('a'); await flush();
  assert.equal(logic.subscriptionDestination(true, 'a', f.store.getSnapshot()), '/paywall');
  f.setStatus(status(true)); await f.store.refresh();
  assert.equal(logic.subscriptionDestination(true, 'a', f.store.getSnapshot(), '/(tabs)/chat'), '/(tabs)/chat');
  assert.equal(logic.subscriptionAllowsAccess(true, 'b', f.store.getSnapshot()), false);
  f.setStatus({ ...status(true), expires_at: '2000-01-01T00:00:00Z' }); await f.store.refresh();
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), false);
  f.setRead(async () => { throw new Error('offline'); }); await f.store.refresh();
  assert.equal(f.store.getSnapshot().status, null);
  assert.match(f.store.getSnapshot().error!, /Could not verify/);
});

test('backend status is authoritative even when the SDK has no active entitlement', async () => {
  const f = fixture(); f.setStatus(status(true)); f.store.setUser('a'); await flush();
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), true);
  assert.equal(logic.hasSDKEntitlement(info()), false);
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

test('Customer Center verification failure revokes the old grant but presentation failure does not invent one', async () => {
  const f = fixture(); f.setStatus(status(true)); f.store.setUser('a'); await flush();
  f.setSync(async () => { throw new Error('503'); }); await f.store.manage();
  assert.equal(f.store.getSnapshot().status, null);
  assert.equal(logic.subscriptionAllowsAccess(true, 'a', f.store.getSnapshot()), false);
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
    if (sdk) f.store.sdkChanged(); else f.store.invalidate('a');
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
  assert.deepEqual(plain(calls), [['/billing/status', null], ['/billing/sync', { method: 'POST' }]]);
  const failing = backend.createBackend(async () => new Response(JSON.stringify({ detail: 'subscription_required' }), { status: 403 }), () => { denied++; });
  await assert.rejects(failing.getConversations(), error => {
    assert.equal((error as InstanceType<typeof backend.BackendError>).status, 403); return true;
  });
  assert.equal(denied, 1);
});

test('onboarding completion saves first and retains Chat through the subscription gate', async () => {
  const events: string[] = []; const redirects: string[] = []; let slot = 0;
  const screen = load('screens/onboarding-screen.tsx', {
    react: { useEffect: () => {}, useState: initial => [slot++ === 0 ? 6 : initial, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'expo-linear-gradient': {},
    'expo-router': { router: { replace: (path: string) => redirects.push(path) }, useLocalSearchParams: () => ({}) },
    'lucide-react-native': {}, 'react-native-safe-area-context': {},
    'react-native': { Platform: { OS: 'ios' }, StyleSheet: { create: value => value } },
    '@/components/ui': {}, '@/design/tokens': { fonts: {}, radius: {} },
    '@/services/api': { surveyAnswers: () => ({}) },
    '@/state/app-context': { useApp: () => ({ accountReady: true, profile: { onboardingComplete: false },
      colors: {}, onboardingAnswers: {}, finishOnboarding: async () => { events.push('saved'); return true; } }) },
    '@/state/subscription-context': { useSubscription: () => ({
      rememberDestination: (path: string) => events.push(path), next: (path: string) => { assert.equal(path, '/(tabs)/chat'); return '/paywall'; },
    }) },
  });
  const tree = screen.default() as TestNode;
  const footer = tree.props.children[1].props.children.at(-1) as TestNode;
  footer.props.onFinish(); await flush();
  assert.deepEqual(events, ['saved', '/(tabs)/chat']); assert.deepEqual(redirects, ['/paywall']);
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
