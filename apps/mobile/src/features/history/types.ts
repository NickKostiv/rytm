import type { ChatMessage } from '@/features/chat/types';

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

export type HistoryLoadStatus = 'pending' | 'slow' | 'failed' | 'ready';
