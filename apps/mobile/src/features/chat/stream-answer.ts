import { COPY } from '@/features/chat/constants';
import { ChatRequestError, streamChat } from '@/features/chat/stream-chat';
import type { ApiMessage, ChatStreamEvent } from '@/features/chat/types';

type AnswerHandlers = {
  onEvent: (event: ChatStreamEvent) => void;
  onFailure: (error: string) => void;
};

export async function streamAnswer(
  history: ApiMessage[],
  signal: AbortSignal,
  { onEvent, onFailure }: AnswerHandlers,
): Promise<void> {
  let hasFinished = false;
  try {
    for await (const event of streamChat(history, signal)) {
      if (signal.aborted) return;
      hasFinished = event.type === 'done' || event.type === 'error';
      onEvent(event);
    }
    if (!signal.aborted && !hasFinished) onFailure(COPY.interruptedStream);
  } catch (error) {
    if (signal.aborted) return;
    onFailure(error instanceof ChatRequestError ? error.message : COPY.networkError);
  }
}
