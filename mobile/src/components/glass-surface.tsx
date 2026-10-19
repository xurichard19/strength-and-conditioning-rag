import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useApp } from '@/state/app-context';

const glassAvailable = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
const TransparencyContext = createContext(true);

/** Share one accessibility subscription across floating controls, including modal menus. */
export function GlassProvider({ children }: { children: ReactNode }) {
  const [reduceTransparency, setReduceTransparency] = useState(Platform.OS === 'ios');
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let reading = true;
    const listener = AccessibilityInfo.addEventListener('reduceTransparencyChanged', value => {
      reading = false;
      setReduceTransparency(value);
    });
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (reading) setReduceTransparency(value);
    }).catch(() => {});
    return () => { reading = false; listener.remove(); };
  }, []);
  return <TransparencyContext value={reduceTransparency}>{children}</TransparencyContext>;
}

/** Decorative background only: controls retain their own hit targets and accessibility. */
export function GlassBackdrop({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors, colorScheme } = useApp();
  const reduceTransparency = useContext(TransparencyContext);
  const surface = [StyleSheet.absoluteFill, styles.surface, style];
  return glassAvailable && !reduceTransparency ? (
    <GlassView pointerEvents="none" glassEffectStyle="regular" colorScheme={colorScheme} style={surface} />
  ) : (
    <View pointerEvents="none" style={[surface, styles.fallback, {
      backgroundColor: reduceTransparency ? colors.tab : `${colors.tab}F0`,
      borderColor: colorScheme === 'dark' ? '#FFFFFF26' : '#FFFFFFCC',
    }]} />
  );
}

const styles = StyleSheet.create({
  surface: { borderRadius: 28, overflow: 'hidden' },
  fallback: { borderWidth: StyleSheet.hairlineWidth },
});
