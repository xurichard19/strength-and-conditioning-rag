import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load, jsx, type TestValue, type TestNode } from './helpers.ts';

function fixture(initialState = 'active') {
  const slots: TestValue[] = []; let cursor = 0; let now = 1_000; let timerId = 0;
  let onFocus!: () => (() => void); let cleanup: (() => void) | undefined;
  const intervals = new Map<number, () => void>();
  const listeners = new Set<(state: string) => void>();
  const appState = {
    currentState: initialState,
    addEventListener: (_event: string, callback: (state: string) => void) => {
      listeners.add(callback); return { remove: () => listeners.delete(callback) };
    },
  };
  const { default: WorkoutScreen } = load('screens/workout-screen.tsx', {
    react: {
      useState: initial => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], (value: TestValue) => { slots[index] = value; }];
      },
      useRef: initial => { const index = cursor++; return slots[index] ??= { current: initial }; },
      useMemo: fn => fn(), useCallback: fn => fn,
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { useLocalSearchParams: () => ({ id: 'session' }), useFocusEffect: fn => { onFocus = fn; } },
    'lucide-react-native': { Clock3: 'clock', X: 'close' },
    'react-native': { AppState: appState, View: 'view', Platform: { OS: 'ios' }, StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { SafeAreaView: 'safe' },
    '@/components/ui': { AppText: 'text' },
    '@/design/tokens': { fonts: {}, radius: {} },
    '@/state/app-context': { useApp: () => ({ colors: {}, sessions: [{ id: 'session', title: 'Workout', exercises: [] }] }) },
  }, {
    Date: { now: () => now },
    setInterval: (callback: () => void, duration: number) => {
      assert.equal(duration, 1000);
      const id = ++timerId; intervals.set(id, callback); return id;
    },
    clearInterval: (id: number) => intervals.delete(id),
  });
  const nodes = (node: TestValue): TestNode[] => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props.children)];
  };
  const Timer = nodes(WorkoutScreen()).find(node => node.type?.name === 'WorkoutTimer')!.type;
  slots.length = 0;
  const display = () => { cursor = 0; return nodes(Timer()).find(node => node.type === 'text')!.props.children; };
  display();
  return {
    display,
    focus: () => { cleanup = onFocus(); },
    blur: () => { cleanup?.(); cleanup = undefined; },
    advance: (milliseconds: number) => { now += milliseconds; intervals.forEach(callback => callback()); },
    setAppState: (state: string) => { appState.currentState = state; listeners.forEach(callback => callback(state)); },
    get intervalCount() { return intervals.size; },
    get listenerCount() { return listeners.size; },
  };
}

test('workout elapsed time derives from its start timestamp even when ticks arrive late', () => {
  const timer = fixture(); timer.focus();
  assert.equal(timer.display(), '00:00');
  timer.advance(12_450);
  assert.equal(timer.display(), '00:12');
  timer.advance(49_100);
  assert.equal(timer.display(), '01:01');
  assert.equal(timer.intervalCount, 1);
  timer.blur();
});

test('workout timer stops background work and catches up immediately on resume', () => {
  const timer = fixture(); timer.focus(); timer.advance(2_000);
  timer.setAppState('inactive');
  assert.equal(timer.intervalCount, 0);
  timer.setAppState('background'); timer.advance(120_000);
  assert.equal(timer.display(), '00:02');
  timer.setAppState('active');
  assert.equal(timer.display(), '02:02');
  assert.equal(timer.intervalCount, 1);
  timer.setAppState('active');
  assert.equal(timer.intervalCount, 1);
  timer.blur();
});

test('blur and unmount release workout timers/listeners, and refocus keeps elapsed time', () => {
  const timer = fixture('background'); timer.focus();
  assert.equal(timer.intervalCount, 0);
  assert.equal(timer.listenerCount, 1);
  timer.setAppState('active'); timer.advance(1_000); timer.blur();
  assert.equal(timer.intervalCount, 0);
  assert.equal(timer.listenerCount, 0);
  timer.advance(60_000); timer.setAppState('active');
  assert.equal(timer.display(), '00:01');
  assert.equal(timer.intervalCount, 0);
  timer.focus();
  assert.equal(timer.display(), '01:01');
  timer.blur();
  assert.equal(timer.intervalCount, 0);
  assert.equal(timer.listenerCount, 0);
});
