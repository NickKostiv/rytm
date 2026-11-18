import { useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useChatGutter } from '@/features/chat/use-chat-gutter';
import { useChatSession } from '@/features/history/chat-session-provider';
import { StorageErrorBanner } from '@/features/history/components/storage-error-banner';
import { HISTORY_COPY } from '@/features/history/constants';

export function UnreadableHistoryBanner() {
  const { unreadableCount, deleteUnreadableConversations } = useChatSession();
  const gutter = useChatGutter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (unreadableCount === 0) return null;

  const handleDelete = async () => {
    await deleteUnreadableConversations();
    setIsDialogOpen(false);
  };

  return (
    <>
      <StorageErrorBanner
        message={HISTORY_COPY.unreadableBanner(unreadableCount)}
        retryLabel={HISTORY_COPY.deleteUnreadable}
        onRetry={() => setIsDialogOpen(true)}
      />
      {isDialogOpen && (
        <ConfirmDialog
          title={HISTORY_COPY.deleteUnreadableTitle}
          body={HISTORY_COPY.deleteUnreadableBody(unreadableCount)}
          confirmLabel={HISTORY_COPY.deleteOneConfirm}
          failureMessage={HISTORY_COPY.deleteFailed}
          horizontalInset={gutter}
          onConfirm={handleDelete}
          onCancel={() => setIsDialogOpen(false)}
        />
      )}
    </>
  );
}
