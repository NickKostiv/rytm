import AsyncStorage from '@react-native-async-storage/async-storage';

import { CONVERSATION_KEY_PREFIX, HISTORY_INDEX_KEY } from '@/features/history/constants';
import {
  parseJson,
  parseList,
  parseStoredConversation,
} from '@/features/history/parse-stored-conversation';
import type { Conversation } from '@/features/history/types';

export type StoredHistory = {
  conversations: Conversation[];
  unreadableIds: string[];
};

function toConversationKey(conversationId: string): string {
  return `${CONVERSATION_KEY_PREFIX}${conversationId}`;
}

function toIndexEntry(conversationIds: string[]): [string, string] {
  return [HISTORY_INDEX_KEY, JSON.stringify(conversationIds)];
}

function toConversationEntry(conversation: Conversation): [string, string] {
  return [toConversationKey(conversation.id), JSON.stringify(conversation)];
}

function parseConversationId(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

async function readStoredConversationKeys(): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys();
  return keys.filter((key) => key.startsWith(CONVERSATION_KEY_PREFIX));
}

async function readConversationIds(): Promise<string[]> {
  const [indexJson, keys] = await Promise.all([
    AsyncStorage.getItem(HISTORY_INDEX_KEY),
    readStoredConversationKeys(),
  ]);
  const indexedIds = indexJson === null ? [] : (parseList(parseJson(indexJson), parseConversationId) ?? []);
  const storedIds = keys.map((key) => key.slice(CONVERSATION_KEY_PREFIX.length));
  return [...new Set([...indexedIds, ...storedIds])];
}

export async function loadConversations(): Promise<StoredHistory> {
  const conversationIds = await readConversationIds();
  const entries = await AsyncStorage.multiGet(conversationIds.map(toConversationKey));
  const conversations: Conversation[] = [];
  const unreadableIds: string[] = [];
  entries.forEach(([, json], index) => {
    if (json === null) return;
    const conversation = parseStoredConversation(parseJson(json));
    if (conversation) {
      conversations.push(conversation);
    } else {
      unreadableIds.push(conversationIds[index]);
    }
  });
  return { conversations, unreadableIds };
}

export async function saveConversation(
  conversation: Conversation,
  indexIds: string[],
): Promise<void> {
  await AsyncStorage.multiSet([toConversationEntry(conversation), toIndexEntry(indexIds)]);
}

export async function removeConversations(
  removedIds: string[],
  indexIds: string[],
): Promise<void> {
  await AsyncStorage.multiRemove(removedIds.map(toConversationKey));
  await AsyncStorage.setItem(...toIndexEntry(indexIds));
}

export async function replaceAllConversations(
  conversations: Conversation[],
  { indexIds, removedIds }: { indexIds: string[]; removedIds: string[] },
): Promise<void> {
  await AsyncStorage.multiSet([...conversations.map(toConversationEntry), toIndexEntry(indexIds)]);
  if (removedIds.length > 0) await AsyncStorage.multiRemove(removedIds.map(toConversationKey));
}

export async function clearAllConversations(): Promise<void> {
  const keys = await readStoredConversationKeys();
  await AsyncStorage.multiRemove([...keys, HISTORY_INDEX_KEY]);
}
