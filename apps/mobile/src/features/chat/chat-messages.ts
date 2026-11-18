import type {
  AnswerSource,
  ApiMessage,
  AssistantMessage,
  ChatCitation,
  ChatMessage,
  ChatStreamEvent,
} from '@/features/chat/types';
import { formatOrderDate } from '@/features/sources/format-order-date';

const VERIFIED_VALIDITY = 'in_force';

function isFailedAnswer(message: ChatMessage | undefined): boolean {
  if (message?.role !== 'assistant') return false;
  return message.status === 'error' || (message.status === 'stopped' && message.content === '');
}

export function toContextMessages(messages: ChatMessage[]): ApiMessage[] {
  return messages
    .filter(
      (message, index) =>
        !isFailedAnswer(message) &&
        !(message.role === 'user' && isFailedAnswer(messages[index + 1])),
    )
    .map(({ role, content }) => ({ role, content }));
}

export function toStoppedAnswer(message: AssistantMessage): AssistantMessage {
  return message.status === 'streaming' ? { ...message, status: 'stopped' } : message;
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
    case 'web_sources':
      return { ...message, webSources: event.items };
    case 'progress':
      return { ...message, progressStage: event.stage };
    case 'dose_parameters':
      return { ...message, doseParameters: event.parameters };
    case 'done':
      return { ...message, status: 'done' };
    case 'error':
      return { ...message, status: 'error', error: event.message };
  }
}
