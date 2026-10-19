import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jsx, load, nodes, type Stubs, type TestModule, type TestValue } from './helpers.ts';

function fixture(height = 844) {
  const slots: TestValue[] = []; let cursor = 0; let back = true;
  const effects: (() => () => void)[] = []; const listeners: TestModule = {};
  const calls: TestValue[] = []; let removals = 0;
  const app = { hydrated: true, accountReady: true, authSession: {}, passwordRecovery: false,
    colors: {}, profile: { onboardingComplete: true } };
  let page = '(tabs)';
  const modules = {
    react: { useState: initial => {
      const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (value: TestValue) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    }, useEffect: effect => effects.push(effect) },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { useSegments: () => [page], router: { navigate: (value: string) => calls.push(value),
      canGoBack: () => back, back: () => calls.push('back'), replace: (value: string) => calls.push(value) } },
    'react-native': { View: 'view', Pressable: 'button', KeyboardAvoidingView: 'keyboard', Platform: { OS: 'ios' },
      useWindowDimensions: () => ({ width: 390, height }), StyleSheet: { create: value => value },
      Keyboard: { isVisible: () => false, dismiss: () => calls.push('dismiss'), addListener: (event, callback) => {
        listeners[event] = callback; return { remove: () => removals++ };
      } }, PanResponder: { create: config => ({ panHandlers: config }) } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) },
    'lucide-react-native': { MessageCircle: 'icon' }, '@/components/ui': { AppText: 'text' },
    '@/screens/chat-screen': { default: 'chat', __esModule: true }, '@/state/app-context': { useApp: () => app },
  } satisfies Stubs;
  return { app, calls, listeners, effects, removals: () => removals,
    page: (value: string) => { page = value; }, back: (value: boolean) => { back = value; },
    load: (name: string) => load(`components/${name}.tsx`, modules).default,
    render: (component: TestValue) => { cursor = 0; return nodes(component()); } };
}

test('floating launcher opens one chat route and stays above tabs and safe areas', () => {
  const f = fixture(); const Launcher = f.load('chat-launcher');
  const button = f.render(Launcher).find(n => n.props.accessibilityLabel === 'Open chat')!;
  button.props.onPress(); assert.deepEqual(f.calls, ['/chat']);
  assert.equal(button.props.style({ pressed: false })[1].bottom, 110);
  f.page('session');
  assert.equal(f.render(Launcher)[0].props.style({ pressed: false })[1].bottom, 50);
});

test('launcher hides during authentication, chat, onboarding, recovery, and keyboard entry', () => {
  const f = fixture(); const Launcher = f.load('chat-launcher');
  for (const page of ['auth', 'onboarding', 'reset-password', 'chat', 'account']) {
    f.page(page); assert.equal(f.render(Launcher).length, 0);
  }
  f.page('(tabs)'); f.app.accountReady = false; assert.equal(f.render(Launcher).length, 0);
  f.app.accountReady = true; f.app.profile.onboardingComplete = false; assert.equal(f.render(Launcher).length, 0);
  f.app.profile.onboardingComplete = true; f.app.passwordRecovery = true; assert.equal(f.render(Launcher).length, 0);
  f.app.passwordRecovery = false; const cleanup = f.effects[0]();
  f.listeners.keyboardWillShow(); assert.equal(f.render(Launcher).length, 0);
  f.listeners.keyboardWillHide(); assert.equal(f.render(Launcher).length, 2);
  cleanup(); assert.equal(f.removals(), 2);
});

test('swiping the handle expands the same conversation while horizontal drags and message scrolls stay untouched', () => {
  const f = fixture(); const Window = f.load('chat-window');
  let tree = f.render(Window);
  const handle = tree.find(n => n.props.onMoveShouldSetPanResponderCapture)!;
  assert.equal(handle.type, 'view', 'Pressable overrides native PanResponder callbacks');
  assert.equal(tree.find(n => n.type === 'chat')?.props.compact, true);
  assert.equal(handle.props.onMoveShouldSetPanResponderCapture(null, { dx: 40, dy: -20 }), false);
  assert.equal(handle.props.onMoveShouldSetPanResponderCapture(null, { dx: 3, dy: -20 }), true);
  handle.props.onPanResponderRelease(null, { dy: -20 });
  assert.equal(f.render(Window).find(n => n.type === 'chat')?.props.compact, true);
  handle.props.onPanResponderRelease(null, { dy: -60 }); tree = f.render(Window);
  assert.equal(tree.find(n => n.type === 'chat')?.props.compact, false);
  assert.equal(tree.filter(n => n.type === 'chat').length, 1);
  assert.equal(tree.filter(n => n.props.onMoveShouldSetPanResponderCapture).length, 1);
  assert.equal(tree.some(n => n.props.accessibilityLabel === 'Close chat'), false, 'full screen removes the backdrop');
  assert.deepEqual(f.calls, [], 'resizing never navigates or starts a request');
  tree.find(n => n.props.accessibilityLabel === 'Minimize chat')!.props.onPress();
  assert.equal(f.render(Window).find(n => n.type === 'chat')?.props.compact, true);
});

test('expand button, downward handle swipe, and close preserve route return behavior', () => {
  const f = fixture(); const Window = f.load('chat-window');
  f.render(Window).find(n => n.type === 'chat')!.props.onExpand();
  let tree = f.render(Window); assert.equal(tree.find(n => n.type === 'chat')?.props.compact, false);
  tree.find(n => n.props.onPanResponderRelease)!.props.onPanResponderRelease(null, { dy: 80 });
  tree = f.render(Window); assert.equal(tree.find(n => n.type === 'chat')?.props.compact, true);
  tree.find(n => n.type === 'chat')!.props.onClose(); assert.deepEqual(f.calls, ['dismiss', 'back']);
  f.calls.length = 0; f.back(false);
  tree.find(n => n.props.accessibilityLabel === 'Close chat')!.props.onPress();
  assert.deepEqual(f.calls, ['dismiss', '/(tabs)/today']);
});

test('short viewports keep room for the composer and shrink within the safe area', () => {
  const f = fixture(360); const Window = f.load('chat-window');
  const window = f.render(Window).find(n => n.props.accessibilityViewIsModal)!;
  const style = Object.assign({}, ...window.props.style);
  assert.equal(style.height, 360);
  assert.equal(style.flexShrink, 1);
  assert.equal(style.marginTop, 59);
  assert.equal(style.marginBottom, 46);
});
