import type { Tokens } from 'marked';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { MarkdownInline } from '@/features/chat/components/markdown-inline';
import {
  BORDER_WIDTH,
  COPY,
  TABLE_CELL_PADDING_HORIZONTAL,
  TABLE_RADIUS,
  TABLE_TEXT_CELL_MAX_WIDTH,
} from '@/features/chat/constants';
import { useChatGutter } from '@/features/chat/use-chat-gutter';
import { useTheme } from '@/hooks/use-theme';

type MeasuredColumns = {
  layoutKey: string;
  widths: number[];
};

const DIGIT_PATTERN = /\d/;

type MarkdownTableProps = {
  table: Tokens.Table;
};

export function MarkdownTable({ table }: MarkdownTableProps) {
  const theme = useTheme();
  const gutter = useChatGutter();
  const { fontScale } = useWindowDimensions();
  const [measuredColumns, setMeasuredColumns] = useState<MeasuredColumns>({ layoutKey: '', widths: [] });
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);

  const columnCount = table.header.length;
  const layoutKey = `${columnCount}:${fontScale}`;
  const columnWidths = measuredColumns.layoutKey === layoutKey ? measuredColumns.widths : [];
  const rows = [table.header, ...table.rows];
  const isScrollable = contentWidth > viewportWidth;

  const handleCellLayout = (columnIndex: number, width: number) => {
    const cellWidth = Math.ceil(width);
    setMeasuredColumns((current) => {
      const widths = current.layoutKey === layoutKey ? current.widths : [];
      if ((widths[columnIndex] ?? 0) >= cellWidth) return current;
      return {
        layoutKey,
        widths: Array.from({ length: columnCount }, (_, index) =>
          index === columnIndex ? cellWidth : (widths[index] ?? 0),
        ),
      };
    });
  };

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        style={{ marginHorizontal: -gutter }}
        contentContainerStyle={{ paddingHorizontal: gutter }}
        onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={(width) => setContentWidth(width)}>
        <View style={[styles.table, { borderColor: theme.border }]}>
          {rows.map((row, rowIndex) => {
            const isHeader = rowIndex === 0;
            const isLastRow = rowIndex === rows.length - 1;
            return (
              <View
                key={rowIndex}
                style={[styles.row, isHeader && { backgroundColor: theme.backgroundElement }]}>
                {row.map((cell, columnIndex) => {
                  const canWrap = isHeader || !DIGIT_PATTERN.test(cell.text);
                  return (
                    <View
                      key={columnIndex}
                      onLayout={(event) => handleCellLayout(columnIndex, event.nativeEvent.layout.width)}
                      style={[
                        styles.cell,
                        { borderColor: theme.border, minWidth: columnWidths[columnIndex] },
                        canWrap && styles.wrappingCell,
                        columnIndex < columnCount - 1 && styles.cellRightBorder,
                        !isLastRow && styles.cellBottomBorder,
                      ]}>
                      <ThemedText selectable style={isHeader ? styles.headerText : styles.bodyText}>
                        <MarkdownInline tokens={cell.tokens} />
                      </ThemedText>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
      {isScrollable && (
        <ThemedText themeColor="textSecondary" style={styles.scrollHint}>
          {COPY.tableScrollHint}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    alignSelf: 'flex-start',
    borderWidth: BORDER_WIDTH,
    borderRadius: TABLE_RADIUS,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    paddingVertical: Spacing.two,
    paddingHorizontal: TABLE_CELL_PADDING_HORIZONTAL,
  },
  wrappingCell: {
    maxWidth: TABLE_TEXT_CELL_MAX_WIDTH,
  },
  cellRightBorder: {
    borderRightWidth: BORDER_WIDTH,
  },
  cellBottomBorder: {
    borderBottomWidth: BORDER_WIDTH,
  },
  headerText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 600,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 400,
    fontVariant: ['tabular-nums'],
  },
  scrollHint: {
    marginTop: Spacing.two,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 400,
  },
});
