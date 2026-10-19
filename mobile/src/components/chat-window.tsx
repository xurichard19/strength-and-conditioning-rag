import { router } from 'expo-router';
import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, PanResponder, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import ChatScreen from '@/screens/chat-screen';
import { useApp } from '@/state/app-context';

/** Resize one mounted conversation; dragging the handle never steals message scrolling. */
export default function ChatWindow() {
  const { colors } = useApp();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const close = () => { Keyboard.dismiss(); if (router.canGoBack()) router.back(); else router.replace('/(tabs)/today'); };
  const [drag] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, { dx, dy }) => Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx),
    onPanResponderRelease: (_event, { dy }) => {
      if (dy < -36) setExpanded(true);
      else if (dy > 60) setExpanded(false);
    },
  }));
  return <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    {!expanded ? <Pressable accessibilityRole="button" accessibilityLabel="Close chat" onPress={close}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} /> : null}
    <View accessibilityViewIsModal style={[styles.window, { backgroundColor: colors.background, borderColor: colors.separator },
      expanded ? { flex: 1, alignSelf: 'stretch', paddingTop: insets.top, paddingBottom: insets.bottom }
        : { width: Math.min(420, width - insets.left - insets.right - 24), height: Math.min(540, Math.max(360, height * 0.66)),
          marginTop: insets.top + 12, marginRight: insets.right + 12, marginBottom: insets.bottom + 12,
          borderRadius: 28, borderWidth: StyleSheet.hairlineWidth }]}>
      <View {...drag.panHandlers}>
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Minimize chat' : 'Expand chat'}
          accessibilityHint={expanded ? 'Returns to the small chat window.' : 'Swipe up or tap to open full chat and history.'}
          onPress={() => setExpanded(value => !value)} style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: colors.fillStrong }]} />
          {!expanded ? <AppText tone="secondary" style={styles.hint}>Swipe up to expand</AppText> : null}
        </Pressable>
      </View>
      <ChatScreen compact={!expanded} onExpand={() => setExpanded(true)} onClose={close} />
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'flex-end' },
  window: { flexShrink: 1, overflow: 'hidden', maxHeight: '100%' },
  handleArea: { minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 5 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  hint: { fontSize: 10, lineHeight: 14 },
});
