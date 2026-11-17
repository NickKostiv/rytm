import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  COPY,
  ERROR_TEXT_COLOR,
  MESSAGE_MAX_WIDTH_RATIO,
  USER_BUBBLE_COLOR,
  USER_BUBBLE_TEXT_COLOR,
} from '@/features/chat/constants';
import type { ChatMessage } from '@/features/chat/types';

type MessageBubbleProps = {
  message: ChatMessage;
  onRetry: (assistantId: string) => void;
};

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <ThemedView style={[styles.bubble, styles.userBubble]}>
        <ThemedText style={{ color: USER_BUBBLE_TEXT_COLOR }}>{message.content}</ThemedText>
      </ThemedView>
    );
  }

  const isWaitingForFirstDelta = message.status === 'streaming' && !message.content;

  return (
    <ThemedView type="backgroundElement" style={[styles.bubble, styles.assistantBubble]}>
      {isWaitingForFirstDelta && <ActivityIndicator />}
      {message.content !== '' && <ThemedText selectable>{message.content}</ThemedText>}
      {message.status === 'error' && (
        <>
          <ThemedText type="small" style={{ color: ERROR_TEXT_COLOR }}>
            {message.error}
          </ThemedText>
          <Pressable accessibilityRole="button" onPress={() => onRetry(message.id)}>
            <ThemedText type="linkPrimary">{COPY.retry}</ThemedText>
          </Pressable>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: MESSAGE_MAX_WIDTH_RATIO,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: USER_BUBBLE_COLOR,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
  },
});
