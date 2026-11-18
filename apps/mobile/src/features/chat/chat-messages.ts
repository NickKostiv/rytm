import type {
  AnswerSource,
  ApiMessage,
  AssistantMessage,
  ChatCitation,
  ChatMessage,
  ChatStreamEvent,
} from '@/features/chat/types';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const VERIFIED_VALIDITY = 'in_force';

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

function formatOrderDate(isoDate: string): string {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : isoDate;
}

function toAnswerSource(citation: ChatCitation): AnswerSource {
  return {
    id: citation.id,
    title: citation.title,
    orderNumber: citation.orderNumber,
    orderDate: formatOrderDate(citation.orderDate),
    page: String(citation.page),
    url: citation.url,
    isValidityVerified: citation.validity === VERIFIED_VALIDITY,
  };
}

export function applyStreamEvent(
  message: AssistantMessage,
  event: ChatStreamEvent,
): AssistantMessage {
  switch (event.type) {
    case 'delta':
      return { ...message, content: message.content + event.text, status: 'streaming' };
    case 'citations':
      return { ...message, sources: event.items.map(toAnswerSource) };
    case 'done':
      return { ...message, status: 'done' };
    case 'error':
      return { ...message, status: 'error', error: event.message };
  }
}
