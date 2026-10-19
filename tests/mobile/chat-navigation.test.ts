import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { jsx, load, nodes, plain, type Stubs } from './helpers.ts';

const react: Stubs = { useEffect: () => {}, useState: value => [value, () => {}], useRef: value => ({ current: value }), useCallback: fn => fn };
const native: Stubs = { View: 'view', StyleSheet: { create: value => value }, Keyboard: {}, Platform: { OS: 'ios' } };
const runtime = { jsx, jsxs: jsx };
const app = { colors: {}, profile: { onboardingComplete: true }, hydrated: true, accountReady: true, authSession: {} };

test('bottom tabs retain Plans and remove Chat', () => {
  const { default: Tabs } = load('app/(tabs)/_layout.tsx', {
    react, 'react/jsx-runtime': runtime, 'react-native': native,
    'expo-router/js-top-tabs': { TopTabs: { Screen: 'tab' } },
    'lucide-react-native': {}, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/design/tokens': { fonts: {} }, '@/state/app-context': { useApp: () => app },
  });
  assert.deepEqual(nodes(Tabs()).filter(node => node.type === 'tab').map(node => node.props.name),
    ['today', 'week', 'progress', 'plans', 'you']);
  assert.equal(existsSync(new URL('../../mobile/src/app/(tabs)/chat.tsx', import.meta.url)), false);
});

test('chat opens above the current page with one global launcher', () => {
  const { default: Root } = load('app/_layout.tsx', {
    react, 'react/jsx-runtime': runtime, 'react-native': native,
    '@expo-google-fonts/rubik': { useFonts: () => [true] },
    'expo-router': { DarkTheme: { colors: {} }, DefaultTheme: { colors: {} }, ThemeProvider: 'theme',
      Stack: { Screen: 'route' }, useSegments: () => ['(tabs)', 'today'] },
    'expo-splash-screen': { preventAutoHideAsync: () => {} }, 'expo-status-bar': { StatusBar: 'status' },
    '@/components/chat-launcher': { default: 'launcher', __esModule: true },
    '@/components/ui': {}, '@/state/app-context': { AppProvider: 'provider', useApp: () => app },
  });
  const navigation = Root().props.children;
  const tree = navigation.type();
  const chat = nodes(tree).find(node => node.props.name === 'chat');
  assert.deepEqual(plain(chat?.props.options), { presentation: 'transparentModal', animation: 'fade', gestureEnabled: false,
    contentStyle: { backgroundColor: 'transparent' } });
  assert.equal(nodes(tree).filter(node => node.type === 'launcher').length, 1);
  assert.equal(load('app/chat.tsx', { '@/components/chat-window': { default: 'window', __esModule: true } }).default, 'window');
});

test('page headers no longer render the Ask Arcel shortcut', () => {
  const { Screen } = load('components/ui.tsx', {
    react, 'react/jsx-runtime': runtime, 'react-native': { ...native, ScrollView: 'scroll', Pressable: 'button' },
    'expo-router': { useFocusEffect: () => {} }, 'lucide-react-native': {},
    'react-native-safe-area-context': { SafeAreaView: 'safe' },
    'react-native-reanimated': { default: { View: 'animated' }, __esModule: true,
      useSharedValue: value => ({ get: () => value }), useAnimatedStyle: fn => fn() },
    '@/design/tokens': { fonts: {}, radius: {} }, '@/lib/errors': {}, '@/state/app-context': { useApp: () => app },
  });
  const tree = Screen({ title: 'Today', context: "today's training", children: 'workouts' });
  assert.equal(nodes(tree).filter(node => node.type === 'button').length, 0);
  assert.ok(nodes(tree).some(node => node.props.children === 'Today'));
});
