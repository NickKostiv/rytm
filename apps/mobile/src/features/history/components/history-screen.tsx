import { router, Stack, useCanGoBack } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useEffect, useEffectEvent, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { HeaderIconButton } from '@/features/chat/components/header-icon-button';
import { RetryButton } from '@/features/chat/components/retry-button';
import {
  BORDER_WIDTH,
  COPY,
  HEADER_MAX_FONT_SCALE,
  PILL_RADIUS,
  TOUCH_TARGET_SIZE,
} from '@/features/chat/constants';
import { useChatGutter } from '@/features/chat/use-chat-gutter';
import { useChatSession } from '@/features/history/chat-session-provider';
import { ConversationRow } from '@/features/history/components/conversation-row';
import { UnreadableHistoryBanner } from '@/features/history/components/unreadable-history-banner';
import { DIALOG_TITLE_MAX_LENGTH, HISTORY_COPY } from '@/features/history/constants';
import { sortNewestFirst, truncateTitle } from '@/features/history/conversation-records';
import { formatConversationDate } from '@/features/history/format-conversation-date';
import type { Conversation } from '@/features/history/types';
import { useTheme } from '@/hooks/use-theme';

const BACK_SYMBOL: SymbolViewProps['name'] = {
  ios: 'chevron.backward',
  android: 'arrow_back',
  web: 'arrow_back',
};
const CHAT_LINK_PADDING_HORIZONTAL = 12;

type PendingDeletion = { scope: 'one'; conversation: Conversation } | { scope: 'all' };

function returnToChat() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

export function HistoryScreen() {
  const {
    conversations,
    activeId,
    loadStatus,
    openConversation,
    startNewConversation,
    deleteConversation,
    deleteAllConversations,
    pruneHistory,
    reloadHistory,
    unreadableCount,
  } = useChatSession();
  const theme = useTheme();
  const gutter = useChatGutter();
  const canGoBack = useCanGoBack();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const [now] = useState(Date.now);
  const sortedConversations = sortNewestFirst(conversations);

  const handleOpen = useEffectEvent(() => {
    pruneHistory();
  });

  useEffect(() => {
    handleOpen();
  }, []);

  const handleOpenConversation = (conversationId: string) => {
    openConversation(conversationId);
    returnToChat();
  };

  const handleNewChat = () => {
    startNewConversation();
    returnToChat();
  };

  const handleConfirmDeletion = async () => {
    if (pendingDeletion?.scope === 'one') {
      await deleteConversation(pendingDeletion.conversation.id);
    } else {
      await deleteAllConversations();
    }
    setPendingDeletion(null);
  };

  const renderBody = () => {
    if (loadStatus === 'pending') return null;
    if (loadStatus === 'slow') {
      return (
        <View accessibilityLiveRegion="polite" style={styles.centered}>
          <ActivityIndicator size="small" color={theme.textSecondary} accessibilityRole="progressbar" />
          <ThemedText themeColor="textSecondary" style={styles.statusText}>
            {HISTORY_COPY.loading}
          </ThemedText>
        </View>
      );
    }
    if (loadStatus === 'failed') {
      return (
        <View style={[styles.stateBlock, { paddingHorizontal: gutter }]}>
          <View accessibilityLiveRegion="polite" style={styles.errorRow}>
            <ThemedText themeColor="danger" style={[styles.statusText, styles.errorText]}>
              !
            </ThemedText>
            <ThemedText themeColor="danger" style={[styles.statusText, styles.errorText, styles.errorTitle]}>
              {HISTORY_COPY.loadFailedTitle}
            </ThemedText>
          </View>
          <ThemedText themeColor="textSecondary">{HISTORY_COPY.historyUnavailable}</ThemedText>
          <RetryButton label={COPY.retry} accessibilityLabel={COPY.retry} onPress={reloadHistory} />
        </View>
      );
    }
    if (sortedConversations.length === 0) {
      return (
        <View style={[styles.stateBlock, { paddingHorizontal: gutter }]}>
          <ThemedText type="emptyTitle" accessibilityRole="header">
            {HISTORY_COPY.emptyTitle}
          </ThemedText>
          <ThemedText themeColor="textSecondary">{HISTORY_COPY.emptyBody}</ThemedText>
          <RetryButton
            label={HISTORY_COPY.newChat}
            accessibilityLabel={HISTORY_COPY.newChat}
            onPress={handleNewChat}
          />
        </View>
      );
    }
    return (
      <FlatList
        data={sortedConversations}
        keyExtractor={(conversation) => conversation.id}
        ListHeaderComponent={
          <ThemedText type="footnote" themeColor="textSecondary" style={styles.note}>
            {HISTORY_COPY.note}
          </ThemedText>
        }
        renderItem={({ item, index }) => (
          <ConversationRow
            conversation={item}
            date={formatConversationDate(item.updatedAt, now)}
            isActive={item.id === activeId}
            isFirst={index === 0}
            onOpen={handleOpenConversation}
            onDelete={(conversation) => setPendingDeletion({ scope: 'one', conversation })}
          />
        )}
        ListFooterComponent={
          <Pressable
            accessibilityRole="button"
            onPress={() => setPendingDeletion({ scope: 'all' })}
            style={[styles.deleteAllButton, { borderColor: theme.borderStrong }]}>
            <ThemedText themeColor="danger" style={styles.deleteAllLabel}>
              {HISTORY_COPY.deleteAll}
            </ThemedText>
          </Pressable>
        }
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingBottom: Spacing.four + bottomInset,
        }}
      />
    );
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: HISTORY_COPY.screenTitle,
          headerLeft: () =>
            canGoBack ? (
              <HeaderIconButton
                symbol={BACK_SYMBOL}
                accessibilityLabel={HISTORY_COPY.backToChatA11y}
                onPress={() => router.back()}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/')}
                style={[styles.chatLink, { marginLeft: gutter - CHAT_LINK_PADDING_HORIZONTAL }]}>
                <ThemedText
                  themeColor="accent"
                  maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE}
                  style={styles.chatLinkLabel}>
                  {HISTORY_COPY.backToChat}
                </ThemedText>
              </Pressable>
            ),
        }}
      />
      <View style={styles.content}>
        {unreadableCount > 0 && (
          <View style={[styles.banner, { paddingHorizontal: gutter }]}>
            <UnreadableHistoryBanner />
          </View>
        )}
        {renderBody()}
      </View>
      {pendingDeletion && (
        <ConfirmDialog
          title={
            pendingDeletion.scope === 'one'
              ? HISTORY_COPY.deleteOneTitle
              : HISTORY_COPY.deleteAllTitle
          }
          body={
            pendingDeletion.scope === 'one'
              ? HISTORY_COPY.deleteOneBody(
                  truncateTitle(pendingDeletion.conversation.title, DIALOG_TITLE_MAX_LENGTH),
                )
              : HISTORY_COPY.deleteAllBody(sortedConversations.length)
          }
          confirmLabel={
            pendingDeletion.scope === 'one'
              ? HISTORY_COPY.deleteOneConfirm
              : HISTORY_COPY.deleteAllConfirm
          }
          failureMessage={HISTORY_COPY.deleteFailed}
          horizontalInset={gutter}
          onConfirm={handleConfirmDeletion}
          onCancel={() => setPendingDeletion(null)}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  centered: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  stateBlock: {
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  errorRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statusText: {
    fontSize: 15,
    lineHeight: 22,
  },
  errorText: {
    fontWeight: 600,
  },
  errorTitle: {
    flex: 1,
  },
  note: {
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  deleteAllButton: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET_SIZE,
    marginTop: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderRadius: PILL_RADIUS,
    borderWidth: BORDER_WIDTH,
  },
  deleteAllLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 600,
  },
  chatLink: {
    minHeight: TOUCH_TARGET_SIZE,
    minWidth: TOUCH_TARGET_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: CHAT_LINK_PADDING_HORIZONTAL,
    marginRight: Spacing.two,
  },
  banner: {
    paddingTop: Spacing.three,
  },
  chatLinkLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 600,
  },
});
