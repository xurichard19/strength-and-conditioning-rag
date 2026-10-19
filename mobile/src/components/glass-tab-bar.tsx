import { MaterialTopTabBar, type MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassBackdrop } from './glass-surface';

export default function GlassTabBar(props: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const [keyboardShown, setKeyboardShown] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardShown(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardShown(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  if (keyboardShown) return null;
  return (
    <View style={[styles.dock, { bottom: Math.max(insets.bottom, 18), left: 12 + insets.left, right: 12 + insets.right }]}>
      <GlassBackdrop style={styles.surface} />
      <View style={styles.surface}><MaterialTopTabBar {...props} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', height: 64, borderRadius: 32, shadowColor: '#000', shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 6 }, shadowRadius: 18, elevation: 8 },
  surface: { borderRadius: 32, overflow: 'hidden' },
});
