const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const jsx = (type, props) => ({ type, props });
const messages = [
  { id: 'human', role: 'user', text: 'My question' },
  { id: 'ai', role: 'assistant', text: '# Heading\nPlain **bold** and *italic* with `code`\n- Bullet\n1. Numbered\n> Quote\n```\nCode block\n```', basis: 'Research' },
];
const app = { colors: {}, chatMessages: messages, chatTitle: 'My question', authSession: { user: { id: 'owner' } }, activeConversationId: 'thread' };
const slots = []; let cursor = 0; let onFocus; let dismissals = 0;
const modules = {
  react: {
    useState: initial => {
      const index = cursor++; if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = value; }];
    },
    useRef: initial => { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect() {}, useCallback: fn => fn,
  },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': { Text: 'text', TextInput: 'input', Modal: 'modal', View: 'view', Pressable: 'button', Platform: { OS: 'ios' },
    Keyboard: { dismiss: () => dismissals++ }, StyleSheet: { create: value => value } },
  'expo-router': { useLocalSearchParams: () => ({}), useFocusEffect: fn => { onFocus = fn; } },
  'expo-linking': {}, 'expo-linear-gradient': {}, 'lucide-react-native': {}, 'react-native-safe-area-context': {},
  '@/state/app-context': { useApp: () => app }, '@/design/tokens': { fonts: {}, radius: {}, shadow: {} },
  '@/lib/errors': {}, '@/lib/links': {}, '@/data/mock': { quickQuestions: [] }, '@/components/conversation-menu': {},
};
function load(file) {
  const code = ts.transpileModule(readFileSync(resolve(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (!(name in modules)) throw new Error(`unexpected import: ${name}`);
    return modules[name];
  } });
  return exports;
}
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
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node.type === 'function') return nodes(node.type(node.props));
  return [node, ...nodes(node.props.children)];
}
const selectedInput = () => nodes(render()).find(node => node.type === 'input' && node.props.accessibilityLabel === 'Message text');
const messageText = value => textRoots(render()).find(node => JSON.stringify(node.props.children).includes(value) && node.props.onLongPress);

function textRoots(node, insideText = false) {
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
    const input = selectedInput().props;
    assert.equal(input.multiline, true);
    assert.equal(input.editable, false);
    assert.equal(input.showSoftInputOnFocus, false);
    assert.equal(input.scrollEnabled, true);
    assert.equal(input.contextMenuHidden, false);
    assert.equal(input.selection, undefined); // Native handle movements are never reset by JS.
    assert.equal(input.onChangeText, undefined);
    assert.ok(input.defaultValue.includes(value === 'My question' ? value : 'Code block'));
    assert.equal(dismissals, 1);
    nodes(render()).find(node => node.props.accessibilityLabel === 'Close text selection').props.onPress();
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
  const snapshot = selectedInput().props.defaultValue;
  app.chatMessages = [...messages.slice(0, 1), { ...messages[1], text: messages[1].text + '\nMore tokens' }];
  assert.equal(selectedInput().props.defaultValue, snapshot);
  assert.equal(app.chatMessages[1].text.includes('More tokens'), true);
  nodes(render()).find(node => node.type === 'modal').props.onRequestClose();
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
  assert.equal(selectedInput().props.defaultValue, '# Keep **my** original text');
});
