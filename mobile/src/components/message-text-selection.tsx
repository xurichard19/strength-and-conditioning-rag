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
        <View style={[styles.header, { borderBottomColor: colors.separator }]}>
          <AppText weight="medium" style={styles.title}>Select text</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Close text selection" onPress={onClose} style={[styles.close, { backgroundColor: colors.fill }]}>
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
  screen: { flex: 1, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 84, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 20 },
  title: { flex: 1, fontSize: 26, lineHeight: 32, letterSpacing: -0.8 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, lineHeight: 21, marginBottom: 24 },
  text: { flex: 1, fontFamily: fonts.regular, fontSize: 16, lineHeight: 27, textAlignVertical: 'top', padding: 0, paddingBottom: 24 },
});
