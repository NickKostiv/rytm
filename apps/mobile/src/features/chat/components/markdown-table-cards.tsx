import type { Tokens } from 'marked';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { MarkdownInline } from '@/features/chat/components/markdown-inline';
import { BORDER_WIDTH, TABLE_RADIUS } from '@/features/chat/constants';
import { useTheme } from '@/hooks/use-theme';

const CARD_PADDING = 12;
const LABEL_VALUE_GAP = 2;

type MarkdownTableCardsProps = {
  table: Tokens.Table;
};

export function MarkdownTableCards({ table }: MarkdownTableCardsProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      {table.rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={[styles.card, rowIndex > 0 && { borderTopWidth: BORDER_WIDTH, borderColor: theme.border }]}>
          {row.map((cell, columnIndex) => {
            if (cell.text === '') return null;
            const header = table.header[columnIndex];
            return (
              <View key={columnIndex} style={styles.pair}>
                {header && header.text !== '' && (
                  <ThemedText selectable type="caption" themeColor="textSecondary">
                    <MarkdownInline tokens={header.tokens} />
                  </ThemedText>
                )}
                <ThemedText selectable type="table" style={columnIndex === 0 && styles.firstValue}>
                  <MarkdownInline tokens={cell.tokens} />
                </ThemedText>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: BORDER_WIDTH,
    borderRadius: TABLE_RADIUS,
    overflow: 'hidden',
  },
  card: {
    padding: CARD_PADDING,
    gap: Spacing.two,
  },
  pair: {
    gap: LABEL_VALUE_GAP,
  },
  firstValue: {
    fontWeight: 600,
  },
});
