import type { Token } from 'marked';
import { StyleSheet, Text } from 'react-native';

import { Fonts } from '@/constants/theme';
import { keepQuantitiesTogether } from '@/features/chat/keep-quantities-together';
import { isMarkedToken } from '@/features/chat/markdown-tokens';
import { useTheme } from '@/hooks/use-theme';

type MarkdownInlineProps = {
  tokens: Token[];
};

export function MarkdownInline({ tokens }: MarkdownInlineProps) {
  return tokens.map((token, index) => <InlineToken key={index} token={token} />);
}

function InlineToken({ token }: { token: Token }) {
  const theme = useTheme();

  if (!isMarkedToken(token)) return token.raw;

  switch (token.type) {
    case 'strong':
      return (
        <Text style={styles.strong}>
          <MarkdownInline tokens={token.tokens} />
        </Text>
      );
    case 'em':
      return (
        <Text style={styles.emphasis}>
          <MarkdownInline tokens={token.tokens} />
        </Text>
      );
    case 'del':
    case 'link':
      return <MarkdownInline tokens={token.tokens} />;
    case 'text':
      return token.tokens ? (
        <MarkdownInline tokens={token.tokens} />
      ) : (
        keepQuantitiesTogether(token.text)
      );
    case 'codespan':
      return (
        <Text style={[styles.code, { backgroundColor: theme.backgroundElement }]}>{token.text}</Text>
      );
    case 'image':
    case 'escape':
      return token.text;
    case 'br':
      return '\n';
    default:
      return token.raw;
  }
}

const styles = StyleSheet.create({
  strong: {
    fontWeight: 700,
  },
  emphasis: {
    fontStyle: 'italic',
  },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 15,
  },
});
