import { FlatList, StyleSheet, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { AssistantMessage } from '@/features/chat/components/assistant-message';
import { ChatComposer } from '@/features/chat/components/chat-composer';
import { ChatEmptyState } from '@/features/chat/components/chat-empty-state';
import { UserMessage } from '@/features/chat/components/user-message';
import type { ChatMessage } from '@/features/chat/types';
import { useChat } from '@/features/chat/use-chat';
import { useChatGutter } from '@/features/chat/use-chat-gutter';

function getMessageSpacing(message: ChatMessage, isFirstMessage: boolean): number {
  if (message.role === 'assistant') return Spacing.three;
  return isFirstMessage ? 0 : Spacing.five;
}

export function ChatScreen() {
  const { messages, isStreaming, sendMessage, retryMessage, stopStreaming } = useChat();
  const gutter = useChatGutter();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const keyboardOffsetStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(0, -keyboardHeight.value - bottomInset),
  }));
  const newestMessageId = messages.at(-1)?.id;
  const oldestMessageId = messages.at(0)?.id;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <Animated.View style={[styles.content, keyboardOffsetStyle]}>
          {messages.length === 0 ? (
            <ChatEmptyState onExamplePress={sendMessage} />
          ) : (
            <FlatList
              inverted
              data={[...messages].reverse()}
              keyExtractor={(message) => message.id}
              renderItem={({ item }) => (
                <View style={{ marginTop: getMessageSpacing(item, item.id === oldestMessageId) }}>
                  {item.role === 'user' ? (
                    <UserMessage content={item.content} />
                  ) : (
                    <AssistantMessage
                      message={item}
                      canRetry={!isStreaming && item.id === newestMessageId}
                      onRetry={retryMessage}
                    />
                  )}
                </View>
              )}
              contentContainerStyle={[styles.list, { paddingHorizontal: gutter }]}
              keyboardShouldPersistTaps="handled"
            />
          )}
          <ChatComposer isStreaming={isStreaming} onSend={sendMessage} onStop={stopStreaming} />
        </Animated.View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  content: {
    flex: 1,
  },
  list: {
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },
});
