import { useLocalSearchParams } from 'expo-router';
import { ArrowUp, Sparkles } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { MarkdownText } from '@/components/markdown-text';
import { quickQuestions } from '@/data/mock';
import { fonts, radius } from '@/design/tokens';
import type { ChatMessage } from '@/domain/types';
import { useApp } from '@/state/app-context';

function MessageContent({ message }: { message: ChatMessage }) {
  const { colors } = useApp();
  if (message.pending && !message.text) return <ActivityIndicator color={colors.tint} size="small" />;
  if (message.role === 'assistant') return <MarkdownText>{message.text}</MarkdownText>;
  return <AppText tone="inverse" style={styles.messageText}>{message.text}</AppText>;
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const { colors } = useApp();
  const fromUser = message.role === 'user';
  const sourceLabel = message.sources?.length
    ? `${message.sources.length} source${message.sources.length === 1 ? '' : 's'} returned by the live assistant`
    : null;
  return (
    <View style={[styles.message, fromUser ? styles.userWrap : styles.assistantWrap]}>
      <View style={[styles.bubble, { backgroundColor: fromUser ? colors.strong : colors.card }]}><MessageContent message={message} /></View>
      {message.basis ? <AppText tone="secondary" style={styles.basis}>Based on: {message.basis}</AppText> : null}
      {sourceLabel ? <AppText tone="secondary" style={styles.basis}>{sourceLabel}</AppText> : null}
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
        <TextInput value={draft} onChangeText={onChange} onSubmitEditing={onSubmit} placeholder="Ask about your plan…" placeholderTextColor={colors.textTertiary} style={[styles.input, { color: colors.text }]} multiline maxLength={800} accessibilityLabel="Message Arcel" />
        <Pressable accessibilityRole="button" accessibilityLabel="Send message" onPress={onSubmit} disabled={!canSend} style={[styles.send, { backgroundColor: canSend ? colors.strong : colors.fillStrong }]}><ArrowUp color={canSend ? colors.strongText : colors.textTertiary} size={20} strokeWidth={2.3} /></Pressable>
      </View>
      <AppText tone="secondary" style={styles.disclaimer}>Training guidance, not medical care.</AppText>
    </View>
  );
}

export default function ChatScreen() {
  const params = useLocalSearchParams<{ context?: string }>();
  const context = Array.isArray(params.context) ? params.context[0] : params.context;
  const { colors, chatMessages, chatBusy, sendChat, previewMode } = useApp();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [chatMessages]);
  const submit = () => { if (!draft.trim()) return; const message = draft; setDraft(''); void sendChat(message, context); };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        <View style={[styles.header, { borderBottomColor: colors.separator }]}>
          <View style={[styles.spark, { backgroundColor: colors.tintSoft }]}><Sparkles color={colors.tintText} size={20} /></View>
          <View style={styles.headerCopy}><AppText weight="bold" style={styles.title}>Ask Arcel</AppText><AppText tone="secondary" style={styles.subtitle}>{context ? `Using ${context}` : 'Plan-aware training help'} · {previewMode ? 'preview' : 'live'}</AppText></View>
        </View>
        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}>
          {chatMessages.map((message) => <ChatBubble key={message.id} message={message} />)}
          {chatMessages.length <= 1 ? <QuickQuestions context={context} /> : null}
        </ScrollView>
        <Composer draft={draft} busy={chatBusy} onChange={setDraft} onSubmit={submit} />
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
  quickArea: { marginTop: 8, gap: 9 },
  quickTitle: { fontSize: 12, marginLeft: 3 },
  quickList: { gap: 8 },
  quick: { minHeight: 46, borderRadius: 15, paddingHorizontal: 14, justifyContent: 'center' },
  quickText: { fontSize: 14 },
  composerWrap: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10, paddingBottom: Platform.OS === 'ios' ? 4 : 10 },
  composer: { minHeight: 50, maxHeight: 120, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 13, paddingRight: 5, paddingVertical: 5 },
  input: { flex: 1, minHeight: 39, maxHeight: 106, fontFamily: fonts.regular, fontSize: 15, paddingTop: 9, paddingBottom: 8 },
  send: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  disclaimer: { fontSize: 9, lineHeight: 12, textAlign: 'center', marginTop: 4 },
});
