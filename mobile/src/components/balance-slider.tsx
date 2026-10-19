import { useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { useApp } from '@/state/app-context';
import { BALANCE_LABELS, BALANCE_STEP, balanceFromValue, balanceValue, type Balance } from '@/lib/onboarding';

export type BalanceSliderProps = { balance: Balance; onChange: (value: Balance) => void };

export function BalanceSlider({ balance, onChange }: BalanceSliderProps) {
  const { colors } = useApp();
  const [width, setWidth] = useState(0);
  const choose = (event: GestureResponderEvent) => {
    if (width > 32) onChange(balanceFromValue(Math.max(0, Math.min(100, (event.nativeEvent.locationX - 16) / (width - 32) * 100))));
  };
  return (
    <View accessible accessibilityRole="adjustable" accessibilityLabel="Training balance"
      accessibilityValue={{ min: 0, max: 100, now: balanceValue(balance), text: BALANCE_LABELS[balance] }}
      accessibilityActions={[{ name: 'increment', label: 'More cardio' }, { name: 'decrement', label: 'More lifting' }]}
      onAccessibilityAction={event => {
        const action = event.nativeEvent.actionName;
        if (action === 'increment' || action === 'decrement') {
          onChange(balanceFromValue(balanceValue(balance) + (action === 'increment' ? BALANCE_STEP : -BALANCE_STEP)));
        }
      }}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
      onResponderGrant={choose} onResponderMove={choose} style={styles.slider}>
      <View pointerEvents="none" style={styles.track}>
        <View style={[styles.half, { backgroundColor: colors.strength }]} />
        <View style={[styles.half, { backgroundColor: colors.endurance }]} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: Math.max(0, width - 32) * balanceValue(balance) / 100, backgroundColor: colors.card, borderColor: colors.tint }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  slider: { height: 48, justifyContent: 'center' },
  track: { height: 6, marginHorizontal: 16, flexDirection: 'row', borderRadius: 3, overflow: 'hidden' },
  half: { flex: 1 },
  thumb: { position: 'absolute', width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
});
