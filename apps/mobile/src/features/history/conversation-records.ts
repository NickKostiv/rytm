import { COPY } from '@/features/chat/constants';
import type { ChatMessage } from '@/features/chat/types';
import {
  CONVERSATION_TITLE_MAX_LENGTH,
  CONVERSATION_TTL_MS,
  MAX_STORED_CONVERSATIONS,
} from '@/features/history/constants';
import type { Conversation } from '@/features/history/types';

const WHITESPACE_RUN = /\s+/g;
const ELLIPSIS = '…';

let createdIdCount = 0;

export function createLocalId(): string {
  createdIdCount += 1;
  return `${Date.now().toString(36)}-${createdIdCount.toString(36)}`;
}

export function toConversationTitle(text: string): string {
  return text.trim().replace(WHITESPACE_RUN, ' ').slice(0, CONVERSATION_TITLE_MAX_LENGTH);
}

export function truncateTitle(title: string, maxLength: number): string {
  return title.length > maxLength ? `${title.slice(0, maxLength)}${ELLIPSIS}` : title;
}

export function sortNewestFirst(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((first, second) => second.updatedAt - first.updatedAt);
}

export function settleInterruptedAnswers(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => {
    if (message.role !== 'assistant' || message.status !== 'streaming') return message;
    return message.content
      ? { ...message, status: 'stopped' }
      : { ...message, status: 'error', error: COPY.interruptedStream };
  });
}

export function pruneConversations(
  conversations: Conversation[],
  { now, activeId }: { now: number; activeId: string | null },
): { kept: Conversation[]; removedIds: string[] } {
  const active = conversations.find((conversation) => conversation.id === activeId);
  const otherSlots = active ? MAX_STORED_CONVERSATIONS - 1 : MAX_STORED_CONVERSATIONS;
  const keptOthers = sortNewestFirst(conversations)
    .filter(({ id, updatedAt }) => id !== activeId && now - updatedAt <= CONVERSATION_TTL_MS)
    .slice(0, otherSlots);
  const kept = sortNewestFirst(active ? [active, ...keptOthers] : keptOthers);
  const keptIds = new Set(kept.map(({ id }) => id));
  const removedIds = conversations.map(({ id }) => id).filter((id) => !keptIds.has(id));
  return { kept, removedIds };
}
