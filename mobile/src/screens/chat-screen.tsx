import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { ArrowLeft, ArrowUp, ArrowUpRight, BookOpen, ChevronRight, Globe2, Menu, MoreHorizontal, Quote, X } from 'lucide-react-native';
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
import { fonts } from '@/design/tokens';
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
  if (source.source_type === 'research') return source.title?.trim() || source.doi || `Research source ${index + 1}`;
  return source.title?.trim() || `Web source ${index + 1}`;
}

function SourceRow({ source, index, onExcerpt }: { source: ChatSource; index: number; onExcerpt: () => void }) {
  const { colors } = useApp();
  const url = sourceUrl(source);
  const research = source.source_type === 'research';
  const Icon = research ? BookOpen : Globe2;
  const title = sourceTitle(source, index);
  const preview = source.content?.trim().slice(0, 180).replace(/\s+/g, ' ');
  return (
    <View style={[styles.sourceRow, { backgroundColor: colors.card, borderColor: colors.separator }]}>
      <View style={[styles.sourceRowHeading, { backgroundColor: colors.tintSoft }]}>
        <View style={styles.sourceKind}><Icon color={colors.tintText} size={16} strokeWidth={1.7} />
          <AppText tone="tint" numberOfLines={1} style={styles.sourceMeta}>{sourceMeta(source)}</AppText></View>
        <AppText tone="tint" style={styles.sourceNumber}>{String(index + 1).padStart(2, '0')}</AppText>
      </View>
      <View style={styles.sourceRowBody}>
        <AppText numberOfLines={3} style={styles.sourceTitle}>{title}</AppText>
        {preview ? <View style={[styles.sourcePreviewWrap, { borderLeftColor: colors.tint }]}>
          <AppText tone="secondary" numberOfLines={2} style={styles.sourcePreview}>{preview}</AppText>
        </View> : null}
        <View style={styles.sourceRowActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Read excerpt from ${title}`} onPress={onExcerpt} style={({ pressed }) => [styles.sourceExcerptButton, styles.sourceReadButton, { backgroundColor: colors.tintSoft }, pressed && { opacity: 0.65 }]}>
            <AppText tone="tint" weight="medium" style={styles.sourceActionText}>Read excerpt</AppText>
            <ChevronRight color={colors.tintText} size={15} />
          </Pressable>
          {url ? <Pressable accessibilityRole="link" accessibilityLabel={`Open source: ${title}`} hitSlop={4} onPress={() => void Linking.openURL(url).catch(() => undefined)} style={[styles.sourceLink, styles.sourceOpenButton, { borderColor: colors.separator, backgroundColor: colors.fill }]}>
            <ArrowUpRight color={colors.tintText} size={18} strokeWidth={1.8} />
          </Pressable> : null}
        </View>
      </View>
    </View>
  );
}

function SourceExcerpt({ source, index }: { source: ChatSource; index: number }) {
  const { colors } = useApp();
  const url = sourceUrl(source);
  const Icon = source.source_type === 'research' ? BookOpen : Globe2;
  return <View style={styles.sourceExcerpt}>
    <View style={[styles.sourceDocument, { backgroundColor: colors.card, borderColor: colors.separator }]}>
      <View style={styles.sourceDocumentHeading}>
        <View style={[styles.sourceDocumentIcon, { backgroundColor: colors.tintSoft }]}><Icon color={colors.tintText} size={24} strokeWidth={1.5} /></View>
        <AppText tone="secondary" numberOfLines={2} style={styles.sourceDocumentMeta}>{sourceMeta(source)}</AppText>
      </View>
      <AppText selectable style={styles.sourceExcerptTitle}>{sourceTitle(source, index)}</AppText>
      {url ? <>
        <AppText selectable tone="secondary" style={styles.sourceOriginalLink}>{source.doi ? `DOI ${source.doi}` : url}</AppText>
        <Pressable accessibilityRole="link" accessibilityLabel="Open original source" onPress={() => void Linking.openURL(url).catch(() => undefined)} style={[styles.sourceOriginalButton, { borderTopColor: colors.separator }]}>
          <AppText tone="tint" weight="medium" style={styles.sourceActionText}>Open original source</AppText><ArrowUpRight color={colors.tintText} size={18} />
        </Pressable>
      </> : null}
    </View>
    <View style={[styles.sourcePassage, { backgroundColor: colors.tintSoft }]}>
      <View style={styles.sourcePassageHeading}><Quote color={colors.tintText} size={24} strokeWidth={1.4} /><AppText tone="tint" style={styles.sourceEyebrow}>RETRIEVED PASSAGE</AppText></View>
      <AppText selectable style={styles.sourceExcerptText}>{source.content?.trim() || 'No excerpt is available for this source.'}</AppText>
    </View>
  </View>;
}

function MessageSources({ sources }: { sources: ChatSource[] }) {
  const { colors } = useApp();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const close = () => { setOpen(false); setSelected(null); };
  const source = selected === null ? undefined : sources[selected];
  useFocusEffect(useCallback(() => () => { setOpen(false); setSelected(null); }, []));
  const label = `${sources.length} source${sources.length === 1 ? '' : 's'}`;
  return (
    <View style={styles.sources}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${label}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.sourceToggle, { borderColor: colors.separator, backgroundColor: colors.card }, pressed && { opacity: 0.7 }]}>
        <View style={[styles.sourceToggleIcon, { backgroundColor: colors.tintSoft }]}><BookOpen color={colors.tintText} size={20} strokeWidth={1.6} /></View>
        <View style={styles.sourceToggleCopy}><AppText weight="medium" style={styles.sourceToggleText}>Sources</AppText>
          <AppText tone="secondary" style={styles.sourceToggleHint}>{label} · View excerpts</AppText></View>
        <ChevronRight color={colors.tintText} size={18} />
      </Pressable>
      {open ? (
        <Modal animationType="fade" onRequestClose={() => selected === null ? close() : setSelected(null)} statusBarTranslucent transparent visible>
          <View accessibilityViewIsModal style={styles.sourceModal}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close sources" onPress={close} style={[styles.sourceBackdrop, { backgroundColor: colors.overlay }]} />
            <SafeAreaView edges={['bottom']} style={[styles.sourceSheet, { backgroundColor: colors.background, borderColor: colors.separator }]}>
              <View style={[styles.sourceHandle, { backgroundColor: colors.fillStrong }]} />
              <View style={[styles.sourceSheetHeader, { borderBottomColor: colors.separator }]}>
                {source ? <Pressable accessibilityRole="button" accessibilityLabel="Back to sources" onPress={() => setSelected(null)} style={styles.sourceLink}><ArrowLeft color={colors.tintText} size={20} /></Pressable>
                  : null}
                <View style={styles.sourceSheetCopy}>
                  <AppText tone="tint" style={styles.sourceEyebrow}>{source ? `REFERENCE ${String((selected ?? 0) + 1).padStart(2, '0')}` : 'ANSWER REFERENCES'}</AppText>
                  <AppText style={styles.sourceSheetTitle}>{source ? 'Source excerpt' : 'Sources'}</AppText>
                  <AppText tone="secondary" style={styles.sourceSheetSubtitle}>{source ? sourceMeta(source) : `${label} retrieved for this answer`}</AppText>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close sources" onPress={close} style={[styles.sourceClose, { backgroundColor: colors.fill }]}><X color={colors.textSecondary} size={18} /></Pressable>
              </View>
              <ScrollView key={selected ?? 'list'} contentContainerStyle={styles.sourceList}>
                {source ? <SourceExcerpt source={source} index={selected ?? 0} /> : sources.map((source, index) => <SourceRow key={`${source.document_id ?? source.doi ?? source.url ?? 'source'}-${index}`} source={source} index={index} onExcerpt={() => setSelected(index)} />)}
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
  return <AppText {...messageTextProps(onSelectText)} style={styles.messageText}>{message.text}</AppText>;
}

function ChatBubble({ message, onSelectText }: { message: ChatMessage; onSelectText?: () => void }) {
  const { colors } = useApp();
  const fromUser = message.role === 'user';
  return (
    <View style={[styles.message, fromUser ? styles.userWrap : styles.assistantWrap]}>
      {!fromUser ? <View style={styles.responseLabel}><View style={[styles.responseDot, { backgroundColor: colors.tint }]} /><AppText tone="secondary" weight="medium" style={styles.responseName}>ARCEL</AppText></View> : null}
      <View style={[styles.bubble, fromUser ? [styles.userBubble, { backgroundColor: colors.tintSoft }] : styles.assistantBubble]}>
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
      <View style={styles.welcome}>
        <AppText tone="tint" weight="medium" style={styles.eyebrow}>RESEARCH MEETS YOUR ROUTINE</AppText>
        <AppText style={styles.welcomeTitle}>A clearer view of your training.</AppText>
        <AppText tone="secondary" style={styles.welcomeCopy}>Ask about your week, explore the research, or work through a training decision.</AppText>
      </View>
      <AppText tone="secondary" weight="medium" style={styles.quickTitle}>START WITH A QUESTION</AppText>
      <View style={styles.quickList}>{quickQuestions.map((question) => <Pressable accessibilityRole="button" accessibilityLabel={question} key={question} onPress={() => void sendChat(question, context)} style={({ pressed }) => [styles.quick, { borderColor: colors.separator }, pressed && { backgroundColor: colors.fill }]}><AppText style={styles.quickText}>{question}</AppText><ArrowUpRight color={colors.tintText} size={18} strokeWidth={1.7} /></Pressable>)}</View>
    </View>
  );
}

function Composer({ draft, busy, onChange, onSubmit }: { draft: string; busy: boolean; onChange: (value: string) => void; onSubmit: () => void }) {
  const { colors } = useApp();
  const canSend = Boolean(draft.trim()) && !busy;
  return (
    <View style={[styles.composerWrap, { backgroundColor: colors.background }]}>
      <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        <TextInput value={draft} onChangeText={onChange} onSubmitEditing={onSubmit} placeholder="Ask a training question…" placeholderTextColor={colors.textTertiary} style={[styles.input, { color: colors.text }]} multiline maxLength={800} accessibilityLabel="Message Arcel" />
        <ChatModeSelector />
        <Pressable accessibilityRole="button" accessibilityLabel="Send message" onPress={onSubmit} disabled={!canSend} style={({ pressed }) => [styles.send, { backgroundColor: canSend ? colors.strong : colors.fillStrong }, pressed && { opacity: 0.75 }]}><ArrowUp color={canSend ? colors.strongText : colors.textTertiary} size={20} strokeWidth={2} /></Pressable>
      </View>
      <AppText tone="secondary" style={styles.disclaimer}>Training guidance, not medical care.</AppText>
    </View>
  );
}

function ChatHeader({ onMenu, onOptions }: { onMenu: () => void; onOptions: () => void }) {
  const { colors, chatTitle, activeConversationId } = useApp();
  return <View style={[styles.header, { borderBottomColor: colors.separator }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open conversations" onPress={onMenu} style={[styles.headerButton, { borderColor: colors.separator }]}><Menu color={colors.text} size={21} strokeWidth={1.7} /></Pressable>
    <View style={styles.headerCopy}><AppText tone="secondary" style={styles.subtitle}>TRAINING ASSISTANT</AppText><AppText weight="medium" style={styles.title} numberOfLines={2}>{chatTitle}</AppText></View>
    {activeConversationId ? <Pressable accessibilityRole="button" accessibilityLabel="Conversation options" onPress={onOptions} style={styles.headerButton}><MoreHorizontal color={colors.text} size={22} /></Pressable> : null}
  </View>;
}

function ChatHistory({ context, onSelectText }: { context?: string; onSelectText: (message: ChatMessage) => void }) {
  const { colors, chatMessages, chatBusy, chatLoading, chatError, hasOlderMessages, refreshChat } = useApp();
  const busy = chatBusy || chatLoading;
  return <>
    {chatError ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void refreshChat()} style={[styles.historyNotice, { backgroundColor: colors.fill }]}><AppText style={styles.historyNoticeText}>{chatError} Tap to reload.</AppText></Pressable> : null}
    {hasOlderMessages ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void refreshChat(true)} style={styles.historyMore}><AppText tone="tint" style={styles.historyNoticeText}>Load older messages</AppText></Pressable> : null}
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
  const hasMessages = chatMessages.length > 0;
  const scrollRef = useRef<ScrollView>(null);
  const focused = useRef(false);
  const following = useRef(true);
  const scrollContext = useRef({ activeConversationId, userId, hasMessages });
  const followContent = useCallback(() => {
    if (!focused.current || !following.current) return;
    // Layout drives following; streamed tokens never queue native scroll animations.
    if (scrollContext.current.hasMessages) scrollRef.current?.scrollToEnd({ animated: false });
    else scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);
  useEffect(() => {
    const previous = scrollContext.current;
    // A new chat receives its first server ID during streaming, not a user switch.
    const switched = (previous.activeConversationId !== null && previous.activeConversationId !== activeConversationId)
      || previous.userId !== userId;
    scrollContext.current = { activeConversationId, userId, hasMessages };
    if (switched || !hasMessages || !previous.hasMessages) following.current = true;
    if (switched || hasMessages !== previous.hasMessages) followContent();
  }, [activeConversationId, followContent, hasMessages, userId]);
  // Keep the selected conversation and draft across tab visits; only dismiss menus.
  useFocusEffect(useCallback(() => {
    focused.current = true;
    setMenuOpen(false); setOptionsOpen(false); setSelection(null);
    followContent();
    return () => { focused.current = false; setSelection(null); };
  }, [followContent]));
  const selectConversation = (id?: string, title?: string) => {
    following.current = true;
    openConversation(id, title); setDraft(''); setMenuOpen(false); setSelection(null);
    followContent();
  };
  const selectText = (message: ChatMessage) => {
    Keyboard.dismiss();
    // Snapshot once so incoming tokens cannot move the user's selection handles.
    setSelection({ text: message.role === 'assistant' ? markdownPlainText(message.text) : message.text,
      userId, conversationId: activeConversationId });
  };
  const submit = () => { if (!draft.trim() || busy) return; const message = draft; following.current = true; setDraft(''); void sendChat(message, context); };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      {selection && selection.userId === userId && selection.conversationId === activeConversationId
        ? <MessageTextSelection text={selection.text} onClose={() => setSelection(null)} /> : null}
      {optionsOpen ? <ConversationActions onClose={() => setOptionsOpen(false)} /> : null}
      {menuOpen ? <ConversationSidebar onClose={() => setMenuOpen(false)} onSelect={selectConversation} /> : null}
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ChatHeader onMenu={() => { setMenuOpen(true); void refreshConversations(); }} onOptions={() => setOptionsOpen(true)} />
        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}
          onContentSizeChange={followContent} onLayout={followContent} scrollEventThrottle={100}
          onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
            following.current = contentSize.height - layoutMeasurement.height - contentOffset.y <= 96;
          }}>
          <ChatHistory context={context} onSelectText={selectText} />
        </ScrollView>
        <Composer draft={draft} busy={busy} onChange={setDraft} onSubmit={submit} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 92, paddingHorizontal: 22, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  headerCopy: { flex: 1 },
  title: { fontSize: 21, lineHeight: 27, letterSpacing: -0.6, marginTop: 3 },
  subtitle: { fontSize: 9, lineHeight: 13, letterSpacing: 1.4 },
  messages: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 28, gap: 28, flexGrow: 1 },
  message: { maxWidth: '100%' },
  userWrap: { alignSelf: 'flex-end', alignItems: 'flex-end', maxWidth: '90%' },
  assistantWrap: { alignSelf: 'stretch', alignItems: 'flex-start' },
  responseLabel: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  responseDot: { width: 5, height: 5, borderRadius: 3 },
  responseName: { fontSize: 10, lineHeight: 14, letterSpacing: 1.6 },
  bubble: { minHeight: 32, maxWidth: '100%' },
  userBubble: { borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 17, paddingVertical: 13 },
  assistantBubble: { alignSelf: 'stretch' },
  messageText: { fontSize: 15, lineHeight: 23 },
  basis: { fontSize: 11, lineHeight: 17, marginTop: 12 },
  sources: { alignSelf: 'stretch', marginTop: 20 },
  sourceToggle: { minHeight: 76, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sourceToggleIcon: { width: 42, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sourceToggleCopy: { flex: 1, gap: 4 },
  sourceToggleText: { fontSize: 15, lineHeight: 20 },
  sourceToggleHint: { fontSize: 11, lineHeight: 16 },
  sourceModal: { flex: 1, justifyContent: 'flex-end' },
  sourceBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sourceSheet: { maxHeight: '86%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 18 },
  sourceHandle: { alignSelf: 'center', width: 32, height: 3, borderRadius: 2, marginTop: 10 },
  sourceSheetHeader: { minHeight: 114, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22 },
  sourceSheetCopy: { flex: 1 },
  sourceEyebrow: { fontSize: 9, lineHeight: 14, letterSpacing: 1.4 },
  sourceSheetTitle: { fontSize: 27, lineHeight: 34, letterSpacing: -0.9, marginTop: 4 },
  sourceSheetSubtitle: { marginTop: 4, fontSize: 11, lineHeight: 16 },
  sourceClose: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sourceList: { padding: 18, gap: 12 },
  sourceRow: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, overflow: 'hidden' },
  sourceRowHeading: { minHeight: 62, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sourceKind: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceRowBody: { padding: 20 },
  sourceNumber: { fontSize: 28, lineHeight: 34, fontVariant: ['tabular-nums'], letterSpacing: -1.4 },
  sourceTitle: { fontSize: 21, lineHeight: 28, letterSpacing: -0.5 },
  sourceMeta: { flexShrink: 1, fontSize: 10, lineHeight: 15, letterSpacing: 0.5 },
  sourcePreviewWrap: { borderLeftWidth: 2, paddingLeft: 12, marginTop: 18 },
  sourcePreview: { fontSize: 12, lineHeight: 20 },
  sourceRowActions: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sourceReadButton: { flex: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sourceActionText: { fontSize: 12, lineHeight: 18, flexShrink: 1 },
  sourceLink: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sourceOpenButton: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, flexShrink: 0 },
  sourceExcerptButton: { minHeight: 44, justifyContent: 'center' },
  sourceExcerpt: { gap: 16 },
  sourceDocument: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 22 },
  sourceDocumentHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 },
  sourceDocumentIcon: { width: 46, height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sourceDocumentMeta: { flex: 1, fontSize: 11, lineHeight: 17 },
  sourceExcerptTitle: { fontSize: 25, lineHeight: 33, letterSpacing: -0.7 },
  sourceOriginalLink: { fontSize: 11, lineHeight: 18, marginTop: 12 },
  sourceOriginalButton: { minHeight: 52, paddingTop: 12, marginTop: 18, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sourcePassage: { borderRadius: 20, padding: 22, gap: 20 },
  sourcePassageHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sourceExcerptText: { fontSize: 15, lineHeight: 26 },
  quickArea: { gap: 16 },
  welcome: { gap: 16, paddingTop: 14, paddingBottom: 24 },
  eyebrow: { fontSize: 9, lineHeight: 14, letterSpacing: 1.5 },
  welcomeTitle: { fontSize: 36, lineHeight: 42, letterSpacing: -1.5, maxWidth: 330 },
  welcomeCopy: { fontSize: 14, lineHeight: 23, maxWidth: 330 },
  quickTitle: { fontSize: 10, lineHeight: 15, letterSpacing: 1.3 },
  quickList: { gap: 0 },
  quick: { minHeight: 70, paddingVertical: 17, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 16 },
  quickText: { fontSize: 13, lineHeight: 20, flex: 1 },
  historyNotice: { padding: 16, borderRadius: 16 },
  historyNoticeText: { fontSize: 13, lineHeight: 20 },
  historyMore: { minHeight: 44, justifyContent: 'center', alignSelf: 'center' },
  composerWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 5 : 12 },
  composer: { minHeight: 112, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8, padding: 10 },
  input: { flexBasis: '100%', minWidth: 0, minHeight: 40, maxHeight: 104, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, paddingHorizontal: 6, paddingTop: 7, paddingBottom: 7 },
  send: { width: 44, height: 44, marginLeft: 'auto', borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  disclaimer: { fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 8 },
});
