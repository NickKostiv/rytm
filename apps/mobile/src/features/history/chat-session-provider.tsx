import { createContext, use, type ReactNode } from 'react';

import { type ChatSession, useChatSessionState } from '@/features/history/use-chat-session-state';

const ChatSessionContext = createContext<ChatSession | null>(null);

export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const session = useChatSessionState();
  return <ChatSessionContext value={session}>{children}</ChatSessionContext>;
}

export function useChatSession(): ChatSession {
  const session = use(ChatSessionContext);
  if (!session) throw new Error('useChatSession must be used inside ChatSessionProvider');
  return session;
}
