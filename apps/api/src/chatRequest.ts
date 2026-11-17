type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequestParseResult =
  | { status: 'valid'; messages: ChatMessage[] }
  | { status: 'invalid'; error: string };

const MAX_MESSAGES = 50;
const MAX_CONTENT_LENGTH = 8000;
const CHAT_ROLES: readonly ChatRole[] = ['user', 'assistant'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isChatRole = (value: unknown): value is ChatRole =>
  CHAT_ROLES.some((role) => role === value);

const isChatMessage = (value: unknown): value is ChatMessage =>
  isRecord(value) &&
  isChatRole(value.role) &&
  typeof value.content === 'string' &&
  value.content.trim().length > 0 &&
  value.content.length <= MAX_CONTENT_LENGTH;

const invalid = (error: string): ChatRequestParseResult => ({ status: 'invalid', error });

export const parseChatRequest = (body: unknown): ChatRequestParseResult => {
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    return invalid('Body must be an object with a "messages" array');
  }
  const { messages } = body;
  if (messages.length === 0) {
    return invalid('"messages" must not be empty');
  }
  if (messages.length > MAX_MESSAGES) {
    return invalid(`"messages" must contain at most ${MAX_MESSAGES} items`);
  }
  if (!messages.every(isChatMessage)) {
    return invalid(
      `Each message needs role "user" or "assistant" and non-empty content up to ${MAX_CONTENT_LENGTH} characters`,
    );
  }
  if (messages.at(-1)?.role !== 'user') {
    return invalid('The last message must have role "user"');
  }
  return { status: 'valid', messages };
};
