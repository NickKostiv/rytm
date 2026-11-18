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

export type AnswerSource = {
  id: string;
  title: string;
  orderNumber: string;
  orderDate: string;
  page?: string;
  url: string;
  isValidityVerified: boolean;
};

export type AssistantMessage = {
  id: string;
  role: 'assistant';
  content: string;
  sources: AnswerSource[];
} & (
  | { status: 'streaming' }
  | { status: 'done' }
  | { status: 'stopped' }
  | { status: 'error'; error: string }
);

export type ChatMessage = UserMessage | AssistantMessage;

export type ChatCitation = {
  id: string;
  orderNumber: string;
  orderDate: string;
  title: string;
  page: number;
  url: string;
  validity: string;
};

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'citations'; items: ChatCitation[] }
  | { type: 'done'; stopReason: string }
  | { type: 'error'; message: string };
