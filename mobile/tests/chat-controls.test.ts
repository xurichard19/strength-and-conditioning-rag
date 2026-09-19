import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load, jsx, type Stubs, type TestModule, type TestNode, type TestValue } from './helpers.ts';

function nodes(node: TestValue): TestNode[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props.children)];
}

function fixture(reduceMotion = false) {
  const slots: TestValue[] = []; const effects: (() => () => void)[] = [];
  let cursor = 0; let focus!: () => (() => void) | undefined; let reduced!: (enabled: boolean) => void;
  let starts = 0; let stops = 0; let dismissals = 0; let removals = 0; let resets = 0;
  let timing!: TestModule;
  let chatMode = 'quick';
  const modules = {
    react: {
      useState: initial => {
        const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [slots[index], (value: TestValue) => { slots[index] = value; }];
      },
      useRef: initial => { const index = cursor++; return slots[index] ??= { current: initial }; },
      useEffect: effect => { effects.push(effect); }, useCallback: callback => callback,
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { useFocusEffect: callback => { focus = callback; } },
    'lucide-react-native': { Zap: 'zap', BookOpen: 'book', Check: 'check', ChevronDown: 'chevron', X: 'x' },
    'react-native-safe-area-context': { SafeAreaProvider: 'safe-provider', SafeAreaView: 'safe-view' },
    'react-native': {
      View: 'view', Modal: 'modal', Pressable: 'button', ScrollView: 'scroll', Platform: { OS: 'ios' },
      StyleSheet: { create: style => style }, Keyboard: { dismiss: () => { dismissals++; } },
      AccessibilityInfo: {
        isReduceMotionEnabled: async () => reduceMotion,
        addEventListener: (_event, listener) => { reduced = listener; return { remove: () => { removals++; } }; },
      },
      Animated: {
        View: 'animated', Value: function (this: TestModule) {
          this.interpolate = (value: TestValue) => value; this.setValue = () => { resets++; };
        },
        timing: (_value, options) => { timing = options; return {}; },
        loop: () => ({ start: () => { starts++; }, stop: () => { stops++; } }),
      },
      Easing: { linear: 'linear' },
    },
    './ui': { AppText: 'text' }, '@/state/app-context': { useApp: () => ({ colors: {}, chatMode,
      setChatMode: (value: string) => { chatMode = value; } }) },
  } satisfies Stubs;
  return {
    load: (path: string) => load(path, modules),
    render: (component: TestValue, props: TestModule = {}) => { cursor = 0; return nodes(component(props)); },
    mount: () => effects[0](), focus: () => focus(),
    reduce: (value: boolean) => reduced(value),
    counts: () => ({ starts, stops, dismissals, removals, resets }), timing: () => timing,
  };
}

test('mode selector defaults to quick, updates shared selection, and marks the selected choice', () => {
  const f = fixture(); const { ChatModeSelector } = f.load('components/chat-mode-selector.tsx');
  const render = () => f.render(ChatModeSelector);
  const toggle = render().find(node => node.props.accessibilityLabel === 'Chat mode: Quick chat')!;
  assert.deepEqual(nodes(toggle).map(node => node.type), ['button', 'zap', 'text', 'chevron']);
  assert.equal(nodes(toggle).find(node => node.type === 'text')?.props.children, 'Quick chat');
  const toggleStyle = Object.assign({}, ...toggle.props.style({ pressed: false }));
  assert.equal(toggleStyle.alignSelf, undefined);
  assert.equal(toggleStyle.minHeight, 44);
  assert.equal(toggleStyle.height, undefined);
  assert.equal(toggleStyle.marginBottom, undefined);
  toggle.props.onPress();
  let options = render().filter(node => node.props.accessibilityRole === 'radio');
  assert.equal(options.length, 2);
  assert.equal(options[0].props['aria-checked'], true);
  assert.equal(options[1].props['aria-checked'], false);
  assert.equal(options[1].props.accessibilityLabel, 'Deep research. A deeper dive across more sources.');
  options[1].props.onPress();
  assert.equal(render().some(node => node.type === 'modal'), false);
  const deepToggle = render().find(node => node.props.accessibilityLabel === 'Chat mode: Deep research')!;
  assert.deepEqual(nodes(deepToggle).map(node => node.type), ['button', 'book', 'text', 'chevron']);
  assert.equal(nodes(deepToggle).find(node => node.type === 'text')?.props.children, 'Deep research');
  deepToggle.props.onPress();
  options = render().filter(node => node.props.accessibilityRole === 'radio');
  assert.equal(options[1].props['aria-checked'], true);
  assert.equal(options[0].props['aria-checked'], false);
  assert.equal(f.counts().dismissals, 2);
  // Selection updates the provider, but the menu itself never starts a request.
});

test('mode menu dismisses on backdrop, back, and tab blur while retaining its local selection', () => {
  const f = fixture(); const { ChatModeSelector } = f.load('components/chat-mode-selector.tsx');
  const render = () => f.render(ChatModeSelector);
  const open = () => render().find(node => node.props.accessibilityLabel === 'Chat mode: Quick chat')!.props.onPress();
  open(); render().find(node => node.props.accessibilityLabel === 'Close chat mode selector')!.props.onPress();
  assert.equal(render().some(node => node.type === 'modal'), false);
  open(); render().find(node => node.type === 'modal')!.props.onRequestClose();
  assert.equal(render().some(node => node.type === 'modal'), false);
  open(); render(); f.focus()!();
  assert.equal(render().some(node => node.type === 'modal'), false);
  assert.ok(render().find(node => node.props.accessibilityLabel === 'Chat mode: Quick chat'));
});

test('each pre-answer stage has a stable accessible label and exactly three staggered dots', () => {
  const f = fixture(); const { ChatProgress } = f.load('components/chat-progress.tsx');
  for (const [stage, label] of [[undefined, 'Thinking…'], ['fetching_user_context', 'Reading your training context…'],
    ['researching', 'Reviewing the research…'], ['thinking', 'Thinking…']]) {
    const tree = f.render(ChatProgress, { stage });
    assert.equal(tree[0].props.accessibilityLabel, label);
    assert.equal(tree[0].props.accessibilityLiveRegion, 'polite');
    const dots = tree.filter(node => node.type === 'animated');
    assert.equal(dots.length, 3);
    assert.ok(tree.some(node => node.props.importantForAccessibility === 'no-hide-descendants'));
    const transforms = dots.map(dot => dot.props.style[1].transform[0].translateY);
    assert.ok(transforms[0].inputRange[2] < transforms[1].inputRange[2]);
    assert.ok(transforms[1].inputRange[2] < transforms[2].inputRange[2]);
  }
});

test('dot animation uses one nonblocking native loop and stops on blur or reduced motion', async () => {
  const f = fixture(); const { ChatProgress } = f.load('components/chat-progress.tsx');
  f.render(ChatProgress); const unmount = f.mount(); await Promise.resolve(); f.render(ChatProgress);
  const blur = f.focus()!;
  assert.equal(f.counts().starts, 1);
  assert.equal(f.timing().useNativeDriver, true);
  assert.equal(f.timing().isInteraction, false);
  assert.equal(f.timing().duration, 1200);
  blur(); assert.equal(f.counts().stops, 1); assert.equal(f.counts().resets, 1);
  const stop = f.focus()!; assert.equal(f.counts().starts, 2);
  f.reduce(true); stop(); f.render(ChatProgress); assert.equal(f.focus(), undefined);
  assert.equal(f.counts().starts, 2);
  unmount(); assert.equal(f.counts().removals, 1);
});

test('reduced motion keeps the dots static from the first render', async () => {
  const f = fixture(true); const { ChatProgress } = f.load('components/chat-progress.tsx');
  f.render(ChatProgress); const unmount = f.mount(); await Promise.resolve(); f.render(ChatProgress);
  assert.equal(f.focus(), undefined); assert.equal(f.counts().starts, 0); unmount();
});
