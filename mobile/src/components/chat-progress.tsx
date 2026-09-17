import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import type { ChatStage } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { AppText } from './ui';

const labels: Record<ChatStage, string> = {
  fetching_user_context: 'Fetching user context', researching: 'Researching', thinking: 'Thinking',
};

/** Show pre-answer work with one native animation; pause off-screen and respect reduced motion. */
export function ChatProgress({ stage }: { stage?: ChatStage }) {
  const { colors } = useApp();
  const [phase] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  useFocusEffect(useCallback(() => {
    if (reduceMotion) return;
    const animation = Animated.loop(Animated.timing(phase, {
      toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web', isInteraction: false,
    }));
    animation.start();
    return () => { animation.stop(); phase.setValue(0); };
  }, [phase, reduceMotion]));
  const label = labels[stage ?? 'thinking'];
  return <View accessible accessibilityLabel={`${label}…`} accessibilityLiveRegion="polite" style={styles.progress}>
    <AppText tone="secondary" style={styles.label}>{label}</AppText>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.dots}>
      {[0, 1, 2].map(index => {
        const inputRange = [0, 0.1 + index * 0.15, 0.25 + index * 0.15, 0.4 + index * 0.15, 1];
        return <Animated.View key={index} style={[styles.dot, { backgroundColor: colors.textSecondary,
          transform: [{ translateY: phase.interpolate({ inputRange, outputRange: [0, 0, -3, 0, 0] }) }],
        }]} />;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  label: { fontSize: 13, lineHeight: 19, flexShrink: 1 },
  dots: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, paddingBottom: 4, height: 19 },
  dot: { width: 3, height: 3, borderRadius: 2 },
});
