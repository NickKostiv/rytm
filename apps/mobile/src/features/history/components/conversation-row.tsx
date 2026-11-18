import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { BORDER_WIDTH, TOUCH_TARGET_SIZE } from '@/features/chat/constants';
import {
  CONVERSATION_ROW_MIN_HEIGHT,
  CONVERSATION_ROW_PADDING_HORIZONTAL,
  CONVERSATION_ROW_RADIUS,
  DELETE_ICON_SIZE,
  HISTORY_COPY,
} from '@/features/history/constants';
import type { Conversation } from '@/features/history/types';
import { useTheme } from '@/hooks/use-theme';

const DELETE_SYMBOL: SymbolViewProps['name'] = { ios: 'trash', android: 'delete', web: 'delete' };
const ROW_TEXT_PADDING_VERTICAL = 12;

type ConversationRowProps = {
  conversation: Conversation;
  date: string;
  isActive: boolean;
  isFirst: boolean;
  onOpen: (conversationId: string) => void;
  onDelete: (conversation: Conversation) => void;
};

export function ConversationRow({
  conversation,
  date,
  isActive,
  isFirst,
  onOpen,
  onDelete,
}: ConversationRowProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        !isFirst && [styles.divider, { borderTopColor: theme.border }],
        isActive && [styles.activeRow, { backgroundColor: theme.backgroundElement }],
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={HISTORY_COPY.rowA11yLabel(conversation.title, date, isActive)}
        accessibilityHint={HISTORY_COPY.rowA11yHint}
        onPress={() => onOpen(conversation.id)}
        style={({ pressed }) => [
          styles.openArea,
          pressed && { backgroundColor: theme.backgroundSelected },
        ]}>
        <ThemedText type="bodyCompact" numberOfLines={2} style={styles.title}>
          {conversation.title}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {isActive ? `${date}${HISTORY_COPY.currentSuffix}` : date}
        </ThemedText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={HISTORY_COPY.deleteOneA11y(conversation.title)}
        onPress={() => onDelete(conversation)}
        style={styles.deleteButton}>
        <SymbolView name={DELETE_SYMBOL} size={DELETE_ICON_SIZE} tintColor={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: CONVERSATION_ROW_MIN_HEIGHT,
  },
  divider: {
    borderTopWidth: BORDER_WIDTH,
  },
  activeRow: {
    borderRadius: CONVERSATION_ROW_RADIUS,
    paddingHorizontal: CONVERSATION_ROW_PADDING_HORIZONTAL,
    marginHorizontal: -CONVERSATION_ROW_PADDING_HORIZONTAL,
  },
  openArea: {
    flex: 1,
    paddingVertical: ROW_TEXT_PADDING_VERTICAL,
  },
  title: {
    fontWeight: 600,
  },
  deleteButton: {
    width: TOUCH_TARGET_SIZE,
    height: TOUCH_TARGET_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
