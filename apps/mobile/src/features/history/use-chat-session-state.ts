import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { applyStreamEvent, toContextMessages, toStoppedAnswer } from '@/features/chat/chat-messages';
import { streamAnswer } from '@/features/chat/stream-answer';
import type { ApiMessage, AssistantMessage, ChatMessage } from '@/features/chat/types';
import { type DoseCards, useDoseCards } from '@/features/chat/use-dose-cards';
import { CONVERSATION_TTL_MS, SLOW_LOAD_DELAY_MS } from '@/features/history/constants';
import {
  createLocalId,
  pruneConversations,
  settleInterruptedAnswers,
  sortNewestFirst,
  toConversationTitle,
  withoutDoseParameters,
} from '@/features/history/conversation-records';
import { loadConversations, type StoredHistory } from '@/features/history/conversation-storage';
import type { Conversation, HistoryLoadStatus } from '@/features/history/types';
import { useConversationPersistence } from '@/features/history/use-conversation-persistence';

type SessionData = {
  conversations: Conversation[];
  activeId: string;
  loadStatus: HistoryLoadStatus;
};

export type ChatSession = DoseCards & {
  conversations: Conversation[];
  activeId: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  loadStatus: HistoryLoadStatus;
  hasWriteError: boolean;
  unreadableCount: number;
  sendMessage: (text: string) => void;
  retryMessage: (assistantId: string) => void;
  stopStreaming: () => void;
  startNewConversation: () => void;
  openConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => Promise<void>;
  deleteAllConversations: () => Promise<void>;
  deleteUnreadableConversations: () => Promise<void>;
  pruneHistory: () => void;
  reloadHistory: () => void;
  retryWrite: () => void;
};

function createEmptySession(): SessionData {
  return { conversations: [], activeId: createLocalId(), loadStatus: 'pending' };
}

function getActiveConversation({ conversations, activeId }: SessionData): Conversation | undefined {
  return conversations.find(({ id }) => id === activeId);
}

function isAnswerStreaming(messages: ChatMessage[]): boolean {
  const lastMessage = messages.at(-1);
  return lastMessage?.role === 'assistant' && lastMessage.status === 'streaming';
}

export function useChatSessionState(): ChatSession {
  const [session, setSession] = useState(createEmptySession);
  const sessionRef = useRef(session);
  const isMountedRef = useRef(false);
  const loadRequestRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const persistence = useConversationPersistence(() => sessionRef.current.conversations);
  const doseCards = useDoseCards();

  const messages = getActiveConversation(session)?.messages ?? [];
  const isStreaming = isAnswerStreaming(messages);
  const isSendBlocked = session.loadStatus === 'pending' || session.loadStatus === 'slow';

  const commitSession = (next: SessionData) => {
    sessionRef.current = next;
    if (isMountedRef.current) setSession(next);
  };

  const updateAssistant = (
    conversationId: string,
    assistantId: string,
    update: (message: AssistantMessage) => AssistantMessage,
  ) => {
    const current = sessionRef.current;
    if (!current.conversations.some(({ id }) => id === conversationId)) return;
    commitSession({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              updatedAt: Date.now(),
              messages: conversation.messages.map((message) =>
                message.id === assistantId && message.role === 'assistant' ? update(message) : message,
              ),
            }
          : conversation,
      ),
    });
  };

  const runTurn = (conversationId: string, history: ApiMessage[], assistantId: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    void streamAnswer(history, controller.signal, {
      onEvent: (event) => {
        updateAssistant(conversationId, assistantId, (message) => applyStreamEvent(message, event));
        if (event.type === 'delta') {
          persistence.saveSoon(conversationId);
        } else {
          persistence.saveNow(conversationId);
        }
      },
      onFailure: (error) => {
        updateAssistant(conversationId, assistantId, (message) => ({ ...message, status: 'error', error }));
        persistence.saveNow(conversationId);
      },
    });
  };

  const pruneHistory = () => {
    const current = sessionRef.current;
    if (current.loadStatus !== 'ready') return;
    const { kept, removedIds } = pruneConversations(current.conversations, {
      now: Date.now(),
      activeId: current.activeId,
    });
    if (removedIds.length === 0) return;
    commitSession({ ...current, conversations: kept });
    persistence.discard(removedIds);
  };

  const applyStoredHistory = ({ conversations, unreadableIds }: StoredHistory) => {
    const current = sessionRef.current;
    const unsaved = current.conversations;
    const restored = conversations
      .filter(({ id }) => !unsaved.some((conversation) => conversation.id === id))
      .map((conversation) => ({
        ...conversation,
        messages: settleInterruptedAnswers(conversation.messages),
      }));
    const hasActiveMessages = unsaved.some(({ id }) => id === current.activeId);
    const { kept, removedIds } = pruneConversations([...restored, ...unsaved], {
      now: Date.now(),
      activeId: hasActiveMessages ? current.activeId : null,
    });
    const activeId = hasActiveMessages ? current.activeId : (kept[0]?.id ?? current.activeId);
    commitSession({ conversations: kept, activeId, loadStatus: 'ready' });
    persistence.enable(unreadableIds);
    if (unsaved.length > 0) persistence.syncAll();
    persistence.discard(removedIds);
  };

  const loadHistory = async () => {
    loadRequestRef.current += 1;
    const requestId = loadRequestRef.current;
    const isCurrentRequest = () => isMountedRef.current && requestId === loadRequestRef.current;
    const slowTimeout = setTimeout(() => {
      if (isCurrentRequest()) commitSession({ ...sessionRef.current, loadStatus: 'slow' });
    }, SLOW_LOAD_DELAY_MS);
    try {
      const storedHistory = await loadConversations();
      if (isCurrentRequest()) applyStoredHistory(storedHistory);
    } catch {
      if (isCurrentRequest()) commitSession({ ...sessionRef.current, loadStatus: 'failed' });
    } finally {
      clearTimeout(slowTimeout);
    }
  };

  const stopStreaming = () => {
    abortControllerRef.current?.abort();
    const current = sessionRef.current;
    const lastMessage = getActiveConversation(current)?.messages.at(-1);
    if (lastMessage?.role !== 'assistant' || lastMessage.status !== 'streaming') return;
    updateAssistant(current.activeId, lastMessage.id, toStoppedAnswer);
    persistence.saveNow(current.activeId);
  };

  const leaveActiveConversation = (nextActiveId: string) => {
    doseCards.discardDoseCards();
    const current = sessionRef.current;
    commitSession({
      ...current,
      activeId: nextActiveId,
      conversations: current.conversations.map((conversation) =>
        conversation.id === current.activeId ? withoutDoseParameters(conversation) : conversation,
      ),
    });
  };

  const startNewConversation = () => {
    stopStreaming();
    leaveActiveConversation(createLocalId());
    pruneHistory();
  };

  const handleMount = useEffectEvent(() => {
    void loadHistory();
  });

  const handleUnmount = useEffectEvent(() => {
    abortControllerRef.current?.abort();
  });

  const handleAppStateChange = useEffectEvent((state: string) => {
    const active = getActiveConversation(sessionRef.current);
    if (state !== 'active' || !active) return;
    if (Date.now() - active.updatedAt > CONVERSATION_TTL_MS) startNewConversation();
  });

  useEffect(() => {
    isMountedRef.current = true;
    handleMount();
    const subscription = AppState.addEventListener('change', (state) =>
      handleAppStateChange(state),
    );
    return () => {
      isMountedRef.current = false;
      subscription.remove();
      handleUnmount();
    };
  }, []);

  const sendMessage = (text: string) => {
    const current = sessionRef.current;
    const existing = getActiveConversation(current);
    const previousMessages = existing?.messages ?? [];
    if (isSendBlocked || isAnswerStreaming(previousMessages)) return;
    const now = Date.now();
    const userMessage: ChatMessage = { id: createLocalId(), role: 'user', content: text };
    const assistantMessage: ChatMessage = {
      id: createLocalId(),
      role: 'assistant',
      content: '',
      sources: [],
      webSources: [],
      status: 'streaming',
    };
    const conversation: Conversation = existing
      ? { ...existing, updatedAt: now, messages: [...previousMessages, userMessage, assistantMessage] }
      : {
          id: current.activeId,
          title: toConversationTitle(text),
          createdAt: now,
          updatedAt: now,
          messages: [userMessage, assistantMessage],
        };
    commitSession({
      ...current,
      conversations: sortNewestFirst([
        conversation,
        ...current.conversations.filter(({ id }) => id !== conversation.id),
      ]),
    });
    persistence.saveNow(conversation.id);
    runTurn(conversation.id, toContextMessages([...previousMessages, userMessage]), assistantMessage.id);
  };

  const retryMessage = (assistantId: string) => {
    const { activeId } = sessionRef.current;
    const activeMessages = getActiveConversation(sessionRef.current)?.messages ?? [];
    const index = activeMessages.findIndex(({ id }) => id === assistantId);
    if (index === -1 || isAnswerStreaming(activeMessages)) return;
    doseCards.discardDoseCard(assistantId);
    updateAssistant(activeId, assistantId, (message) => ({
      ...message,
      content: '',
      sources: [],
      webSources: [],
      progressStage: undefined,
      doseParameters: undefined,
      status: 'streaming',
    }));
    persistence.saveNow(activeId);
    runTurn(activeId, toContextMessages(activeMessages.slice(0, index)), assistantId);
  };

  const openConversation = (conversationId: string) => {
    if (conversationId === sessionRef.current.activeId) return;
    stopStreaming();
    leaveActiveConversation(conversationId);
  };

  const deleteConversation = async (conversationId: string) => {
    if (conversationId === sessionRef.current.activeId) {
      stopStreaming();
      doseCards.discardDoseCards();
    }
    await persistence.deleteOne(conversationId);
    const current = sessionRef.current;
    commitSession({
      ...current,
      conversations: current.conversations.filter(({ id }) => id !== conversationId),
      activeId: current.activeId === conversationId ? createLocalId() : current.activeId,
    });
  };

  const deleteAllConversations = async () => {
    stopStreaming();
    doseCards.discardDoseCards();
    await persistence.deleteAll();
    commitSession({ ...sessionRef.current, conversations: [], activeId: createLocalId() });
  };

  const reloadHistory = () => {
    if (isSendBlocked) return;
    commitSession({ ...sessionRef.current, loadStatus: 'pending' });
    void loadHistory();
  };

  return {
    ...doseCards,
    conversations: session.conversations,
    activeId: session.activeId,
    messages,
    isStreaming,
    loadStatus: session.loadStatus,
    hasWriteError: persistence.hasWriteError,
    unreadableCount: persistence.unreadableCount,
    sendMessage,
    retryMessage,
    stopStreaming,
    startNewConversation,
    openConversation,
    deleteConversation,
    deleteAllConversations,
    deleteUnreadableConversations: persistence.deleteUnreadable,
    pruneHistory,
    reloadHistory,
    retryWrite: persistence.syncAll,
  };
}
