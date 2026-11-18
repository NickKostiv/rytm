import { COPY } from '@/features/chat/constants';
import type { AnswerSource, ChatMessage } from '@/features/chat/types';
import type { Conversation } from '@/features/history/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseList<T>(value: unknown, parseItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const items: T[] = [];
  for (const item of value) {
    const parsed = parseItem(item);
    if (parsed === null) return null;
    items.push(parsed);
  }
  return items;
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseSource(value: unknown): AnswerSource | null {
  if (!isRecord(value)) return null;
  const { id, title, orderNumber, orderDate, page, url, isValidityVerified } = value;
  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof orderNumber !== 'string' ||
    typeof orderDate !== 'string' ||
    typeof url !== 'string' ||
    typeof isValidityVerified !== 'boolean'
  ) {
    return null;
  }
  if (page !== undefined && typeof page !== 'string') return null;
  return { id, title, orderNumber, orderDate, page, url, isValidityVerified };
}

function parseMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;
  const { id, role, content, status, error } = value;
  if (typeof id !== 'string' || typeof content !== 'string') return null;
  if (role === 'user') return { id, role, content };
  if (role !== 'assistant') return null;
  const sources = parseList(value.sources, parseSource);
  if (sources === null) return null;
  if (status === 'error' && error === COPY.stoppedEmpty) {
    return { id, role, content, sources, status: 'stopped' };
  }
  if (status === 'error') {
    return typeof error === 'string' ? { id, role, content, sources, status, error } : null;
  }
  if (status === 'streaming' || status === 'done' || status === 'stopped') {
    return { id, role, content, sources, status };
  }
  return null;
}

export function parseStoredConversation(value: unknown): Conversation | null {
  if (!isRecord(value)) return null;
  const { id, title, createdAt, updatedAt } = value;
  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof createdAt !== 'number' ||
    typeof updatedAt !== 'number'
  ) {
    return null;
  }
  const messages = parseList(value.messages, parseMessage);
  if (messages === null || messages.length === 0) return null;
  return { id, title, createdAt, updatedAt, messages };
}
