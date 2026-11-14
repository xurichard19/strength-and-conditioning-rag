import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BillingStatus } from '../../mobile/src/services/backend';
import type { CustomerInfo } from 'react-native-purchases';
import { deferred, jsx, load, nodes, type TestModule } from './helpers.ts';

const logic = load<typeof import('../../mobile/src/state/subscription-store')>('state/subscription-store.ts');
const billing = (has_access = true): BillingStatus => ({ enabled: true, has_access, entitlement: 'arcel_pro',
  phase: has_access ? 'paid' : 'inactive', product_id: 'annual', expires_at: '2099-01-01T00:00:00Z',
  will_renew: true, verified_at: '2026-11-10T00:00:00Z' });
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

for (const backendEnabled of [true, false]) test(`failed background checks keep workout routes until denial (backend billing ${backendEnabled ? 'on' : 'off'})`, async () => {
  const granted: BillingStatus = backendEnabled ? billing() : { enabled: false, has_access: true, entitlement: 'arcel_pro',
    phase: 'inactive', product_id: null, expires_at: null, will_renew: null, verified_at: null };
  let read = async () => granted;
  let purchaseCalls = 0;
  const store = logic.createSubscriptionStore({ enabled: true, api: () => ({ getBillingStatus: () => read(), syncBilling: () => read() }),
    purchases: { identify: async () => {}, customerInfo: async () => ({ entitlements: { active: {} } }) as CustomerInfo,
      subscribe: () => () => {}, offering: async () => { throw new Error('unexpected offering'); },
      paywall: async () => { purchaseCalls++; return 'purchased'; }, restore: async () => { throw new Error('unexpected restore'); },
      manage: async () => {} } });
  store.setUser('a'); await flush();
  const app = { colors: {}, hydrated: true, authSession: {}, accountReady: true, profile: { onboardingComplete: true } };
  const subscription = () => ({ ...store.getSnapshot(), enabled: true,
    hasAccess: logic.subscriptionAllowsAccess(true, 'a', store.getSnapshot()), refresh: store.refresh });
  const runtime = { jsx, jsxs: jsx };
  const native = { View: 'view', Pressable: 'button', StyleSheet: { create: (value: TestModule) => value, hairlineWidth: 1 } };
  const context = { SubscriptionProvider: 'subscriptions', useSubscription: subscription };
  const shared = { 'react/jsx-runtime': runtime, 'react-native': native,
    '@/state/app-context': { AppProvider: 'app', useApp: () => app }, '@/state/subscription-context': context };
  const { SubscriptionNotice } = load('components/subscription-notice.tsx', { ...shared,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34 }) },
    '@/components/ui': { AppText: 'text' } });
  const { default: Root } = load('app/_layout.tsx', { ...shared,
    react: { useEffect() {} }, '@expo-google-fonts/rubik': { useFonts: () => [true] },
    'expo-router': { DarkTheme: { colors: {} }, DefaultTheme: { colors: {} }, ThemeProvider: 'theme',
      Stack: { Screen: 'route', Protected: 'protected' }, useSegments: () => ['workout', '1'] },
    'expo-splash-screen': { preventAutoHideAsync() {} }, 'expo-status-bar': { StatusBar: 'status' },
    'react-native-gesture-handler': { GestureHandlerRootView: 'root' },
    '@/components/chat-launcher': { default: 'launcher', __esModule: true }, '@/components/ui': {},
    '@/components/glass-surface': { GlassProvider: 'glass' }, '@/components/subscription-notice': { SubscriptionNotice },
  });
  const Navigation = Root().props.children.props.children.props.children.type;
  const protectedRoutes = () => nodes(Navigation()).find(node => node.type === 'protected')!;
  const notice = () => {
    const node = nodes(Navigation()).find(node => node.type === SubscriptionNotice);
    return node ? node.type(node.props) : null;
  };
  assert.equal(protectedRoutes().props.guard, true); assert.equal(notice(), null);

  read = async () => { throw new Error('offline'); }; await store.refresh();
  const routes = protectedRoutes();
  assert.equal(routes.props.guard, true);
  assert.ok(nodes(routes).some(node => node.props.name === 'workout/[id]'));
  assert.ok(nodes(notice()).some(node => node.type === 'text' && node.props.accessibilityLiveRegion === 'polite'));
  const retry = nodes(notice()).find(node => node.type === 'button')!;
  assert.equal(retry.props.accessibilityLabel, 'Retry subscription check'); assert.equal(retry.props.disabled, false);

  const pending = deferred<BillingStatus>(); read = () => pending.promise;
  retry.props.onPress();
  assert.equal(nodes(notice()).find(node => node.type === 'button')?.props.disabled, true);
  assert.equal(protectedRoutes().props.guard, true);
  pending.resolve(granted); await flush();
  assert.equal(notice(), null); assert.equal(purchaseCalls, 0, 'retry only checks the backend');

  read = async () => billing(false); await store.refresh();
  assert.equal(protectedRoutes().props.guard, false); assert.equal(notice(), null);
});

test('subscription warning is hidden for unknown accounts and disabled billing', () => {
  const state: TestModule = { enabled: true, hasAccess: false, error: 'Could not verify' };
  const { SubscriptionNotice } = load('components/subscription-notice.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) }, '@/components/ui': {},
    '@/state/app-context': { useApp: () => ({ colors: {} }) }, '@/state/subscription-context': { useSubscription: () => state },
  });
  assert.equal(SubscriptionNotice(), null);
  state.enabled = false; state.hasAccess = true;
  assert.equal(SubscriptionNotice(), null);
});
