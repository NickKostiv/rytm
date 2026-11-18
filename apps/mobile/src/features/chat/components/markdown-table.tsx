import type { Tokens } from 'marked';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { MarkdownInline } from '@/features/chat/components/markdown-inline';
import { MarkdownTableCards } from '@/features/chat/components/markdown-table-cards';
import {
  BORDER_WIDTH,
  COPY,
  TABLE_CELL_PADDING_HORIZONTAL,
  TABLE_RADIUS,
  TABLE_TEXT_CELL_MAX_WIDTH,
  WIDE_LAYOUT_MIN_WIDTH,
} from '@/features/chat/constants';
import { useChatGutter } from '@/features/chat/use-chat-gutter';
import { useTheme } from '@/hooks/use-theme';

type MeasuredColumns = {
  layoutKey: string;
  widths: number[];
};

const CARDS_MIN_COLUMN_COUNT = 4;

type MarkdownTableProps = {
  table: Tokens.Table;
};

export function MarkdownTable({ table }: MarkdownTableProps) {
  const { width } = useWindowDimensions();
  const shouldShowCards =
    width < WIDE_LAYOUT_MIN_WIDTH && table.header.length >= CARDS_MIN_COLUMN_COUNT && table.rows.length > 0;
  return shouldShowCards ? <MarkdownTableCards table={table} /> : <ScrollableTable table={table} />;
}

function ScrollableTable({ table }: MarkdownTableProps) {
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
                {row.map((cell, columnIndex) => (
                  <View
                    key={columnIndex}
                    onLayout={(event) => handleCellLayout(columnIndex, event.nativeEvent.layout.width)}
                    style={[
                      styles.cell,
                      { borderColor: theme.border, minWidth: columnWidths[columnIndex] },
                      columnIndex < columnCount - 1 && styles.cellRightBorder,
                      !isLastRow && styles.cellBottomBorder,
                    ]}>
                    <ThemedText selectable type="table" style={isHeader && styles.headerText}>
                      <MarkdownInline tokens={cell.tokens} />
                    </ThemedText>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
      {isScrollable && (
        <ThemedText type="caption" themeColor="textSecondary" style={styles.scrollHint}>
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
    maxWidth: TABLE_TEXT_CELL_MAX_WIDTH,
  },
  cellRightBorder: {
    borderRightWidth: BORDER_WIDTH,
  },
  cellBottomBorder: {
    borderBottomWidth: BORDER_WIDTH,
  },
  headerText: {
    fontWeight: 600,
  },
  scrollHint: {
    marginTop: Spacing.two,
  },
});
