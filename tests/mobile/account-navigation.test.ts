import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jsx, load, nodes } from './helpers.ts';

const runtime = { jsx, jsxs: jsx };
const native = { StyleSheet: { create: (value: unknown) => value }, Platform: { OS: 'ios' },
  View: 'view', Pressable: 'button', ScrollView: 'scroll', KeyboardAvoidingView: 'keyboard', ActivityIndicator: 'spinner' };

test('account back uses history when available and recovers when billing removes it', () => {
  const calls: string[] = [];
  let hasHistory = true;
  const { default: Account } = load('screens/account-screen.tsx', {
    react: {}, 'react/jsx-runtime': runtime, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'safe' }, 'lucide-react-native': {},
    'expo-router': { router: { canGoBack: () => hasHistory,
      back: () => { assert.ok(hasHistory); calls.push('back'); }, replace: (route: string) => calls.push(route) } },
    '@/components/ui': {}, '@/components/policy-links': {}, '@/design/tokens': { fonts: {}, radius: {} },
    '@/services/api': {}, '@/state/subscription-context': {}, '@/state/subscription-store': {},
    '@/state/app-context': { useApp: () => ({ colors: {}, authSession: {} }) },
  });
  const back = nodes(Account()).find(node => node.props.accessibilityLabel === 'Go back')!;
  back.props.onPress();
  // Account stays mounted even if the protected screen beneath it is removed after rendering.
  hasHistory = false;
  back.props.onPress();
  assert.deepEqual(calls, ['back', '/']);
});

test('account fallback entry respects authentication, onboarding, payment, and recovery', () => {
  const app = { colors: {}, hydrated: true, accountReady: true, authSession: {} as object | null,
    profile: { onboardingComplete: true }, passwordRecovery: false };
  let hasAccess = true;
  const { default: Index } = load('app/index.tsx', {
    'react/jsx-runtime': runtime, 'react-native': native, 'expo-router': { Redirect: 'redirect' },
    '@/state/app-context': { useApp: () => app },
    '@/state/subscription-context': { useSubscription: () => ({ next: () => hasAccess ? '/(tabs)/today' : '/paywall' }) },
  });
  assert.equal(Index().props.href, '/(tabs)/today');
  hasAccess = false;
  assert.equal(Index().props.href, '/paywall');
  app.profile.onboardingComplete = false;
  assert.equal(Index().props.href, '/onboarding');
  app.accountReady = false;
  assert.ok(nodes(Index()).some(node => node.type === 'spinner'));
  app.authSession = null;
  assert.equal(Index().props.href, '/auth');
  app.passwordRecovery = true;
  assert.equal(Index().props.href, '/reset-password');
});
