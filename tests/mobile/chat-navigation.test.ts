import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { deferred, jsx, load, nodes, plain, type Stubs, type TestValue } from './helpers.ts';

const react: Stubs = { createContext: value => ({ defaultValue: value }), useEffect: () => {},
  useState: value => [value, () => {}], useRef: value => ({ current: value }), useCallback: fn => fn };
const native: Stubs = { View: 'view', StyleSheet: { create: value => value }, Keyboard: {}, Platform: { OS: 'ios' } };
const runtime = { jsx, jsxs: jsx };
const app = { colors: {}, profile: { onboardingComplete: true }, hydrated: true, accountReady: true, authSession: {} };

test('bottom tabs retain Plans and remove Chat', () => {
  const { default: Tabs } = load('app/(tabs)/_layout.tsx', {
    react, 'react/jsx-runtime': runtime, 'react-native': native,
    'expo-router/js-top-tabs': { TopTabs: { Screen: 'tab' } },
    '@/components/glass-tab-bar': { default: 'glass-bar', __esModule: true },
    '@/components/ui': { TabDockContext: 'tab-dock' },
    'lucide-react-native': {}, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/design/tokens': { fonts: {} }, '@/state/app-context': { useApp: () => app },
  });
  const tree = Tabs();
  assert.deepEqual(nodes(tree).filter(node => node.type === 'tab').map(node => node.props.name),
    ['today', 'week', 'plans', 'progress', 'you']);
  assert.equal(tree.type, 'tab-dock');
  assert.equal(tree.props.value, true);
  assert.equal(tree.props.children.props.screenOptions.swipeEnabled, true);
  assert.equal(tree.props.children.props.tabBar({}).type, 'glass-bar');
  assert.equal(existsSync(new URL('../../mobile/src/app/(tabs)/chat.tsx', import.meta.url)), false);
});

test('glass surfaces share one transparency subscription and respect platform support', async () => {
  function fixture(platform = 'ios', available = true, apiAvailable = true) {
    const slots: TestValue[] = []; let cursor = 0;
    const effects: (() => (() => void) | undefined)[] = [];
    const listeners = new Map<string, (value?: boolean) => void>();
    const preference = deferred<boolean>();
    let transparency: TestValue;
    const subscribe = (event: string, listener: (value?: boolean) => void) => {
      listeners.set(event, listener); return { remove: () => listeners.delete(event) };
    };
    const { GlassProvider, GlassBackdrop } = load('components/glass-surface.tsx', {
      react: {
        createContext: value => (transparency = { value }), useContext: context => context.value,
        useState: initial => {
          const index = cursor++;
          if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
          return [slots[index], (value: TestValue) => { slots[index] = value; }];
        },
        useEffect: effect => { if (!(cursor++ in slots)) { slots[cursor - 1] = true; effects.push(effect); } },
      },
      'react/jsx-runtime': runtime,
      'react-native': { ...native, Platform: { OS: platform },
        AccessibilityInfo: { isReduceTransparencyEnabled: () => preference.promise, addEventListener: subscribe } },
      'expo-glass-effect': { GlassView: 'glass', isLiquidGlassAvailable: () => available, isGlassEffectAPIAvailable: () => apiAvailable },
      '@/state/app-context': { useApp: () => ({ colorScheme: 'dark', colors: { tab: '#19242C' } }) },
    });
    const render = () => {
      cursor = 0;
      transparency.value = GlassProvider({ children: 'app' }).props.value;
      return GlassBackdrop({});
    };
    return { render, isGlass: () => render().type === 'glass', effects, listeners, preference };
  }
  const f = fixture();
  assert.equal(f.isGlass(), false); // Keep an opaque surface until the accessibility preference is known.
  const cleanup = f.effects.map(effect => effect());
  f.preference.resolve(false);
  await Promise.resolve();
  assert.equal(f.isGlass(), true);
  assert.equal(f.render().props.colorScheme, 'dark');
  assert.equal(f.render().props.pointerEvents, 'none');
  assert.equal(f.effects.length, 1);
  assert.equal(f.listeners.size, 1);
  f.listeners.get('reduceTransparencyChanged')!(true);
  assert.equal(f.isGlass(), false);
  assert.equal(Object.assign({}, ...f.render().props.style.flat(Infinity)).backgroundColor, '#19242C');
  f.listeners.get('reduceTransparencyChanged')!(false);
  assert.equal(f.isGlass(), true);
  cleanup.forEach(dispose => dispose?.());
  assert.equal(f.listeners.size, 0);

  for (const [platform, available, apiAvailable] of [['ios', false, true], ['ios', true, false], ['android', false, false]] as const) {
    const unsupported = fixture(platform, available, apiAvailable);
    unsupported.render();
    const dispose = unsupported.effects.map(effect => effect());
    unsupported.preference.resolve(false);
    await Promise.resolve();
    assert.equal(unsupported.isGlass(), false);
    assert.equal(Object.assign({}, ...unsupported.render().props.style.flat(Infinity)).backgroundColor, '#19242CF0');
    if (platform === 'android') assert.equal(unsupported.listeners.size, 0);
    dispose.forEach(effect => effect?.());
  }

  const racing = fixture();
  racing.render();
  const dispose = racing.effects[0]();
  racing.listeners.get('reduceTransparencyChanged')!(true);
  racing.preference.resolve(false); // A stale initial read must not undo the user's newer preference.
  await Promise.resolve();
  assert.equal(racing.isGlass(), false);
  dispose?.();
});

test('glass dock preserves tab navigation and hides while the keyboard is open', () => {
  let keyboardShown = false;
  let effect!: () => () => void;
  const listeners = new Map<string, () => void>();
  const { default: Bar } = load('components/glass-tab-bar.tsx', {
    react: { useState: () => [keyboardShown, (value: boolean) => { keyboardShown = value; }], useEffect: value => { effect = value; } },
    'react/jsx-runtime': runtime,
    'react-native': { ...native, Keyboard: { addListener: (event, listener) => {
      listeners.set(event, listener); return { remove: () => listeners.delete(event) };
    } } },
    'expo-router/js-top-tabs': { MaterialTopTabBar: 'tabs' }, './glass-surface': { GlassBackdrop: 'backdrop' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0 }) },
  });
  const render = () => Bar({ state: { index: 2 } });
  const tree = render();
  assert.equal(nodes(tree).find(node => node.type === 'tabs')?.props.state.index, 2);
  assert.equal(nodes(tree).filter(node => node.type === 'backdrop').length, 1);
  const cleanup = effect();
  listeners.get('keyboardWillShow')!();
  assert.equal(render(), null);
  listeners.get('keyboardWillHide')!();
  assert.ok(render());
  cleanup();
  assert.equal(listeners.size, 0);
});

test('chat opens above the current page with one global launcher', () => {
  const { default: Root } = load('app/_layout.tsx', {
    react, 'react/jsx-runtime': runtime, 'react-native': native,
    '@expo-google-fonts/rubik': { useFonts: () => [true] },
    'expo-router': { DarkTheme: { colors: {} }, DefaultTheme: { colors: {} }, ThemeProvider: 'theme',
      Stack: { Screen: 'route' }, useSegments: () => ['(tabs)', 'today'] },
    'expo-splash-screen': { preventAutoHideAsync: () => {} }, 'expo-status-bar': { StatusBar: 'status' },
    '@/components/chat-launcher': { default: 'launcher', __esModule: true },
    '@/components/glass-surface': { GlassProvider: 'glass-provider' },
    '@/components/ui': {}, '@/state/app-context': { AppProvider: 'provider', useApp: () => app },
    'react-native-gesture-handler': { GestureHandlerRootView: 'gesture-root' },
  });
  const provider = Root().props.children;
  assert.equal(provider.type, 'glass-provider');
  const navigation = provider.props.children;
  const tree = navigation.type();
  const chat = nodes(tree).find(node => node.props.name === 'chat');
  assert.deepEqual(plain(chat?.props.options), { presentation: 'transparentModal', animation: 'fade', gestureEnabled: false,
    contentStyle: { backgroundColor: 'transparent' } });
  assert.equal(nodes(tree).filter(node => node.type === 'launcher').length, 1);
  assert.equal(nodes(tree).filter(node => node.type === 'gesture-root').length, 1);
  assert.equal(load('app/chat.tsx', { '@/components/chat-window': { default: 'window', __esModule: true } }).default, 'window');
});

test('page headers omit the chat shortcut and reserve space for the floating tab bar', () => {
  let docked = true;
  const { Screen, TabDockContext } = load('components/ui.tsx', {
    react: { ...react, useContext: () => docked }, 'react/jsx-runtime': runtime,
    'react-native': { ...native, ScrollView: 'scroll', Pressable: 'button' },
    'expo-router': { useFocusEffect: () => {}, useSegments: () => { throw new Error('Modal routes must not change tab padding'); } },
    'lucide-react-native': {},
    'react-native-safe-area-context': { SafeAreaView: 'safe', useSafeAreaInsets: () => ({ bottom: 34 }) },
    'react-native-reanimated': { default: { View: 'animated' }, __esModule: true,
      useSharedValue: value => ({ get: () => value }), useAnimatedStyle: fn => fn() },
    '@/design/tokens': { fonts: {}, radius: {} }, '@/lib/errors': {}, '@/state/app-context': { useApp: () => app },
  });
  const tree = Screen({ title: 'Today', context: "today's training", children: 'workouts' });
  assert.equal(nodes(tree).filter(node => node.type === 'button').length, 0);
  assert.ok(nodes(tree).some(node => node.props.children === 'Today'));
  const bottomPadding = (screen: TestValue) => Object.assign({}, ...nodes(screen)
    .find(node => node.type === 'scroll')!.props.contentContainerStyle.flat(Infinity).filter(Boolean)).paddingBottom;
  assert.equal(TabDockContext.defaultValue, false);
  assert.equal(bottomPadding(tree), 138);
  docked = false;
  assert.equal(bottomPadding(Screen({ title: 'Workout', children: 'details' })), 40);
});
