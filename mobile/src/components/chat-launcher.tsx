import { router, useSegments } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, LegacyPressable as Pressable } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, clamp, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { useApp } from '@/state/app-context';
import { GlassBackdrop } from './glass-surface';

const openChat = () => router.navigate('/chat');

/** Drag anywhere; taps open chat only after the bubble finishes settling into a safe corner. */
export default function ChatLauncher() {
  const { accountReady, authSession, colors, hydrated, passwordRecovery, profile } = useApp();
  const [page] = useSegments();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [keyboardShown, setKeyboardShown] = useState(Keyboard.isVisible());
  // Normalized coordinates retain the chosen corner across rotation and page changes.
  const x = useSharedValue(1);
  const y = useSharedValue(1);
  const settling = useSharedValue(0);
  const origin = useSharedValue({ x: 1, y: 1 });
  const left = insets.left + 18;
  const top = insets.top + 12;
  const bottom = page === '(tabs)' ? 76 + Math.max(insets.bottom, 18) : insets.bottom + 16;
  const travelX = Math.max(0, width - insets.right - 18 - 56 - left);
  const travelY = Math.max(0, height - bottom - 56 - top);
  const settle = () => {
    'worklet';
    let targetX = Math.round(x.get());
    let targetY = Math.round(y.get());
    if (targetX === 0 && targetY === 0) {
      // Keep the top-left controls clear; compare actual distances on this screen.
      const topRight = Math.hypot((1 - x.get()) * travelX, y.get() * travelY);
      const bottomLeft = Math.hypot(x.get() * travelX, (1 - y.get()) * travelY);
      if (topRight <= bottomLeft) targetX = 1;
      else targetY = 1;
    }
    const spring = { duration: 800, dampingRatio: 0.72, reduceMotion: ReduceMotion.System };
    settling.set(2);
    const finish = (finished?: boolean) => { if (finished) settling.set(settling.get() - 1); };
    x.set(withSpring(targetX, spring, finish));
    y.set(withSpring(targetY, spring, finish));
  };
  const drag = Gesture.Pan().minDistance(8).averageTouches(true)
    .onStart(() => {
      cancelAnimation(x); cancelAnimation(y);
      settling.set(2);
      origin.set({ x: x.get(), y: y.get() });
    })
    .onUpdate(event => {
      x.set(clamp(origin.get().x + event.translationX / Math.max(1, travelX), 0, 1));
      y.set(clamp(origin.get().y + event.translationY / Math.max(1, travelY), 0, 1));
    })
    .onEnd(settle);
  const position = useAnimatedStyle(() => ({
    // Allow a small rebound without crossing the safe areas or the tab dock.
    transform: [{ translateX: left + clamp(x.get() * travelX, -6, travelX + 6) },
      { translateY: top + clamp(y.get() * travelY, -6, travelY + 6) }],
  }));
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardShown(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardShown(false));
    return () => { show.remove(); hide.remove(); cancelAnimation(x); cancelAnimation(y); };
  }, [x, y]);
  if (!hydrated || !authSession || !accountReady || !profile.onboardingComplete || passwordRecovery || keyboardShown
      || !page || ['auth', 'onboarding', 'reset-password', 'chat', 'account'].includes(page)) return null;
  return <GestureDetector gesture={drag}>
    <Animated.View style={[styles.position, position]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open chat"
        accessibilityHint="Opens a small chat window. Drag to move to another corner."
        requireExternalGestureToFail={drag}
        onPress={() => scheduleOnUI(() => {
          'worklet';
          if (!settling.get()) scheduleOnRN(openChat);
        })}
        style={({ pressed }) => [styles.bubble, pressed && { transform: [{ scale: 0.96 }] }]}>
        <GlassBackdrop />
        <View pointerEvents="none"><MessageCircle color={colors.text} size={25} strokeWidth={1.8} /></View>
      </Pressable>
    </Animated.View>
  </GestureDetector>;
}

const styles = StyleSheet.create({
  position: { position: 'absolute', top: 0, left: 0 },
  bubble: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(0,0,0,0.18)' },
});
