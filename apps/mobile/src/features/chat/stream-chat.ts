import { fetch } from 'expo/fetch';

import { API_URL, COPY } from '@/features/chat/constants';
import { parseSseStream } from '@/features/chat/parse-sse-stream';
import type { ApiMessage, ChatStreamEvent } from '@/features/chat/types';

export class ChatRequestError extends Error {}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (typeof payload === 'object' && payload !== null && 'error' in payload) {
      if (typeof payload.error === 'string') return payload.error;
    }
  } catch {
    return COPY.serverError(response.status);
  }
  return COPY.serverError(response.status);
}

export async function* streamChat(
  messages: ApiMessage[],
  signal: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const response = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok) throw new ChatRequestError(await readErrorMessage(response));
  if (!response.body) throw new ChatRequestError(COPY.interruptedStream);

  yield* parseSseStream(response.body);
}
