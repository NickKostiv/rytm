import { useEffect, useRef, useState } from 'react';

import { STREAM_SAVE_INTERVAL_MS } from '@/features/history/constants';
import {
  clearAllConversations,
  removeConversations,
  replaceAllConversations,
  saveConversation,
} from '@/features/history/conversation-storage';
import type { Conversation } from '@/features/history/types';

type SaveTimer = { conversationId: string; timeout: ReturnType<typeof setTimeout> };

export type ConversationPersistence = {
  hasWriteError: boolean;
  unreadableCount: number;
  enable: (unreadableIds: string[]) => void;
  saveNow: (conversationId: string) => void;
  saveSoon: (conversationId: string) => void;
  discard: (removedIds: string[]) => void;
  syncAll: () => void;
  deleteOne: (conversationId: string) => Promise<void>;
  deleteAll: () => Promise<void>;
  deleteUnreadable: () => Promise<void>;
};

export function useConversationPersistence(
  getConversations: () => Conversation[],
): ConversationPersistence {
  const [hasWriteError, setHasWriteError] = useState(false);
  const [unreadableCount, setUnreadableCount] = useState(0);
  const isMountedRef = useRef(false);
  const isEnabledRef = useRef(false);
  const unreadableIdsRef = useRef<string[]>([]);
  const pendingRemovalIdsRef = useRef(new Set<string>());
  const needsFullSyncRef = useRef(false);
  const failureCountRef = useRef(0);
  const saveTimerRef = useRef<SaveTimer | null>(null);

  const clearSaveTimer = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current.timeout);
    saveTimerRef.current = null;
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current.timeout);
    };
  }, []);

  const toIndexIds = (conversations: Conversation[]) => [
    ...conversations.map(({ id }) => id),
    ...unreadableIdsRef.current,
  ];

  const recordFailure = () => {
    failureCountRef.current += 1;
    needsFullSyncRef.current = true;
    if (isMountedRef.current) setHasWriteError(true);
  };

  const writeEverything = async () => {
    const failureCountAtStart = failureCountRef.current;
    const conversations = getConversations().filter(
      ({ id }) => !pendingRemovalIdsRef.current.has(id),
    );
    const removedIds = [...pendingRemovalIdsRef.current];
    try {
      await replaceAllConversations(conversations, {
        indexIds: toIndexIds(conversations),
        removedIds,
      });
      removedIds.forEach((id) => pendingRemovalIdsRef.current.delete(id));
      if (failureCountRef.current !== failureCountAtStart) return;
      needsFullSyncRef.current = false;
      if (isMountedRef.current) setHasWriteError(false);
    } catch {
      recordFailure();
    }
  };

  const write = async (task: () => Promise<void>) => {
    if (needsFullSyncRef.current) {
      await writeEverything();
      return;
    }
    try {
      await task();
    } catch {
      recordFailure();
    }
  };

  const enable = (unreadableIds: string[]) => {
    isEnabledRef.current = true;
    unreadableIdsRef.current = unreadableIds;
    setUnreadableCount(unreadableIds.length);
  };

  const saveNow = (conversationId: string) => {
    if (saveTimerRef.current?.conversationId === conversationId) clearSaveTimer();
    if (!isEnabledRef.current) return;
    const conversations = getConversations();
    const conversation = conversations.find(({ id }) => id === conversationId);
    if (!conversation) return;
    void write(() => saveConversation(conversation, toIndexIds(conversations)));
  };

  const saveSoon = (conversationId: string) => {
    if (saveTimerRef.current) return;
    const timeout = setTimeout(() => {
      saveTimerRef.current = null;
      saveNow(conversationId);
    }, STREAM_SAVE_INTERVAL_MS);
    saveTimerRef.current = { conversationId, timeout };
  };

  const discard = (removedIds: string[]) => {
    if (!isEnabledRef.current || removedIds.length === 0) return;
    removedIds.forEach((id) => pendingRemovalIdsRef.current.add(id));
    void write(async () => {
      await removeConversations(removedIds, toIndexIds(getConversations()));
      removedIds.forEach((id) => pendingRemovalIdsRef.current.delete(id));
    });
  };

  const syncAll = () => {
    if (!isEnabledRef.current) return;
    needsFullSyncRef.current = true;
    void writeEverything();
  };

  const deleteOne = async (conversationId: string) => {
    pendingRemovalIdsRef.current.add(conversationId);
    const remaining = getConversations().filter(({ id }) => id !== conversationId);
    try {
      await removeConversations([conversationId], toIndexIds(remaining));
    } finally {
      pendingRemovalIdsRef.current.delete(conversationId);
    }
  };

  const deleteUnreadable = async () => {
    const unreadableIds = unreadableIdsRef.current;
    const conversations = getConversations();
    await removeConversations(unreadableIds, conversations.map(({ id }) => id));
    unreadableIdsRef.current = unreadableIdsRef.current.filter((id) => !unreadableIds.includes(id));
    if (isMountedRef.current) setUnreadableCount(unreadableIdsRef.current.length);
  };

  const deleteAll = async () => {
    clearSaveTimer();
    await clearAllConversations();
    unreadableIdsRef.current = [];
    pendingRemovalIdsRef.current.clear();
    needsFullSyncRef.current = false;
    failureCountRef.current += 1;
    if (!isMountedRef.current) return;
    setUnreadableCount(0);
    setHasWriteError(false);
  };

  return {
    hasWriteError,
    unreadableCount,
    enable,
    saveNow,
    saveSoon,
    discard,
    syncAll,
    deleteOne,
    deleteAll,
    deleteUnreadable,
  };
}
