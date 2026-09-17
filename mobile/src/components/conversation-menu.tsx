import { SquarePen, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

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
  const buttonStyle = { minHeight: 44, borderRadius: 10, paddingHorizontal: 12, borderWidth: 2, borderColor: colors.textTertiary, backgroundColor: 'transparent' };
  if (action === 'menu') return <>
    <OutlineButton style={buttonStyle} disabled={chatBusy} onPress={() => { setName(chatTitle); setAction('rename'); }}>Rename conversation</OutlineButton>
    <OutlineButton style={[buttonStyle, { borderColor: colors.danger }]} disabled={chatBusy} onPress={() => setAction('delete')}>Delete conversation</OutlineButton>
    {chatBusy ? <AppText tone="secondary">Available after the reply finishes.</AppText> : null}
  </>;
  if (action === 'delete') return <AppText>This permanently deletes this conversation and all its messages. This cannot be undone.</AppText>;
  return <TextInput accessibilityLabel="Conversation name" autoFocus value={name} onChangeText={setName} maxLength={120} editable={!busy}
    style={{ color: colors.text, backgroundColor: colors.fill, padding: 14, borderRadius: 12 }} />;
}

/** Keep transient rename/delete form state separate from the streaming conversation view. */
export function ConversationActions({ onClose }: { onClose: () => void }) {
  const { colors, renameConversation, deleteConversation } = useApp();
  const buttonStyle = { minHeight: 44, borderRadius: 10, paddingHorizontal: 12, borderWidth: 2, borderColor: colors.textTertiary, backgroundColor: 'transparent' };
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
      style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0008' }} accessibilityViewIsModal>
      <Pressable accessibilityRole="button" accessibilityLabel="Close conversation options" disabled={busy}
        onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={{ backgroundColor: colors.elevated, borderRadius: 20, padding: 20, gap: 12 }}>
        <AppText weight="bold">{headings[action]}</AppText>
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
  const { colors, conversations, conversationsLoading, conversationsError, hasOlderConversations, refreshConversations } = useApp();
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
    <SafeAreaProvider style={{ flex: 1, flexDirection: 'row', backgroundColor: '#0008' }} accessibilityViewIsModal>
      <SafeAreaView style={{ width: '85%', maxWidth: 340, backgroundColor: colors.background, paddingHorizontal: 20, paddingBottom: 20 }}>
        <View style={{ flex: 1, opacity: refreshing ? 0.55 : 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <AppText weight="bold">Conversations</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Close conversations" onPress={onClose} style={{ padding: 12 }}><X color={colors.text} size={22} /></Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={() => onSelect()} style={{ flexDirection: 'row', gap: 12, paddingVertical: 20 }}>
          <SquarePen color={colors.text} size={20} /><AppText weight="medium">New chat</AppText>
        </Pressable>
        <FlatList data={conversations} keyExtractor={item => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }} alwaysBounceVertical
          accessibilityState={{ busy: conversationsLoading || refreshing }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}
            tintColor={colors.tint} colors={[colors.tint]} progressBackgroundColor={colors.card} />}
          renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => onSelect(item.id, item.title)} style={{ paddingVertical: 16 }}>
            <AppText weight="medium">{item.title}</AppText>
          </Pressable>}
          ListHeaderComponent={conversationsError ? <Pressable onPress={() => void refresh()}><AppText>{conversationsError} Tap to retry.</AppText></Pressable> : null}
          ListEmptyComponent={!conversationsLoading && !conversationsError ? <AppText tone="secondary">Your conversations appear here after your first message.</AppText> : null}
          ListFooterComponent={<>
            {conversationsLoading && !refreshing ? <ActivityIndicator color={colors.tint} /> : null}
            {hasOlderConversations ? <Pressable disabled={conversationsLoading} onPress={() => void refreshConversations(true)} style={{ paddingVertical: 16 }}><AppText tone="tint">Load older conversations</AppText></Pressable> : null}
          </>} />
        </View>
      </SafeAreaView>
      <Pressable accessibilityRole="button" accessibilityLabel="Close conversations" style={{ flex: 1 }} onPress={onClose} />
    </SafeAreaProvider>
  </Modal>;
}
