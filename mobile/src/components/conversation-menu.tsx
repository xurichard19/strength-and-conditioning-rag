import { SquarePen, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { fonts } from '@/design/tokens';
import { errorMessage } from '@/lib/errors';
import { useApp } from '@/state/app-context';
import { AppText, OutlineButton } from './ui';

type Action = 'menu' | 'rename' | 'delete';
const headings: Record<Action, string> = {
  menu: 'Conversation options', rename: 'Rename conversation', delete: 'Delete conversation?',
};

function ActionFields({ action, busy, name, setName, setAction }: {
  action: Action; busy: boolean; name: string; setName: (name: string) => void; setAction: (action: Action) => void;
}) {
  const { colors, chatBusy, chatTitle } = useApp();
  const buttonStyle = [styles.actionButton, { borderColor: colors.separator }];
  if (action === 'menu') return <>
    <OutlineButton style={buttonStyle} disabled={chatBusy} onPress={() => { setName(chatTitle); setAction('rename'); }}>Rename conversation</OutlineButton>
    <OutlineButton style={[buttonStyle, { borderColor: colors.danger }]} disabled={chatBusy} onPress={() => setAction('delete')}>Delete conversation</OutlineButton>
    {chatBusy ? <AppText tone="secondary">Available after the reply finishes.</AppText> : null}
  </>;
  if (action === 'delete') return <AppText>This permanently deletes this conversation and all its messages. This cannot be undone.</AppText>;
  return <TextInput accessibilityLabel="Conversation name" autoFocus value={name} onChangeText={setName} maxLength={120} editable={!busy}
    selectionColor={colors.tint} style={[styles.nameInput, { color: colors.text, backgroundColor: colors.fill, borderColor: colors.separator }]} />;
}

/** Keep transient rename/delete form state separate from the streaming conversation view. */
export function ConversationActions({ onClose }: { onClose: () => void }) {
  const { colors, renameConversation, deleteConversation } = useApp();
  const buttonStyle = [styles.actionButton, { borderColor: colors.separator }];
  const [action, setAction] = useState<Action>('menu');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const perform = async () => {
    if (busy || action === 'menu') return;
    setBusy(true); setError(null);
    try {
      if (action === 'rename') await renameConversation(name);
      else await deleteConversation();
      onClose();
    } catch (failure) { setError(errorMessage(failure, 'Could not update conversation.')); }
    finally { setBusy(false); }
  };
  return <Modal transparent visible animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.actionOverlay, { backgroundColor: colors.overlay }]} accessibilityViewIsModal>
      <Pressable accessibilityRole="button" accessibilityLabel="Close conversation options" disabled={busy}
        onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={[styles.actionSheet, { backgroundColor: colors.elevated, borderColor: colors.separator }]}>
        <AppText weight="medium" style={styles.actionHeading}>{headings[action]}</AppText>
        {error ? <AppText>{error}</AppText> : null}
        <ActionFields action={action} busy={busy} name={name} setName={setName} setAction={setAction} />
        {action !== 'menu' ? <OutlineButton disabled={busy || (action === 'rename' && !name.trim())}
          onPress={() => void perform()} style={[buttonStyle, action === 'delete' && { borderColor: colors.danger }]}>
          {busy ? 'Saving…' : action === 'rename' ? 'Save name' : 'Delete conversation'}
        </OutlineButton> : null}
        <OutlineButton disabled={busy} onPress={onClose} style={buttonStyle}>Cancel</OutlineButton>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

/** Render only nearby sidebar rows; opening/closing leaves the account's bounded cache intact. */
export function ConversationSidebar({ onClose, onSelect }: { onClose: () => void; onSelect: (id?: string, title?: string) => void }) {
  const { colors, conversations, conversationsLoading, conversationsError, hasOlderConversations, refreshConversations, activeConversationId } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const refreshPending = useRef(false);
  const refresh = async () => {
    if (refreshPending.current) return;
    refreshPending.current = true;
    setRefreshing(true);
    try { await refreshConversations(false, true); }
    finally { refreshPending.current = false; setRefreshing(false); }
  };
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    {/* Measure this modal's safe area independently; keep visual spacing outside inset padding. */}
    <SafeAreaProvider style={[styles.sidebarOverlay, { backgroundColor: colors.overlay }]} accessibilityViewIsModal>
      <SafeAreaView style={[styles.sidebar, { backgroundColor: colors.background, borderColor: colors.separator }]}>
        <View style={[styles.flex, refreshing && styles.refreshing]}>
        <View style={styles.sidebarHeader}>
          <View style={styles.sidebarHeaderCopy}><AppText tone="tint" weight="medium" style={styles.eyebrow}>ARCEL / CHAT</AppText><AppText style={styles.sidebarTitle}>Conversations</AppText></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close conversations" onPress={onClose} style={[styles.close, { backgroundColor: colors.fill }]}><X color={colors.text} size={19} /></Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={() => onSelect()} style={({ pressed }) => [styles.newChat, { backgroundColor: colors.tintSoft }, pressed && styles.pressed]}>
          <SquarePen color={colors.tintText} size={18} strokeWidth={1.7} /><AppText tone="tint" weight="medium" style={styles.newChatLabel}>New chat</AppText>
        </Pressable>
        <AppText tone="secondary" weight="medium" style={[styles.eyebrow, styles.historyLabel]}>HISTORY</AppText>
        <FlatList data={conversations} keyExtractor={item => item.id}
          style={styles.flex}
          contentContainerStyle={{ flexGrow: 1 }} alwaysBounceVertical
          accessibilityState={{ busy: conversationsLoading || refreshing }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}
            tintColor={colors.tint} colors={[colors.tint]} progressBackgroundColor={colors.card} />}
          renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: item.id === activeConversationId }} onPress={() => onSelect(item.id, item.title)} style={({ pressed }) => [styles.conversation, { borderColor: colors.separator }, (pressed || item.id === activeConversationId) && { backgroundColor: colors.fill }]}>
            <AppText weight={item.id === activeConversationId ? 'medium' : 'regular'} style={styles.conversationTitle}>{item.title}</AppText>
            {item.id === activeConversationId ? <View style={[styles.activeDot, { backgroundColor: colors.tint }]} /> : null}
          </Pressable>}
          ListHeaderComponent={conversationsError ? <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.notice}><AppText style={styles.noticeText}>{conversationsError} Tap to retry.</AppText></Pressable> : null}
          ListEmptyComponent={!conversationsLoading && !conversationsError ? <AppText tone="secondary" style={[styles.notice, styles.noticeText]}>Your conversations appear here after your first message.</AppText> : null}
          ListFooterComponent={<>
            {conversationsLoading && !refreshing ? <ActivityIndicator color={colors.tint} /> : null}
            {hasOlderConversations ? <Pressable accessibilityRole="button" disabled={conversationsLoading} onPress={() => void refreshConversations(true)} style={styles.notice}><AppText tone="tint" style={styles.noticeText}>Load older conversations</AppText></Pressable> : null}
          </>} />
        </View>
      </SafeAreaView>
      <Pressable accessibilityRole="button" accessibilityLabel="Close conversations" style={styles.flex} onPress={onClose} />
    </SafeAreaProvider>
  </Modal>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  refreshing: { opacity: 0.55 },
  pressed: { opacity: 0.72 },
  actionOverlay: { flex: 1, justifyContent: 'center', padding: 24 },
  actionSheet: { borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, padding: 24, gap: 14, width: '100%', maxWidth: 440, alignSelf: 'center' },
  actionHeading: { fontSize: 24, lineHeight: 31, letterSpacing: -0.8, marginBottom: 8 },
  actionButton: { minHeight: 50, borderRadius: 16, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, backgroundColor: 'transparent' },
  nameInput: { fontFamily: fonts.regular, fontSize: 15, padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  sidebarOverlay: { flex: 1, flexDirection: 'row' },
  sidebar: { width: '88%', maxWidth: 380, paddingHorizontal: 24, paddingBottom: 20, borderRightWidth: StyleSheet.hairlineWidth },
  sidebarHeader: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 28 },
  sidebarHeaderCopy: { flex: 1, gap: 9 },
  eyebrow: { fontSize: 10, lineHeight: 14, letterSpacing: 1.5 },
  sidebarTitle: { fontSize: 26, lineHeight: 33, letterSpacing: -0.9 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  newChat: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 52, borderRadius: 26 },
  newChatLabel: { fontSize: 14, lineHeight: 20 },
  historyLabel: { marginTop: 36, marginBottom: 16 },
  conversation: { minHeight: 60, paddingVertical: 18, paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, alignItems: 'center' },
  conversationTitle: { flex: 1, fontSize: 14, lineHeight: 22 },
  activeDot: { width: 5, height: 5, borderRadius: 3 },
  notice: { paddingVertical: 18 },
  noticeText: { fontSize: 13, lineHeight: 21 },
});
