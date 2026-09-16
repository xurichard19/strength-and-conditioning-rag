import { X } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, TextInput, View, type TextProps } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { fonts } from '@/design/tokens';
import { useApp } from '@/state/app-context';
import { AppText } from './ui';

/** iOS Text can only copy whole blocks; let long-press/accessibility open a real text-selection view. */
export function messageTextProps(onSelectText?: () => void): TextProps {
  if (!onSelectText) return { selectable: true };
  return { selectable: false, onLongPress: onSelectText,
    accessibilityHint: 'Hold to select part of this message.',
    accessibilityActions: [{ name: 'selectText', label: 'Select text' }],
    onAccessibilityAction: event => { if (event.nativeEvent.actionName === 'selectText') onSelectText(); },
  };
}

/** One read-only, scrollable UITextView on iOS; no keyboard, nested scroll view, or new native dependency. */
export function MessageTextSelection({ text, onClose }: { text: string; onClose: () => void }) {
  const { colors } = useApp();
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaProvider>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} accessibilityViewIsModal>
        <View style={styles.header}>
          <AppText weight="bold" style={styles.title}>Select text</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Close text selection" onPress={onClose} style={styles.close}>
            <X size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <AppText tone="secondary" style={styles.hint}>Touch and hold a word, then drag the handles to select what you want.</AppText>
        <TextInput accessibilityLabel="Message text" multiline editable={false} showSoftInputOnFocus={false}
          scrollEnabled contextMenuHidden={false} defaultValue={text} selectionColor={colors.tint}
          style={[styles.text, { color: colors.text }]} />
      </SafeAreaView>
    </SafeAreaProvider>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: 12 },
  title: { flex: 1, fontSize: 20, lineHeight: 26 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 16 },
  text: { flex: 1, fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, textAlignVertical: 'top', padding: 0, paddingBottom: 20 },
});
