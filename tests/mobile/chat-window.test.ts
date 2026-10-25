import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jsx, load, nodes, type Stubs, type TestModule, type TestValue } from './helpers.ts';

function fixture(height = 844) {
  const slots: TestValue[] = []; let cursor = 0; let back = true; let width = 390;
  const effects: (() => () => void)[] = []; const listeners: TestModule = {};
  const calls: TestValue[] = []; const shared: TestModule[] = []; let removals = 0;
  const navigationPositions: TestValue[] = [];
  const gesture = () => {
    const callbacks: TestModule = {};
    for (const name of ['minDistance', 'averageTouches', 'onBegin', 'onStart', 'onUpdate', 'onEnd', 'onFinalize']) {
      callbacks[name] = (value: TestValue) => { callbacks[`_${name}`] = value; return callbacks; };
    }
    return callbacks;
  };
  const app = { hydrated: true, accountReady: true, authSession: {}, passwordRecovery: false,
    colors: { text: '#F6F7F4' }, profile: { onboardingComplete: true } };
  let page = '(tabs)';
  const modules = {
    react: { useState: initial => {
      const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (value: TestValue) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    }, useEffect: effect => effects.push(effect) },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { useSegments: () => [page], router: { navigate: (value: string) => {
      calls.push(value); navigationPositions.push(shared.slice(0, 2).map(value => value.get()));
    },
      canGoBack: () => back, back: () => calls.push('back'), replace: (value: string) => calls.push(value) } },
    'react-native': { View: 'view', Pressable: 'button', KeyboardAvoidingView: 'keyboard', Platform: { OS: 'ios' },
      useWindowDimensions: () => ({ width, height }), StyleSheet: { create: value => value },
      Keyboard: { isVisible: () => false, dismiss: () => calls.push('dismiss'), addListener: (event, callback) => {
        listeners[event] = callback; return { remove: () => removals++ };
      } }, PanResponder: { create: config => ({ panHandlers: config }) } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) },
    'lucide-react-native': { MessageCircle: 'icon' }, '@/components/ui': { AppText: 'text' },
    './glass-surface': { GlassBackdrop: 'glass-backdrop' },
    'react-native-gesture-handler': { GestureDetector: 'gesture', Pressable: 'button', Gesture: { Pan: gesture } },
    'react-native-reanimated': { default: { View: 'animated' }, __esModule: true,
      useAnimatedStyle: style => style(),
      useSharedValue: initial => {
        const index = cursor++;
        if (!(index in slots)) {
          const value: TestModule = { current: initial, get: () => value.current, set: (next: TestValue) => {
            if (next?.animation) value.pending = { ...next, from: value.current };
            else { value.pending = undefined; value.current = next; }
          } };
          slots[index] = value; shared.push(value);
        }
        return slots[index];
      },
      withSpring: (to, options, callback) => ({ animation: true, to, options, callback }),
      cancelAnimation: value => { value.pending?.callback?.(false); value.pending = undefined; },
      clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
      Easing: { out: value => value, cubic: 'cubic' }, ReduceMotion: { System: 'system' } },
    'react-native-worklets': { scheduleOnRN: callback => callback(), scheduleOnUI: callback => callback() },
    '@/screens/chat-screen': { default: 'chat', __esModule: true }, '@/state/app-context': { useApp: () => app },
  } satisfies Stubs;
  return { app, calls, listeners, effects, navigationPositions, removals: () => removals,
    resize: (nextWidth: number, nextHeight: number) => { width = nextWidth; height = nextHeight; },
    advance: (progress = 1, axis?: number) => shared.forEach((value, index) => {
      if (!value.pending || (axis !== undefined && axis !== index)) return;
      value.current = value.pending.from + (value.pending.to - value.pending.from) * progress;
      if (progress === 1) { const callback = value.pending.callback; value.pending = undefined; callback?.(true); }
    }),
    page: (value: string) => { page = value; }, back: (value: boolean) => { back = value; },
    load: (name: string) => load(`components/${name}.tsx`, modules).default,
    render: (component: TestValue) => { cursor = 0; return nodes(component()); } };
}

function position(tree: ReturnType<typeof nodes>) {
  const style = Object.assign({}, ...tree.find(node => node.type === 'animated')!.props.style);
  return { x: style.transform[0].translateX, y: style.transform[1].translateY };
}

test('floating launcher opens one chat route and stays above tabs and safe areas', () => {
  const f = fixture(); const Launcher = f.load('chat-launcher');
  const tree = f.render(Launcher);
  const button = tree.find(n => n.props.accessibilityLabel === 'Open chat')!;
  button.props.onPress(); assert.deepEqual(f.calls, ['/chat']);
  assert.deepEqual(position(tree), { x: 316, y: 678 });
  assert.equal(button.props.requireExternalGestureToFail, tree[0].props.gesture);
  assert.equal(nodes(button).find(node => node.type === 'icon')?.props.color, f.app.colors.text);
  assert.equal(nodes(button).filter(node => node.type === 'glass-backdrop').length, 1);
  f.page('session');
  assert.deepEqual(position(f.render(Launcher)), { x: 316, y: 738 });
});

test('dragging chooses the nearest allowed corner by screen distance, clamps, and never opens chat', () => {
  for (const [width, height, targetX, targetY, x, y] of [
    [390, 844, 0.1, 0.4, 316, 59], // Portrait: pixel distance favors top-right, despite normalized distance.
    [390, 844, 0.1, 0.49, 18, 678],
    [844, 390, 0.4, 0.1, 18, 224], // Landscape reverses that choice for the top-left region.
    [844, 390, 0.49, 0.1, 770, 59],
    [390, 844, 0.8, 0.2, 316, 59], [390, 844, 0.2, 0.8, 18, 678],
    [390, 844, 0.8, 0.8, 316, 678], [390, 844, -2, -2, 316, 59], [390, 844, 2, 2, 316, 678],
  ]) {
    const f = fixture(); const Launcher = f.load('chat-launcher');
    f.resize(width, height);
    const drag = f.render(Launcher)[0].props.gesture;
    assert.equal(drag._minDistance, 8);
    drag._onStart(); drag._onUpdate({ translationX: (targetX - 1) * (width - 92), translationY: (targetY - 1) * (height - 225) });
    const moved = position(f.render(Launcher));
    assert.ok(moved.x >= 18 && moved.x <= width - 74 && moved.y >= 59 && moved.y <= height - 166);
    drag._onEnd(); f.advance(1.08);
    const bounce = position(f.render(Launcher));
    assert.ok(bounce.x >= 12 && bounce.x <= width - 68 && bounce.y >= 53 && bounce.y <= height - 160,
      'spring overshoot stays inside safe areas and above the dock');
    f.advance();
    assert.deepEqual(position(f.render(Launcher)), { x, y });
    assert.deepEqual(f.calls, []);
  }
});

test('drift ignores taps until both springs finish; interrupted and cancelled drags still settle', () => {
  const f = fixture(); const Launcher = f.load('chat-launcher');
  let drag = f.render(Launcher)[0].props.gesture;
  drag._onStart(); drag._onUpdate({ translationX: -200, translationY: -400 }); drag._onEnd();
  f.advance(0.2);
  let tree = f.render(Launcher);
  assert.ok(position(tree).x > 18 && position(tree).y > 59, 'animation is still between corners');
  drag = tree[0].props.gesture;
  const drifting = position(tree);
  drag._onBegin?.(); drag._onFinalize?.({}, false); // A tap never activates the pan.
  tree.find(node => node.props.accessibilityLabel === 'Open chat')!.props.onPress();
  assert.deepEqual(f.calls, []);
  assert.deepEqual(position(f.render(Launcher)), drifting, 'a tap cannot snap or interrupt the drift');
  f.advance(1, 0);
  tree.find(node => node.props.accessibilityLabel === 'Open chat')!.props.onPress();
  assert.deepEqual(f.calls, [], 'one finished axis does not enable tapping');
  f.advance(1, 1);
  tree = f.render(Launcher);
  assert.deepEqual(position(tree), { x: 316, y: 59 });
  assert.deepEqual(f.calls, [], 'ignored taps are not queued');
  tree.find(node => node.props.accessibilityLabel === 'Open chat')!.props.onPress();
  assert.deepEqual(f.navigationPositions, [[1, 0]]);
  drag = f.render(Launcher)[0].props.gesture;
  drag._onStart(); drag._onUpdate({ translationX: -268.2, translationY: 303.31 });
  drag._onEnd({}, false); f.advance(0.2);
  drag._onStart(); drag._onEnd({}, false); // Re-grabbing cancels old springs without unlocking taps.
  f.render(Launcher).find(node => node.props.accessibilityLabel === 'Open chat')!.props.onPress();
  assert.deepEqual(f.calls, ['/chat']);
  f.advance();
  assert.deepEqual(position(f.render(Launcher)), { x: 18, y: 678 }, 'cancellation in the top-left region still chooses an allowed corner');
  assert.deepEqual(f.calls, ['/chat']);
  f.render(Launcher).find(node => node.props.accessibilityLabel === 'Open chat')!.props.onPress();
  assert.deepEqual(f.calls, ['/chat', '/chat']);
});

test('chosen corner follows viewport and dock changes and survives hiding the launcher', () => {
  const f = fixture(); const Launcher = f.load('chat-launcher');
  const drag = f.render(Launcher)[0].props.gesture;
  drag._onStart(); drag._onUpdate({ translationX: -250, translationY: -20 }); drag._onEnd(); f.advance();
  f.page('chat'); assert.equal(f.render(Launcher).length, 0);
  f.resize(844, 390); f.page('(tabs)');
  assert.deepEqual(position(f.render(Launcher)), { x: 18, y: 224 });
  f.page('session'); assert.deepEqual(position(f.render(Launcher)), { x: 18, y: 284 });
  f.resize(320, 200); f.page('(tabs)');
  assert.deepEqual(position(f.render(Launcher)), { x: 18, y: 59 }, 'tiny viewports do not create a negative travel range');
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
  f.listeners.keyboardWillHide(); assert.ok(f.render(Launcher).some(node => node.props.accessibilityLabel === 'Open chat'));
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
