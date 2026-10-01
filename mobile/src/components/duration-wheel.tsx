import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { AppText } from '@/components/ui';
import { radius } from '@/design/tokens';
import { formatSessionDuration, normalizeSessionMinutes, sessionDurationAtIndex, SESSION_DURATIONS, SESSION_MINUTES_MAX, SESSION_MINUTES_MIN } from '@/lib/session-duration';
import { useApp } from '@/state/app-context';

export type DurationWheelProps = { minutes: number; onChange: (minutes: number) => void };
const ROW_HEIGHT = 52;
const PADDING = ROW_HEIGHT * 2;
const offsetFor = (minutes: number) => SESSION_DURATIONS.indexOf(minutes) * ROW_HEIGHT;

export function DurationWheel({ minutes, onChange }: DurationWheelProps) {
  const { colors } = useApp();
  const scroll = useRef<ScrollView>(null);
  const selected = normalizeSessionMinutes(minutes);
  const latest = useRef(selected);
  const [initialOffset] = useState(() => ({ x: 0, y: offsetFor(selected) }));

  // Reposition only for an external change, never interrupt an active swipe.
  useEffect(() => {
    if (latest.current !== selected) {
      latest.current = selected;
      scroll.current?.scrollTo({ y: offsetFor(selected), animated: false });
    }
  }, [selected]);

  const change = (value: number) => {
    const next = normalizeSessionMinutes(value);
    if (next !== latest.current) {
      latest.current = next;
      onChange(next);
    }
  };
  const select = (value: number) => {
    const next = normalizeSessionMinutes(value);
    change(next);
    scroll.current?.scrollTo({ y: offsetFor(next), animated: false });
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    change(sessionDurationAtIndex(event.nativeEvent.contentOffset.y / ROW_HEIGHT));
  };

  return (
    <View accessible accessibilityRole="adjustable" accessibilityLabel="Session length"
      accessibilityHint="Swipe up or down to adjust the duration. Five-minute steps up to one hour, then 15-minute steps."
      accessibilityValue={{ min: SESSION_MINUTES_MIN, max: SESSION_MINUTES_MAX, now: selected, text: formatSessionDuration(selected) }}
      accessibilityActions={[{ name: 'increment', label: 'Longer session' }, { name: 'decrement', label: 'Shorter session' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'increment') select(sessionDurationAtIndex(SESSION_DURATIONS.indexOf(latest.current) + 1));
        if (nativeEvent.actionName === 'decrement') select(sessionDurationAtIndex(SESSION_DURATIONS.indexOf(latest.current) - 1));
      }} style={styles.wheel}>
      <View pointerEvents="none" style={[styles.selection, { backgroundColor: colors.tintSoft, borderColor: colors.tint }]} />
      <ScrollView ref={scroll} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={styles.scroll} contentContainerStyle={styles.options} contentOffset={initialOffset}
        onLayout={() => scroll.current?.scrollTo({ y: offsetFor(latest.current), animated: false })}
        showsVerticalScrollIndicator={false} snapToInterval={ROW_HEIGHT} decelerationRate="fast"
        bounces={false} overScrollMode="never" nestedScrollEnabled scrollEventThrottle={16}
        onScroll={onScroll} onMomentumScrollEnd={onScroll} onScrollEndDrag={onScroll}>
        {SESSION_DURATIONS.map((value, index) => {
          const distance = Math.abs(index - SESSION_DURATIONS.indexOf(selected));
          return <Pressable key={value} accessible={false} onPress={() => select(value)} style={styles.option}>
            <AppText weight={value === selected ? 'semibold' : 'regular'} maxFontSizeMultiplier={1.25}
              style={[styles.label, { color: value === selected ? colors.tintText : colors.textSecondary,
                opacity: distance > 1 ? 0.35 : distance === 1 ? 0.65 : 1,
                transform: [{ scale: distance > 1 ? 0.82 : distance === 1 ? 0.92 : 1 }] }]}>
              {formatSessionDuration(value)}
            </AppText>
          </Pressable>;
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: { height: ROW_HEIGHT * 5, width: '100%', maxWidth: 300, alignSelf: 'center', overflow: 'hidden' },
  scroll: { flex: 1 },
  options: { paddingVertical: PADDING },
  selection: { position: 'absolute', top: PADDING, left: 0, right: 0, height: ROW_HEIGHT, borderRadius: radius.card, borderWidth: 1 },
  option: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 24, lineHeight: 32, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
