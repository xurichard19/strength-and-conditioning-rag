import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useApp } from '@/state/app-context';
import { AppText } from './ui';

/** A dismissible bottom menu; its own safe area keeps controls above the home indicator. */
export function ActionSheet({ title, onClose, children, headerAction }: {
  title: string; onClose: () => void; children: ReactNode; headerAction?: ReactNode;
}) {
  const { colors } = useApp();
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <SafeAreaProvider style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={['bottom']} style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.separator }]} accessibilityViewIsModal>
        <View style={[styles.handle, { backgroundColor: colors.fillStrong }]} />
        <View style={[styles.header, { borderBottomColor: colors.separator }]}>
          <AppText weight="medium" style={styles.title}>{title}</AppText>
          {headerAction}
          <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} style={styles.close}>
            <X color={colors.textSecondary} size={22} />
          </Pressable>
        </View>
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 20, maxHeight: '85%' },
  handle: { width: 32, height: 3, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  title: { flex: 1, fontSize: 20, lineHeight: 27, letterSpacing: -0.6 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
