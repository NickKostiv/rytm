import { API_URL, COPY, DOSE_COPY } from '@/features/chat/constants';
import { type DoseReply, parseDoseReply } from '@/features/chat/parse-dose-reply';
import { readErrorMessage } from '@/features/chat/stream-chat';
import type { DoseRequest } from '@/features/chat/types';

const HTTP_SERVICE_UNAVAILABLE = 503;

export type DoseRequestOutcome = DoseReply | { kind: 'failed'; message: string };

async function postDose(request: DoseRequest, signal: AbortSignal): Promise<Response | null> {
  try {
    return await fetch(`${API_URL}/dose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch {
    return null;
  }
}

async function readDoseReply(response: Response): Promise<DoseRequestOutcome> {
  try {
    const reply = parseDoseReply(await response.json());
    return reply ?? { kind: 'failed', message: DOSE_COPY.incompleteReply };
  } catch (error) {
    const message =
      error instanceof SyntaxError ? DOSE_COPY.incompleteReply : DOSE_COPY.networkError;
    return { kind: 'failed', message };
  }
}

export async function requestDose(
  request: DoseRequest,
  signal: AbortSignal,
): Promise<DoseRequestOutcome> {
  const response = await postDose(request, signal);
  if (!response) return { kind: 'failed', message: DOSE_COPY.networkError };
  if (response.status === HTTP_SERVICE_UNAVAILABLE) {
    return { kind: 'failed', message: await readErrorMessage(response) };
  }
  if (!response.ok) return { kind: 'failed', message: COPY.serverError(response.status) };
  return readDoseReply(response);
}
