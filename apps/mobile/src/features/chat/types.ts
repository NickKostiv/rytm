export type ChatRole = 'user' | 'assistant';

export type ApiMessage = {
  role: ChatRole;
  content: string;
};

export type UserMessage = {
  id: string;
  role: 'user';
  content: string;
};

export type AssistantMessage = {
  id: string;
  role: 'assistant';
  content: string;
} & ({ status: 'streaming' } | { status: 'done' } | { status: 'error'; error: string });

export type ChatMessage = UserMessage | AssistantMessage;

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; stopReason: string }
  | { type: 'error'; message: string };
