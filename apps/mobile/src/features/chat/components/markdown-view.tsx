import type { Token, Tokens } from 'marked';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { MarkdownInline } from '@/features/chat/components/markdown-inline';
import { MarkdownTable } from '@/features/chat/components/markdown-table';
import {
  BORDER_WIDTH,
  MARKDOWN_BLOCK_GAP,
  MARKDOWN_BULLET_INDENT,
  MARKDOWN_CODE_PADDING,
  MARKDOWN_CODE_RADIUS,
  MARKDOWN_LIST_ITEM_GAP,
  MARKDOWN_NUMBER_INDENT,
  MARKDOWN_QUOTE_BAR_WIDTH,
  MARKDOWN_QUOTE_PADDING,
} from '@/features/chat/constants';
import {
  hasRowsWiderThanHeader,
  isMarkedToken,
  lexMarkdownBlocks,
} from '@/features/chat/markdown-tokens';
import { useTheme } from '@/hooks/use-theme';

const HIDDEN_BLOCK_TYPES = new Set(['space', 'def']);
const LARGE_HEADING_MAX_DEPTH = 2;
const BULLET = '•';
const ORDERED_MARKER_PATTERN = /^\s*(\d{1,9}[.)])/;

type MarkdownViewProps = {
  markdown: string;
};

export function MarkdownView({ markdown }: MarkdownViewProps) {
  return <MarkdownBlocks tokens={lexMarkdownBlocks(markdown)} gap={MARKDOWN_BLOCK_GAP} />;
}

function MarkdownBlocks({ tokens, gap }: { tokens: Token[]; gap: number }) {
  const visibleTokens = tokens.filter((token) => !HIDDEN_BLOCK_TYPES.has(token.type));
  return (
    <View style={{ gap }}>
      {visibleTokens.map((token, index) => (
        <MarkdownBlock key={index} token={token} isFirst={index === 0} />
      ))}
    </View>
  );
}

function MarkdownBlock({ token, isFirst }: { token: Token; isFirst: boolean }) {
  const theme = useTheme();

  if (!isMarkedToken(token)) return <PlainParagraph text={token.raw} />;

  switch (token.type) {
    case 'paragraph':
      return (
        <ThemedText selectable style={styles.paragraph}>
          <MarkdownInline tokens={token.tokens} />
        </ThemedText>
      );
    case 'text':
      return token.tokens ? (
        <ThemedText selectable style={styles.paragraph}>
          <MarkdownInline tokens={token.tokens} />
        </ThemedText>
      ) : (
        <PlainParagraph text={token.text} />
      );
    case 'heading': {
      const isLarge = token.depth <= LARGE_HEADING_MAX_DEPTH;
      return (
        <ThemedText
          selectable
          accessibilityRole="header"
          style={[
            isLarge ? styles.largeHeading : styles.smallHeading,
            isLarge && !isFirst && styles.largeHeadingSpacing,
          ]}>
          <MarkdownInline tokens={token.tokens} />
        </ThemedText>
      );
    }
    case 'list':
      return <MarkdownList list={token} />;
    case 'blockquote':
      return (
        <View style={[styles.blockquote, { borderLeftColor: theme.border }]}>
          <MarkdownBlocks tokens={token.tokens} gap={MARKDOWN_BLOCK_GAP} />
        </View>
      );
    case 'code':
      return <CodeBlock text={token.text} />;
    case 'hr':
      return <View style={[styles.rule, { backgroundColor: theme.border }]} />;
    case 'table':
      return hasRowsWiderThanHeader(token) ? (
        <CodeBlock text={token.raw.trimEnd()} />
      ) : (
        <MarkdownTable table={token} />
      );
    default:
      return <PlainParagraph text={token.raw} />;
  }
}

function CodeBlock({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      style={[styles.codeBlock, { backgroundColor: theme.backgroundElement }]}
      contentContainerStyle={styles.codeBlockContent}>
      <ThemedText selectable style={styles.codeText}>
        {text}
      </ThemedText>
    </ScrollView>
  );
}

function PlainParagraph({ text }: { text: string }) {
  return (
    <ThemedText selectable style={styles.paragraph}>
      {text}
    </ThemedText>
  );
}

function MarkdownList({ list }: { list: Tokens.List }) {
  return (
    <View style={styles.list}>
      {list.items.map((item, index) => (
        <View key={index} style={styles.listItem}>
          <ThemedText
            themeColor="textSecondary"
            style={[styles.paragraph, list.ordered ? styles.orderedMarker : styles.bulletMarker]}>
            {list.ordered ? (ORDERED_MARKER_PATTERN.exec(item.raw)?.[1] ?? '') : BULLET}
          </ThemedText>
          <View style={styles.listItemContent}>
            <MarkdownBlocks tokens={item.tokens} gap={MARKDOWN_LIST_ITEM_GAP} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: 400,
  },
  largeHeading: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: 700,
  },
  largeHeadingSpacing: {
    marginTop: Spacing.two,
  },
  smallHeading: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: 700,
  },
  list: {
    gap: MARKDOWN_LIST_ITEM_GAP,
  },
  listItem: {
    flexDirection: 'row',
  },
  bulletMarker: {
    width: MARKDOWN_BULLET_INDENT,
  },
  orderedMarker: {
    minWidth: MARKDOWN_NUMBER_INDENT,
    fontVariant: ['tabular-nums'],
  },
  listItemContent: {
    flex: 1,
  },
  blockquote: {
    borderLeftWidth: MARKDOWN_QUOTE_BAR_WIDTH,
    paddingLeft: MARKDOWN_QUOTE_PADDING,
  },
  codeBlock: {
    borderRadius: MARKDOWN_CODE_RADIUS,
  },
  codeBlockContent: {
    padding: MARKDOWN_CODE_PADDING,
  },
  codeText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 400,
  },
  rule: {
    height: BORDER_WIDTH,
    marginVertical: Spacing.two,
  },
});
