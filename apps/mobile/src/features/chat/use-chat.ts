import { useEffect, useRef, useState } from 'react';

import {
  applyStreamEvent,
  dropFailedTrailingTurn,
  toApiMessages,
} from '@/features/chat/chat-messages';
import { COPY } from '@/features/chat/constants';
import { ChatRequestError, streamChat } from '@/features/chat/stream-chat';
import type { ApiMessage, AssistantMessage, ChatMessage } from '@/features/chat/types';

type AssistantUpdate = (message: AssistantMessage) => AssistantMessage;

export function useChat(): {
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (text: string) => void;
  retryMessage: (assistantId: string) => void;
  stopStreaming: () => void;
} {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const nextIdRef = useRef(0);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  const lastMessage = messages.at(-1);
  const isStreaming = lastMessage?.role === 'assistant' && lastMessage.status === 'streaming';

  const createId = () => String(nextIdRef.current++);

  const updateAssistant = (assistantId: string, update: AssistantUpdate) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId && message.role === 'assistant' ? update(message) : message,
      ),
    );
  };

  const failAssistant = (assistantId: string, error: string) => {
    updateAssistant(assistantId, (message) => ({ ...message, status: 'error', error }));
  };

  const runTurn = async (history: ApiMessage[], assistantId: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let hasFinished = false;

    try {
      for await (const event of streamChat(history, controller.signal)) {
        if (controller.signal.aborted) return;
        hasFinished = event.type === 'done' || event.type === 'error';
        updateAssistant(assistantId, (message) => applyStreamEvent(message, event));
      }
      if (!controller.signal.aborted && !hasFinished) {
        failAssistant(assistantId, COPY.interruptedStream);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      failAssistant(
        assistantId,
        error instanceof ChatRequestError ? error.message : COPY.networkError,
      );
    }
  };

  const sendMessage = (text: string) => {
    if (isStreaming) return;
    const history = dropFailedTrailingTurn(messages);
    const userMessage: ChatMessage = { id: createId(), role: 'user', content: text };
    const assistantMessage: ChatMessage = {
      id: createId(),
      role: 'assistant',
      content: '',
      flag: null,
      sources: [],
      status: 'streaming',
    };
    setMessages([...history, userMessage, assistantMessage]);
    void runTurn(toApiMessages([...history, userMessage]), assistantMessage.id);
  };

  const retryMessage = (assistantId: string) => {
    const index = messages.findIndex((message) => message.id === assistantId);
    if (index === -1 || isStreaming) return;
    updateAssistant(assistantId, (message) => ({
      ...message,
      content: '',
      flag: null,
      sources: [],
      status: 'streaming',
    }));
    void runTurn(toApiMessages(messages.slice(0, index)), assistantId);
  };

  const stopStreaming = () => {
    abortControllerRef.current?.abort();
    if (!lastMessage || lastMessage.role !== 'assistant') return;
    updateAssistant(lastMessage.id, (message) => {
      if (message.status !== 'streaming') return message;
      return message.content
        ? { ...message, status: 'stopped' }
        : { ...message, status: 'error', error: COPY.stoppedEmpty };
    });
  };

  return { messages, isStreaming, sendMessage, retryMessage, stopStreaming };
}
