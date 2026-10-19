import { router, useSegments } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/state/app-context';

/** One chat entry point above the current page, clear of the tab bar and keyboard. */
export default function ChatLauncher() {
  const { accountReady, authSession, colors, hydrated, passwordRecovery, profile } = useApp();
  const [page] = useSegments();
  const insets = useSafeAreaInsets();
  const [keyboardShown, setKeyboardShown] = useState(Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardShown(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardShown(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (!hydrated || !authSession || !accountReady || !profile.onboardingComplete || passwordRecovery || keyboardShown
      || !page || ['auth', 'onboarding', 'reset-password', 'chat', 'account'].includes(page)) return null;
  const bottom = page === '(tabs)' ? 76 + Math.max(insets.bottom, 18) : insets.bottom + 16;
  return <Pressable accessibilityRole="button" accessibilityLabel="Open chat" accessibilityHint="Opens a small chat window."
    onPress={() => router.navigate('/chat')}
    style={({ pressed }) => [styles.bubble, { bottom, right: insets.right + 18, backgroundColor: colors.strong }, pressed && { opacity: 0.8 }]}>
    <MessageCircle color={colors.strongText} size={25} strokeWidth={1.8} />
  </Pressable>;
}

const styles = StyleSheet.create({
  bubble: { position: 'absolute', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(0,0,0,0.18)' },
});
