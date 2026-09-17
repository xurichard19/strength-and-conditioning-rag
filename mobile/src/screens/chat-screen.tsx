import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { ArrowLeft, ArrowUp, ArrowUpRight, BookOpen, ChevronRight, Globe2, Menu, MoreHorizontal, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { ChatModeSelector } from '@/components/chat-mode-selector';
import { ChatProgress } from '@/components/chat-progress';
import { ConversationActions, ConversationSidebar } from '@/components/conversation-menu';
import { MarkdownText, markdownPlainText } from '@/components/markdown-text';
import { MessageTextSelection, messageTextProps } from '@/components/message-text-selection';
import { quickQuestions } from '@/data/mock';
import { fonts, radius } from '@/design/tokens';
import type { ChatMessage, ChatSource } from '@/domain/types';
import { webUrl } from '@/lib/links';
import { useApp } from '@/state/app-context';

function sourceUrl(source: ChatSource) {
  return webUrl(source.url ?? (source.doi ? `https://doi.org/${encodeURI(source.doi).replace(/#/g, '%23').replace(/\?/g, '%3F')}` : null));
}

function sourceMeta(source: ChatSource) {
  if (source.source_type === 'research') return 'Research paper';
  if (!source.url) return 'Web';
  return source.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
}

function sourceTitle(source: ChatSource, index: number) {
  if (source.source_type === 'research') return source.doi || source.title?.trim() || `Research source ${index + 1}`;
  return source.title?.trim() || `Web source ${index + 1}`;
}

function SourceRow({ source, index, last, onExcerpt }: { source: ChatSource; index: number; last: boolean; onExcerpt: () => void }) {
  const { colors } = useApp();
  const url = sourceUrl(source);
  const research = source.source_type === 'research';
  const Icon = research ? BookOpen : Globe2;
  const title = sourceTitle(source, index);
  return (
    <View style={[styles.sourceRow, !last && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.sourceIcon, { backgroundColor: colors.tintSoft }]}><Icon color={colors.tintText} size={14} strokeWidth={1.9} /></View>
      <View style={styles.sourceCopy}>
        <AppText weight="medium" numberOfLines={2} style={styles.sourceTitle}>{title}</AppText>
        <AppText tone="secondary" numberOfLines={1} style={styles.sourceMeta}>{sourceMeta(source)}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={`Read excerpt from ${title}`} onPress={onExcerpt} style={styles.sourceExcerptButton}>
          <AppText tone="tint" weight="medium" style={styles.sourceTitle}>Read excerpt</AppText>
        </Pressable>
      </View>
      {url ? <Pressable accessibilityRole="link" accessibilityLabel={`Open source: ${title}`} onPress={() => void Linking.openURL(url).catch(() => undefined)} style={[styles.sourceLink, styles.sourceOpenButton, { borderColor: colors.tintText }]}>
        <ArrowUpRight color={colors.tintText} size={22} strokeWidth={2} />
      </Pressable> : null}
    </View>
  );
}

function MessageSources({ sources }: { sources: ChatSource[] }) {
  const { colors } = useApp();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const close = () => { setOpen(false); setSelected(null); };
  const source = selected === null ? undefined : sources[selected];
  const url = source ? sourceUrl(source) : null;
  useFocusEffect(useCallback(() => () => { setOpen(false); setSelected(null); }, []));
  const label = `${sources.length} source${sources.length === 1 ? '' : 's'}`;
  return (
    <View style={styles.sources}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${label}`}
        onPress={() => setOpen(true)}
        style={[styles.sourceToggle, { backgroundColor: colors.fill }]}>
        <BookOpen color={colors.tintText} size={14} strokeWidth={1.9} />
        <AppText tone="tint" weight="medium" style={styles.sourceToggleText}>Sources · {sources.length}</AppText>
        <ChevronRight color={colors.textTertiary} size={14} />
      </Pressable>
      {open ? (
        <Modal animationType="fade" onRequestClose={() => selected === null ? close() : setSelected(null)} statusBarTranslucent transparent visible>
          <View accessibilityViewIsModal style={styles.sourceModal}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close sources" onPress={close} style={styles.sourceBackdrop} />
            <SafeAreaView edges={['bottom']} style={[styles.sourceSheet, { backgroundColor: colors.elevated }]}>
              <View style={[styles.sourceSheetHeader, { borderBottomColor: colors.separator }]}>
                {source ? <Pressable accessibilityRole="button" accessibilityLabel="Back to sources" onPress={() => setSelected(null)} style={styles.sourceLink}><ArrowLeft color={colors.tintText} size={20} /></Pressable>
                  : <View style={[styles.sourceSheetIcon, { backgroundColor: colors.tintSoft }]}><BookOpen color={colors.tintText} size={18} strokeWidth={1.9} /></View>}
                <View style={styles.sourceSheetCopy}>
                  <AppText weight="bold" style={styles.sourceSheetTitle}>{source ? 'Source excerpt' : 'Sources'}</AppText>
                  <AppText tone="secondary" style={styles.sourceSheetSubtitle}>{source ? sourceMeta(source) : `${label} retrieved for this answer`}</AppText>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close sources" onPress={close} style={[styles.sourceClose, { backgroundColor: colors.fill }]}><X color={colors.textSecondary} size={18} /></Pressable>
              </View>
              <ScrollView key={selected ?? 'list'} contentContainerStyle={styles.sourceList}>
                {source ? <View style={styles.sourceExcerpt}>
                  <AppText selectable weight="bold">{sourceTitle(source, selected ?? 0)}</AppText>
                  {url ? <Pressable accessibilityRole="link" accessibilityLabel="Open original source" onPress={() => void Linking.openURL(url).catch(() => undefined)} style={styles.sourceExcerptButton}>
                    <AppText tone="tint">{source.doi ? `DOI ${source.doi}` : url} ↗</AppText>
                  </Pressable> : null}
                  <AppText selectable style={styles.sourceExcerptText}>{source.content?.trim() || 'No excerpt is available for this source.'}</AppText>
                </View> : sources.map((source, index) => <SourceRow key={`${source.document_id ?? source.doi ?? source.url ?? 'source'}-${index}`} source={source} index={index} last={index === sources.length - 1} onExcerpt={() => setSelected(index)} />)}
              </ScrollView>
            </SafeAreaView>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function MessageContent({ message, onSelectText }: { message: ChatMessage; onSelectText?: () => void }) {
  if (message.pending && !message.text) return null;
  if (message.role === 'assistant') return <MarkdownText onSelectText={onSelectText}>{message.text}</MarkdownText>;
  return <AppText {...messageTextProps(onSelectText)} tone="inverse" style={styles.messageText}>{message.text}</AppText>;
}

function ChatBubble({ message, onSelectText }: { message: ChatMessage; onSelectText?: () => void }) {
  const { colors } = useApp();
  const fromUser = message.role === 'user';
  return (
    <View style={[styles.message, fromUser ? styles.userWrap : styles.assistantWrap]}>
      <View style={[styles.bubble, { backgroundColor: fromUser ? colors.strong : colors.card }]}>
        <MessageContent message={message} onSelectText={onSelectText} />
        {!fromUser && message.pending && !message.text ? <ChatProgress stage={message.progress} /> : null}
      </View>
      {message.basis ? <AppText selectable tone="secondary" style={styles.basis}>Based on: {message.basis}</AppText> : null}
      {!fromUser && message.sources?.length ? <MessageSources sources={message.sources} /> : null}
    </View>
  );
}

function QuickQuestions({ context }: { context?: string }) {
  const { colors, sendChat } = useApp();
  return (
    <View style={styles.quickArea}>
      <AppText tone="secondary" style={styles.quickTitle}>Try asking</AppText>
      <View style={styles.quickList}>{quickQuestions.map((question) => <Pressable accessibilityRole="button" accessibilityLabel={question} key={question} onPress={() => void sendChat(question, context)} style={[styles.quick, { backgroundColor: colors.fill }]}><AppText weight="medium" style={styles.quickText}>{question}</AppText></Pressable>)}</View>
    </View>
  );
}

function Composer({ draft, busy, onChange, onSubmit }: { draft: string; busy: boolean; onChange: (value: string) => void; onSubmit: () => void }) {
  const { colors } = useApp();
  const canSend = Boolean(draft.trim()) && !busy;
  return (
    <View style={[styles.composerWrap, { backgroundColor: colors.background, borderTopColor: colors.separator }]}>
      <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        <TextInput value={draft} onChangeText={onChange} onSubmitEditing={onSubmit} placeholder="Ask a training question…" placeholderTextColor={colors.textTertiary} style={[styles.input, { color: colors.text }]} multiline maxLength={800} accessibilityLabel="Message Arcel" />
        <ChatModeSelector />
        <Pressable accessibilityRole="button" accessibilityLabel="Send message" onPress={onSubmit} disabled={!canSend} style={[styles.send, { backgroundColor: canSend ? colors.strong : colors.fillStrong }]}><ArrowUp color={canSend ? colors.strongText : colors.textTertiary} size={20} strokeWidth={2.3} /></Pressable>
      </View>
      <AppText tone="secondary" style={styles.disclaimer}>Training guidance, not medical care.</AppText>
    </View>
  );
}

function ChatHeader({ onMenu, onOptions }: { onMenu: () => void; onOptions: () => void }) {
  const { colors, chatTitle, activeConversationId } = useApp();
  return <View style={[styles.header, { borderBottomColor: colors.separator }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open conversations" onPress={onMenu} style={styles.spark}><Menu color={colors.text} size={24} /></Pressable>
    <View style={styles.headerCopy}><AppText weight="bold" style={styles.title} numberOfLines={2}>{chatTitle}</AppText><AppText tone="secondary" style={styles.subtitle}>Training questions · live</AppText></View>
    {activeConversationId ? <Pressable accessibilityRole="button" accessibilityLabel="Conversation options" onPress={onOptions} style={styles.spark}><MoreHorizontal color={colors.text} size={24} /></Pressable> : null}
  </View>;
}

function ChatHistory({ context, onSelectText }: { context?: string; onSelectText: (message: ChatMessage) => void }) {
  const { colors, chatMessages, chatBusy, chatLoading, chatError, hasOlderMessages, refreshChat } = useApp();
  const busy = chatBusy || chatLoading;
  return <>
    {chatError ? <Pressable disabled={busy} onPress={() => void refreshChat()}><AppText>{chatError} Tap to reload.</AppText></Pressable> : null}
    {hasOlderMessages ? <Pressable disabled={busy} onPress={() => void refreshChat(true)}><AppText tone="tint">Load older messages</AppText></Pressable> : null}
    {chatLoading ? <ActivityIndicator color={colors.tint} /> : null}
    {chatMessages.map((message) => <ChatBubble key={message.id} message={message}
      onSelectText={Platform.OS === 'ios' ? () => onSelectText(message) : undefined} />)}
    {!chatLoading && !chatError && chatMessages.length === 0 ? <QuickQuestions context={context} /> : null}
  </>;
}

export default function ChatScreen() {
  const params = useLocalSearchParams<{ context?: string }>();
  const context = Array.isArray(params.context) ? params.context[0] : params.context;
  const { colors, authSession, chatMessages, chatBusy, chatLoading, sendChat, refreshConversations, openConversation, activeConversationId } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [selection, setSelection] = useState<{ text: string; userId?: string; conversationId: string | null } | null>(null);
  const userId = authSession?.user.id;
  const busy = chatBusy || chatLoading;
  // Keep the selected conversation and draft across tab visits; only dismiss menus.
  useFocusEffect(useCallback(() => {
    setMenuOpen(false); setOptionsOpen(false); setSelection(null);
    return () => setSelection(null);
  }, []));
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [chatMessages]);
  const selectConversation = (id?: string, title?: string) => {
    openConversation(id, title); setDraft(''); setMenuOpen(false); setSelection(null);
  };
  const selectText = (message: ChatMessage) => {
    Keyboard.dismiss();
    // Snapshot once so incoming tokens cannot move the user's selection handles.
    setSelection({ text: message.role === 'assistant' ? markdownPlainText(message.text) : message.text,
      userId, conversationId: activeConversationId });
  };
  const submit = () => { if (!draft.trim() || busy) return; const message = draft; setDraft(''); void sendChat(message, context); };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      {selection && selection.userId === userId && selection.conversationId === activeConversationId
        ? <MessageTextSelection text={selection.text} onClose={() => setSelection(null)} /> : null}
      {optionsOpen ? <ConversationActions onClose={() => setOptionsOpen(false)} /> : null}
      {menuOpen ? <ConversationSidebar onClose={() => setMenuOpen(false)} onSelect={selectConversation} /> : null}
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ChatHeader onMenu={() => { setMenuOpen(true); void refreshConversations(); }} onOptions={() => setOptionsOpen(true)} />
        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}>
          <ChatHistory context={context} onSelectText={selectText} />
        </ScrollView>
        <Composer draft={draft} busy={busy} onChange={setDraft} onSubmit={submit} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 82, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  spark: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { fontSize: 22, lineHeight: 27 },
  subtitle: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  messages: { padding: 16, paddingBottom: 24, gap: 16 },
  message: { maxWidth: '91%' },
  userWrap: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  assistantWrap: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: radius.panel, paddingHorizontal: 14, paddingVertical: 11, minHeight: 40 },
  messageText: { fontSize: 15, lineHeight: 21 },
  basis: { fontSize: 10, lineHeight: 14, marginTop: 5, paddingHorizontal: 4 },
  sources: { alignSelf: 'stretch', marginTop: 7 },
  sourceToggle: { alignSelf: 'flex-start', minHeight: 32, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  sourceToggleText: { fontSize: 11, lineHeight: 15 },
  sourceModal: { flex: 1, justifyContent: 'flex-end' },
  sourceBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,3,10,0.62)' },
  sourceSheet: { maxHeight: '72%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 18 },
  sourceSheetHeader: { minHeight: 78, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16 },
  sourceSheetIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sourceSheetCopy: { flex: 1 },
  sourceSheetTitle: { fontSize: 19, lineHeight: 23 },
  sourceSheetSubtitle: { marginTop: 2, fontSize: 11, lineHeight: 15 },
  sourceClose: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sourceList: { paddingHorizontal: 16, paddingBottom: 4 },
  sourceRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  sourceIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sourceCopy: { flex: 1 },
  sourceTitle: { fontSize: 12, lineHeight: 16 },
  sourceMeta: { marginTop: 2, fontSize: 10, lineHeight: 14 },
  sourceLink: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sourceOpenButton: { borderWidth: 1.5, borderRadius: 13, flexShrink: 0 },
  sourceExcerptButton: { minHeight: 44, justifyContent: 'center' },
  sourceExcerpt: { paddingVertical: 18, gap: 8 },
  sourceExcerptText: { fontSize: 15, lineHeight: 23 },
  quickArea: { marginTop: 8, gap: 9 },
  quickTitle: { fontSize: 12, marginLeft: 3 },
  quickList: { gap: 8 },
  quick: { minHeight: 46, borderRadius: 15, paddingHorizontal: 14, justifyContent: 'center' },
  quickText: { fontSize: 14 },
  composerWrap: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10, paddingBottom: Platform.OS === 'ios' ? 4 : 10 },
  composer: { minHeight: 50, maxHeight: 120, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingLeft: 13, paddingRight: 5, paddingVertical: 5 },
  input: { flex: 1, minWidth: 0, minHeight: 39, maxHeight: 106, fontFamily: fonts.regular, fontSize: 15, paddingTop: 9, paddingBottom: 8 },
  send: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  disclaimer: { fontSize: 9, lineHeight: 12, textAlign: 'center', marginTop: 4 },
});
