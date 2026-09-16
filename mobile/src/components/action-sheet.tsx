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
    <SafeAreaProvider style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={['bottom']} style={[styles.panel, { backgroundColor: colors.elevated }]} accessibilityViewIsModal>
        <View style={styles.header}>
          <AppText weight="semibold" style={styles.title}>{title}</AppText>
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
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, maxHeight: '85%' },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 8 },
  title: { flex: 1, fontSize: 18, lineHeight: 24 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
