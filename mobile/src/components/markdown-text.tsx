import * as Linking from 'expo-linking';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, radius, type Palette } from '@/design/tokens';
import { useApp } from '@/state/app-context';

const inlinePattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\)|\*[^*]+\*)/g;

function renderInlineToken(token: string, key: number, colors: Palette) {
  if (token.startsWith('**')) return <Text key={key} style={{ fontFamily: fonts.semibold }}>{token.slice(2, -2)}</Text>;
  if (token.startsWith('`')) return <Text key={key} style={[styles.inlineCode, { backgroundColor: colors.fill }]}>{token.slice(1, -1)}</Text>;
  if (token.startsWith('*')) return <Text key={key} style={{ fontStyle: 'italic' }}>{token.slice(1, -1)}</Text>;

  const [, label, url] = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/) ?? [];
  return <Text accessibilityRole="link" key={key} onPress={() => void Linking.openURL(url)} style={[styles.link, { color: colors.tintText }]}>{label}</Text>;
}

function inlineParts(text: string, colors: Palette) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(inlinePattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(renderInlineToken(match[0], index, colors));
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function InlineMarkdown({ children }: { children: string }) {
  const { colors } = useApp();
  return <Text style={[styles.paragraph, { color: colors.text }]}>{inlineParts(children, colors)}</Text>;
}

function MarkdownLine({ line, index }: { line: string; index: number }) {
  const { colors } = useApp();
  if (!line.trim()) return <View style={styles.spacer} />;

  const heading = line.match(/^(#{1,3})\s+(.+)$/);
  if (heading) return <Text style={[styles.heading, heading[1].length > 1 && styles.smallHeading, { color: colors.text }]}>{heading[2]}</Text>;

  const unordered = line.match(/^\s*[-*]\s+(.+)$/);
  if (unordered) return <View style={styles.listRow}><Text style={[styles.bullet, { color: colors.tint }]}>•</Text><View style={styles.listCopy}><InlineMarkdown>{unordered[1]}</InlineMarkdown></View></View>;

  const ordered = line.match(/^\s*(\d+)\.\s+(.+)$/);
  if (ordered) return <View style={styles.listRow}><Text style={[styles.number, { color: colors.tintText }]}>{ordered[1]}.</Text><View style={styles.listCopy}><InlineMarkdown>{ordered[2]}</InlineMarkdown></View></View>;

  const quote = line.match(/^>\s?(.+)$/);
  if (quote) return <View style={[styles.quote, { borderLeftColor: colors.tint }]}><InlineMarkdown>{quote[1]}</InlineMarkdown></View>;
  return <InlineMarkdown key={index}>{line}</InlineMarkdown>;
}

function CodeBlock({ lines }: { lines: string[] }) {
  const { colors } = useApp();
  return <View style={[styles.codeBlock, { backgroundColor: colors.fill }]}><Text selectable style={[styles.codeText, { color: colors.text }]}>{lines.join('\n')}</Text></View>;
}

export function MarkdownText({ children }: { children: string }) {
  const lines = children.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let codeLines: string[] | null = null;

  lines.forEach((line, index) => {
    if (line.trim().startsWith('```')) {
      if (codeLines) blocks.push(<CodeBlock key={`code-${index}`} lines={codeLines} />);
      codeLines = codeLines ? null : [];
      return;
    }
    if (codeLines) {
      codeLines.push(line);
      return;
    }
    blocks.push(<MarkdownLine key={index} line={line} index={index} />);
  });

  if (codeLines) blocks.push(<CodeBlock key={`code-${lines.length}`} lines={codeLines} />);
  return <View style={styles.container}>{blocks}</View>;
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  paragraph: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, letterSpacing: -0.2 },
  heading: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 24, marginTop: 4, marginBottom: 2 },
  smallHeading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21 },
  spacer: { height: 5 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingLeft: 2 },
  bullet: { width: 12, fontFamily: fonts.bold, fontSize: 17, lineHeight: 22 },
  number: { width: 20, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 22, textAlign: 'right' },
  listCopy: { flex: 1 },
  inlineCode: { fontFamily: 'monospace', fontSize: 13 },
  codeBlock: { borderRadius: radius.segment, padding: 10, marginVertical: 3 },
  codeText: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
  link: { fontFamily: fonts.medium, textDecorationLine: 'underline' },
  quote: { borderLeftWidth: 3, paddingLeft: 10, marginVertical: 3 },
});
