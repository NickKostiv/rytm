import type {
  ApiMessage,
  AssistantMessage,
  ChatMessage,
  ChatStreamEvent,
} from '@/features/chat/types';

export function toApiMessages(messages: ChatMessage[]): ApiMessage[] {
  return messages.map(({ role, content }) => ({ role, content }));
}

export function dropFailedTrailingTurn(messages: ChatMessage[]): ChatMessage[] {
  const lastMessage = messages.at(-1);
  if (lastMessage?.role === 'assistant' && lastMessage.status === 'error') {
    return messages.slice(0, -2);
  }
  return messages;
}

export function applyStreamEvent(
  message: AssistantMessage,
  event: ChatStreamEvent,
): AssistantMessage {
  switch (event.type) {
    case 'delta':
      return { ...message, content: message.content + event.text, status: 'streaming' };
    case 'done':
      return { ...message, status: 'done' };
    case 'error':
      return { ...message, status: 'error', error: event.message };
  }
}
