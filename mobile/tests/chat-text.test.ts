import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load as loadModule, jsx, type TestValue, type TestModule, type TestNode, type Stubs } from './helpers.ts';
import type { ChatMessage } from '../src/domain/types';
const messages: ChatMessage[] = [
  { id: 'human', role: 'user', text: 'My question' },
  { id: 'ai', role: 'assistant', text: '# Heading\nPlain **bold** and *italic* with `code`\n- Bullet\n1. Numbered\n> Quote\n```\nCode block\n```', basis: 'Research' },
];
const app = { colors: {}, chatMessages: messages, chatTitle: 'My question', authSession: { user: { id: 'owner' } } as { user: { id: string } } | null, activeConversationId: 'thread' };
const slots: TestValue[] = []; let cursor = 0; let onFocus!: () => () => void; let dismissals = 0;
const modules: TestModule = {
  react: {
    useState: initial => {
      const index = cursor++; if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value: TestValue) => { slots[index] = value; }];
    },
    useRef: initial => { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect() {}, useCallback: fn => fn,
  },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': { Text: 'text', TextInput: 'input', Modal: 'modal', View: 'view', Pressable: 'button', Platform: { OS: 'ios' },
    Keyboard: { dismiss: () => dismissals++ }, StyleSheet: { create: value => value } },
  'expo-router': { useLocalSearchParams: () => ({}), useFocusEffect: fn => { onFocus = fn; } },
  'expo-linking': { openURL: async (url: string) => { openedUrls.push(url); } }, 'expo-linear-gradient': {}, 'lucide-react-native': { ArrowUpRight: 'external-arrow' }, 'react-native-safe-area-context': {},
  '@/state/app-context': { useApp: () => app }, '@/design/tokens': { fonts: {}, radius: {}, shadow: {} },
  '@/lib/errors': {}, '@/lib/links': {}, '@/data/mock': { quickQuestions: [] }, '@/components/conversation-menu': {},
  '@/components/chat-mode-selector': { ChatModeSelector: 'mode-selector' },
  '@/components/chat-progress': { ChatProgress: 'progress' },
} satisfies Stubs;
const load = (file: string) => loadModule(file, modules);
const openedUrls: string[] = [];
modules['@/lib/links'] = load('lib/links.ts');
modules['@/components/ui'] = load('components/ui.tsx');
modules['./ui'] = modules['@/components/ui'];
const selection = load('components/message-text-selection.tsx');
modules['./message-text-selection'] = selection;
modules['@/components/message-text-selection'] = selection;
modules['@/components/markdown-text'] = load('components/markdown-text.tsx');
const ChatScreen = load('screens/chat-screen.tsx').default;
const render = () => { cursor = 0; return ChatScreen(); };
function reset(platform = 'ios') {
  slots.length = 0; dismissals = 0;
  modules['react-native'].Platform.OS = platform;
  app.chatMessages = messages; app.authSession = { user: { id: 'owner' } }; app.activeConversationId = 'thread';
}
function nodes(node: TestValue): TestNode[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node.type === 'function') return nodes(node.type(node.props));
  return [node, ...nodes(node.props.children)];
}
const selectedInput = () => nodes(render()).find(node => node.type === 'input' && node.props.accessibilityLabel === 'Message text');
const messageText = (value: string) => textRoots(render()).find(node => JSON.stringify(node.props.children).includes(value) && node.props.onLongPress)!;

test('mode selector sits inside the message box immediately before Send without stretching', () => {
  reset();
  const box = nodes(render()).find(node => node.props.children?.[1]?.type === 'mode-selector')!;
  assert.ok(box);
  assert.equal(box.props.style[0].alignItems, 'flex-end');
  assert.equal(box.props.children[0].props.accessibilityLabel, 'Message Arcel');
  assert.equal(box.props.children[2].props.accessibilityLabel, 'Send message');
});

test('chat shows stages only until response text arrives, never beside streaming or saved text', () => {
  reset();
  for (const progress of [undefined, 'fetching_user_context', 'researching', 'thinking'] as const) {
    app.chatMessages = [{ id: 'pending', role: 'assistant', text: '', pending: true, progress }];
    assert.equal(nodes(render()).find(node => node.type === 'progress')?.props.stage, progress);
    app.chatMessages[0].text = 'Partial answer';
    assert.equal(nodes(render()).some(node => node.type === 'progress'), false);
    assert.ok(textRoots(render()).some(node => JSON.stringify(node.props.children).includes('Partial answer')));
  }
  app.chatMessages = [{ id: 'reply', role: 'assistant', text: 'Saved answer', pending: false }];
  assert.equal(nodes(render()).some(node => node.type === 'progress'), false);
});

function textRoots(node: TestValue, insideText = false): TestNode[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => textRoots(child, insideText));
  if (typeof node.type === 'function') return textRoots(node.type(node.props), insideText);
  return [...(node.type === 'text' && !insideText ? [node] : []), ...textRoots(node.props.children, insideText || node.type === 'text')];
}

test('Android/web retain inline selection and ordinary UI labels stay non-selectable', () => {
  for (const platform of ['android', 'web']) {
    reset(platform);
    const nodes = textRoots(render());
    for (const value of ['My question', 'Heading', 'Plain ', 'Bullet', 'Numbered', 'Quote', 'Code block', 'Research']) {
      const matches = nodes.filter(node => node.props.selectable && JSON.stringify(node.props.children).includes(value));
      assert.ok(matches.length, `selectable text missing: ${value}`);
    }
    assert.equal(selectedInput(), undefined);
  }
  // Enabling message selection must not make every UI label selectable.
  const title = modules['@/components/ui'].AppText({ children: 'Title' });
  assert.equal(title.props.selectable, undefined);
});

test('iOS long-press on every message block opens a read-only multiline selection view instead of whole-block copy', () => {
  for (const value of ['My question', 'Heading', 'Plain ', 'Bullet', 'Numbered', 'Quote', 'Code block']) {
    reset();
    const text = messageText(value); assert.ok(text, value);
    assert.equal(text.props.selectable, false);
    text.props.onLongPress();
    const input = selectedInput()!.props;
    assert.equal(input.multiline, true);
    assert.equal(input.editable, false);
    assert.equal(input.showSoftInputOnFocus, false);
    assert.equal(input.scrollEnabled, true);
    assert.equal(input.contextMenuHidden, false);
    assert.equal(input.selection, undefined); // Native handle movements are never reset by JS.
    assert.equal(input.onChangeText, undefined);
    assert.ok(input.defaultValue.includes(value === 'My question' ? value : 'Code block'));
    assert.equal(dismissals, 1);
    nodes(render()).find(node => node.props.accessibilityLabel === 'Close text selection')!.props.onPress();
    assert.equal(selectedInput(), undefined);
  }
});

test('selection supports accessibility actions and preserves a snapshot while more tokens arrive', () => {
  reset();
  const text = messageText('Heading');
  assert.equal(text.props.accessibilityActions[0].name, 'selectText');
  text.props.onAccessibilityAction({ nativeEvent: { actionName: 'other' } });
  assert.equal(selectedInput(), undefined);
  text.props.onAccessibilityAction({ nativeEvent: { actionName: 'selectText' } });
  const snapshot = selectedInput()!.props.defaultValue;
  app.chatMessages = [...messages.slice(0, 1), { ...messages[1], text: messages[1].text + '\nMore tokens' }];
  assert.equal(selectedInput()!.props.defaultValue, snapshot);
  assert.equal(app.chatMessages[1].text.includes('More tokens'), true);
  nodes(render()).find(node => node.type === 'modal')!.props.onRequestClose();
  assert.equal(selectedInput(), undefined);
});

test('selection is hidden on account/conversation changes and closes on tab blur', () => {
  reset(); messageText('My question').props.onLongPress();
  assert.ok(selectedInput());
  app.authSession = { user: { id: 'other-owner' } }; assert.equal(selectedInput(), undefined);
  app.authSession = null; assert.equal(selectedInput(), undefined);
  reset(); messageText('My question').props.onLongPress();
  app.activeConversationId = 'other-thread'; assert.equal(selectedInput(), undefined);
  reset(); render(); const blur = onFocus();
  messageText('My question').props.onLongPress(); assert.ok(selectedInput());
  blur(); assert.equal(selectedInput(), undefined);
});

test('selection uses rendered markdown text but preserves literal fenced/inline code and user messages', () => {
  const { markdownPlainText } = modules['@/components/markdown-text'];
  assert.equal(markdownPlainText('# Heading\r\n**Bold** *italic* `code` [label](https://example.com)\n- Bullet\n1. Numbered\n> Quote'),
    'Heading\nBold italic code label\n• Bullet\n1. Numbered\nQuote');
  assert.equal(markdownPlainText('```text\n# literal **bold**\n- code\n```\n`**literal**`'), '# literal **bold**\n- code\n**literal**');
  assert.equal(markdownPlainText('```\nUnclosed **code**'), 'Unclosed **code**');
  reset(); app.chatMessages = [{ id: 'user', role: 'user', text: '# Keep **my** original text' }];
  messageText('Keep').props.onLongPress();
  assert.equal(selectedInput()!.props.defaultValue, '# Keep **my** original text');
});

test('research sources prefer titles, fall back to DOI, and keep DOI navigation', () => {
  for (const title of ['  Recovery research  ', '', '   ', undefined]) {
    reset(); openedUrls.length = 0;
    const label = title?.trim() || '10.1234/recovery';
    app.chatMessages = [{ id: 'reply', role: 'assistant', text: 'Answer', sources: [
      { source_type: 'research', title, doi: '10.1234/recovery', content: 'Excerpt' },
    ] }];
    nodes(render()).find(node => node.props.accessibilityLabel === 'Open 1 source')!.props.onPress();
    nodes(render()).find(node => node.props.accessibilityLabel === `Open source: ${label}`)!.props.onPress();
    assert.deepEqual(openedUrls, ['https://doi.org/10.1234/recovery']);
    nodes(render()).find(node => node.props.accessibilityLabel === `Read excerpt from ${label}`)!.props.onPress();
    assert.ok(nodes(render()).find(node => node.props.selectable && node.props.children === label));
  }
});

test('sources open DOI/web links separately from full selectable excerpts', () => {
  reset(); openedUrls.length = 0;
  app.chatMessages = [{ id: 'reply', role: 'assistant', text: 'Answer', sources: [
    { source_type: 'research', doi: '10.1234/paper#part?', content: 'Research excerpt\n' + 'Full passage. '.repeat(500) },
    { source_type: 'web', title: 'Online article', url: 'https://example.org/article', content: 'Web excerpt' },
    { source_type: 'research', title: 'paper.pdf', document_id: 'chunk-3' },
  ] }];
  const button = (label: string) => nodes(render()).find(node => node.props.accessibilityLabel === label)!;
  button('Open 3 sources').props.onPress();
  const sourceLink = button('Open source: 10.1234/paper#part?');
  assert.equal(sourceLink.props.children.type, 'external-arrow');
  assert.equal(sourceLink.props.style[1].borderWidth, 1.5);
  assert.equal(sourceLink.props.style[0].width, 44);
  button('Open source: 10.1234/paper#part?').props.onPress();
  button('Open source: Online article').props.onPress();
  assert.deepEqual(openedUrls, ['https://doi.org/10.1234/paper%23part%3F', 'https://example.org/article']);
  button('Read excerpt from 10.1234/paper#part?').props.onPress();
  assert.equal(nodes(render()).filter(node => node.type === 'modal').length, 1);
  assert.ok(nodes(render()).find(node => node.props.selectable && node.props.children === app.chatMessages[0].sources![0].content!.trim()));
  button('Back to sources').props.onPress();
  button('Read excerpt from Online article').props.onPress();
  assert.ok(nodes(render()).find(node => node.props.selectable && node.props.children === 'Web excerpt'));
  nodes(render()).find(node => node.type === 'modal')!.props.onRequestClose();
  button('Read excerpt from paper.pdf').props.onPress();
  assert.equal(button('Open original source'), undefined);
  assert.ok(nodes(render()).find(node => node.props.children === 'No excerpt is available for this source.'));
  button('Close sources').props.onPress();
  assert.equal(nodes(render()).some(node => node.type === 'modal'), false);
  button('Open 3 sources').props.onPress();
  assert.ok(button('Read excerpt from Online article'));
  const blur = onFocus();
  blur();
  assert.equal(nodes(render()).some(node => node.type === 'modal'), false);
});
