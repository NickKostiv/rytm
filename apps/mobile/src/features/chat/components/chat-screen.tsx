import { router, Stack } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { ActivityIndicator, FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { AssistantMessage } from '@/features/chat/components/assistant-message';
import { ChatComposer } from '@/features/chat/components/chat-composer';
import { ChatEmptyState } from '@/features/chat/components/chat-empty-state';
import { HeaderIconButton } from '@/features/chat/components/header-icon-button';
import { UserMessage } from '@/features/chat/components/user-message';
import {
  COPY,
  HEADER_MAX_FONT_SCALE,
  HEADER_TITLE_MIN_WIDTH,
  HEADER_TITLE_RESERVED_WIDTH,
} from '@/features/chat/constants';
import type { ChatMessage } from '@/features/chat/types';
import { useChatGutter } from '@/features/chat/use-chat-gutter';
import { useChatSession } from '@/features/history/chat-session-provider';
import { StorageBanners } from '@/features/history/components/storage-banners';
import { HISTORY_COPY } from '@/features/history/constants';
import { useTheme } from '@/hooks/use-theme';

const HISTORY_SYMBOL: SymbolViewProps['name'] = {
  ios: 'clock.arrow.circlepath',
  android: 'history',
  web: 'history',
};
const NEW_CHAT_SYMBOL: SymbolViewProps['name'] = {
  ios: 'square.and.pencil',
  android: 'edit_square',
  web: 'edit_square',
};

function getMessageSpacing(message: ChatMessage, isFirstMessage: boolean): number {
  if (message.role === 'assistant') return Spacing.three;
  return isFirstMessage ? 0 : Spacing.five;
}

export function ChatScreen() {
  const {
    messages,
    isStreaming,
    loadStatus,
    sendMessage,
    retryMessage,
    stopStreaming,
    startNewConversation,
  } = useChatSession();
  const theme = useTheme();
  const gutter = useChatGutter();
  const { width, fontScale } = useWindowDimensions();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const keyboardOffsetStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(0, -keyboardHeight.value - bottomInset),
  }));
  const newestMessageId = messages.at(-1)?.id;
  const oldestMessageId = messages.at(0)?.id;
  const isHistoryPending = loadStatus === 'pending' || loadStatus === 'slow';
  const isTitleVisible = width - HEADER_TITLE_RESERVED_WIDTH >= HEADER_TITLE_MIN_WIDTH * fontScale;

  const renderFeed = () => {
    if (loadStatus === 'pending') return <View style={styles.feedPlaceholder} />;
    if (loadStatus === 'slow') {
      return (
        <View accessibilityLiveRegion="polite" style={[styles.feedPlaceholder, styles.loadingRow]}>
          <ActivityIndicator size="small" color={theme.textSecondary} accessibilityRole="progressbar" />
          <ThemedText themeColor="textSecondary" style={styles.loadingText}>
            {HISTORY_COPY.loading}
          </ThemedText>
        </View>
      );
    }
    if (messages.length === 0) return <ChatEmptyState onExamplePress={sendMessage} />;
    return (
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
    );
  };


  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerTitle: () =>
            isTitleVisible ? (
              <ThemedText maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE} style={styles.headerTitle}>
                {COPY.appTitle}
              </ThemedText>
            ) : null,
          headerLeft: () => (
            <HeaderIconButton
              symbol={HISTORY_SYMBOL}
              accessibilityLabel={COPY.historyA11y}
              onPress={() => router.push('/history')}
            />
          ),
          headerRight: () => (
            <HeaderIconButton
              symbol={NEW_CHAT_SYMBOL}
              accessibilityLabel={COPY.newChatA11y}
              isDisabled={messages.length === 0}
              onPress={startNewConversation}
            />
          ),
        }}
      />
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <Animated.View style={[styles.content, keyboardOffsetStyle]}>
          {renderFeed()}
          <StorageBanners />
          <ChatComposer
            isStreaming={isStreaming}
            isSendBlocked={isHistoryPending}
            onSend={sendMessage}
            onStop={stopStreaming}
          />
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
  feedPlaceholder: {
    flex: 1,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  loadingText: {
    fontSize: 15,
    lineHeight: 22,
  },
  headerTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: 600,
  },
});
