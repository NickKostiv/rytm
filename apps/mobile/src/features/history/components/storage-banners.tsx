import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { COPY } from '@/features/chat/constants';
import { useChatGutter } from '@/features/chat/use-chat-gutter';
import { useChatSession } from '@/features/history/chat-session-provider';
import { StorageErrorBanner } from '@/features/history/components/storage-error-banner';
import { UnreadableHistoryBanner } from '@/features/history/components/unreadable-history-banner';
import { HISTORY_COPY } from '@/features/history/constants';

export function StorageBanners() {
  const {
    loadStatus,
    hasWriteError,
    reloadHistory,
    retryWrite,
  } = useChatSession();
  const gutter = useChatGutter();
  return (
    <View style={[styles.container, { paddingHorizontal: gutter }]}>
      {loadStatus === 'failed' && (
        <StorageErrorBanner
          message={HISTORY_COPY.readFailedBanner}
          retryLabel={COPY.retry}
          onRetry={reloadHistory}
        />
      )}
      <UnreadableHistoryBanner />
      {hasWriteError && (
        <StorageErrorBanner
          message={HISTORY_COPY.writeFailedBanner}
          retryLabel={HISTORY_COPY.writeRetry}
          onRetry={retryWrite}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
});
