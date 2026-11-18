import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Spacing } from '@/constants/theme';
import { COPY } from '@/features/chat/constants';
import { useChatGutter } from '@/features/chat/use-chat-gutter';
import { useChatSession } from '@/features/history/chat-session-provider';
import { StorageErrorBanner } from '@/features/history/components/storage-error-banner';
import { HISTORY_COPY } from '@/features/history/constants';

export function StorageBanners() {
  const {
    loadStatus,
    hasWriteError,
    unreadableCount,
    reloadHistory,
    retryWrite,
    deleteUnreadableConversations,
  } = useChatSession();
  const gutter = useChatGutter();
  const [isUnreadableDialogOpen, setIsUnreadableDialogOpen] = useState(false);

  const handleDeleteUnreadable = async () => {
    await deleteUnreadableConversations();
    setIsUnreadableDialogOpen(false);
  };

  return (
    <View style={[styles.container, { paddingHorizontal: gutter }]}>
      {loadStatus === 'failed' && (
        <StorageErrorBanner
          message={HISTORY_COPY.readFailedBanner}
          retryLabel={COPY.retry}
          onRetry={reloadHistory}
        />
      )}
      {unreadableCount > 0 && (
        <StorageErrorBanner
          message={HISTORY_COPY.unreadableBanner(unreadableCount)}
          retryLabel={HISTORY_COPY.deleteUnreadable}
          onRetry={() => setIsUnreadableDialogOpen(true)}
        />
      )}
      {hasWriteError && (
        <StorageErrorBanner
          message={HISTORY_COPY.writeFailedBanner}
          retryLabel={HISTORY_COPY.writeRetry}
          onRetry={retryWrite}
        />
      )}
      {isUnreadableDialogOpen && (
        <ConfirmDialog
          title={HISTORY_COPY.deleteUnreadableTitle}
          body={HISTORY_COPY.deleteUnreadableBody(unreadableCount)}
          confirmLabel={HISTORY_COPY.deleteOneConfirm}
          failureMessage={HISTORY_COPY.deleteFailed}
          horizontalInset={gutter}
          onConfirm={handleDeleteUnreadable}
          onCancel={() => setIsUnreadableDialogOpen(false)}
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
