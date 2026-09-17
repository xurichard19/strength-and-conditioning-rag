import { useFocusEffect } from 'expo-router';
import { BookOpen, Check, ChevronDown, X, Zap } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useApp } from '@/state/app-context';
import { AppText } from './ui';

const modes = [
  { value: 'quick', name: 'Quick chat', description: 'Fast answers with focused research.', Icon: Zap },
  { value: 'deep', name: 'Deep research', description: 'A deeper dive across more sources.', Icon: BookOpen },
] as const;

/** Choose the next turn's retrieval budget; an already running reply keeps its mode. */
export function ChatModeSelector() {
  const { colors, chatMode, setChatMode } = useApp();
  const [open, setOpen] = useState(false);
  useFocusEffect(useCallback(() => () => setOpen(false), []));
  const mode = modes.find(item => item.value === chatMode) ?? modes[0];
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Chat mode: ${mode.name}`} hitSlop={4}
      accessibilityHint="Choose Quick chat or Deep research for your next message."
      aria-expanded={open} onPress={() => { Keyboard.dismiss(); setOpen(true); }}
      style={[styles.toggle, { backgroundColor: colors.card, borderColor: colors.separator }]}>
      <mode.Icon color={colors.textSecondary} size={17} />
      <ChevronDown color={colors.textSecondary} size={11} />
    </Pressable>
    {open ? <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
      <SafeAreaProvider style={{ flex: 1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close chat mode selector"
          onPress={() => setOpen(false)} style={styles.backdrop} />
        <SafeAreaView pointerEvents="box-none" edges={['top', 'bottom']} style={styles.overlay}>
          <View accessibilityViewIsModal style={[styles.menu, { backgroundColor: colors.elevated, borderColor: colors.separator }]}>
            <View style={styles.header}>
              <AppText weight="bold" style={styles.heading}>Chat mode</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close chat mode selector"
                onPress={() => setOpen(false)} style={styles.close}><X color={colors.textSecondary} size={18} /></Pressable>
            </View>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              {modes.map(({ value, name, description, Icon }) => <Pressable key={name}
                accessibilityRole="radio" accessibilityLabel={`${name}. ${description}`}
                aria-checked={chatMode === value} onPress={() => { setChatMode(value); setOpen(false); }}
                style={[styles.option, chatMode === value && { backgroundColor: colors.tintSoft }]}>
                <Icon color={chatMode === value ? colors.tintText : colors.textSecondary} size={19} />
                <View style={styles.copy}>
                  <AppText weight="medium" style={styles.name}>{name}</AppText>
                  <AppText tone="secondary" style={styles.description}>{description}</AppText>
                </View>
                <View style={styles.check}>{chatMode === value ? <Check color={colors.tintText} size={18} /> : null}</View>
              </Pressable>)}
            </ScrollView>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal> : null}
  </>;
}

const styles = StyleSheet.create({
  toggle: { width: 52, height: 39, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,3,10,0.42)' },
  overlay: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
  menu: { marginBottom: 12, padding: 8, borderRadius: 20, borderWidth: 1, maxWidth: 440, maxHeight: '80%', width: '100%', alignSelf: 'center' },
  header: { paddingLeft: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 15, lineHeight: 21 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 15 },
  copy: { flex: 1, gap: 4 },
  name: { fontSize: 15, lineHeight: 20 },
  description: { fontSize: 12, lineHeight: 17 },
  check: { width: 18 },
});
