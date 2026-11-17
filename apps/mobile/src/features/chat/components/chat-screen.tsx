import { FlatList, KeyboardAvoidingView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ChatComposer } from '@/features/chat/components/chat-composer';
import { ChatEmptyState } from '@/features/chat/components/chat-empty-state';
import { MessageBubble } from '@/features/chat/components/message-bubble';
import { useChat } from '@/features/chat/use-chat';

export function ChatScreen() {
  const { messages, isStreaming, sendMessage, retryMessage, stopStreaming } = useChat();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <KeyboardAvoidingView behavior="padding" style={styles.content}>
          {messages.length === 0 ? (
            <ChatEmptyState />
          ) : (
            <FlatList
              inverted
              data={[...messages].reverse()}
              keyExtractor={(message) => message.id}
              renderItem={({ item }) => <MessageBubble message={item} onRetry={retryMessage} />}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
            />
          )}
          <ChatComposer isStreaming={isStreaming} onSend={sendMessage} onStop={stopStreaming} />
        </KeyboardAvoidingView>
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
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
