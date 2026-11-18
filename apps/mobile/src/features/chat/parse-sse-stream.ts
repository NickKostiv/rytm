import { PROGRESS_STAGES } from '@/features/chat/constants';
import { parseDoseParameters } from '@/features/chat/parse-dose-parameters';
import type { ChatCitation, ChatStreamEvent, ProgressStage, WebSource } from '@/features/chat/types';
import { isRecord } from '@/lib/type-guards';

const FRAME_SEPARATOR = '\n\n';

function readStringField(payload: unknown, field: string): string {
  if (!isRecord(payload) || typeof payload[field] !== 'string') {
    throw new Error(`Malformed "${field}" in stream event`);
  }
  return payload[field];
}

function readNumberField(payload: unknown, field: string): number {
  if (!isRecord(payload) || typeof payload[field] !== 'number') {
    throw new Error(`Malformed "${field}" in stream event`);
  }
  return payload[field];
}

function toCitation(item: unknown): ChatCitation {
  return {
    id: readStringField(item, 'id'),
    orderNumber: readStringField(item, 'orderNumber'),
    orderDate: readStringField(item, 'orderDate'),
    title: readStringField(item, 'title'),
    page: readNumberField(item, 'page'),
    url: readStringField(item, 'url'),
    validity: readStringField(item, 'validity'),
  };
}

function readCitationsEvent(payload: unknown): ChatStreamEvent {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error('Malformed "items" in stream event');
  }
  return { type: 'citations', items: payload.items.map(toCitation) };
}

export function parseWebSource(item: unknown): WebSource | null {
  if (!isRecord(item)) return null;
  const { id, url, title, domain } = item;
  if (
    typeof id !== 'string' ||
    typeof url !== 'string' ||
    typeof title !== 'string' ||
    typeof domain !== 'string'
  ) {
    return null;
  }
  return { id, url, title, domain };
}

function readWebSourcesEvent(payload: unknown): ChatStreamEvent | null {
  if (!isRecord(payload) || !Array.isArray(payload.items)) return null;
  const items = payload.items.map(parseWebSource).filter((item) => item !== null);
  return { type: 'web_sources', items };
}

function isProgressStage(value: unknown): value is ProgressStage {
  return PROGRESS_STAGES.some((stage) => stage === value);
}

function readProgressEvent(payload: unknown): ChatStreamEvent | null {
  if (!isRecord(payload) || !isProgressStage(payload.stage)) return null;
  return { type: 'progress', stage: payload.stage };
}

function readDoseParametersEvent(payload: unknown): ChatStreamEvent | null {
  const parameters = parseDoseParameters(payload);
  return parameters ? { type: 'dose_parameters', parameters } : null;
}

function toStreamEvent(eventName: string, payload: unknown): ChatStreamEvent | null {
  switch (eventName) {
    case 'delta':
      return { type: 'delta', text: readStringField(payload, 'text') };
    case 'citations':
      return readCitationsEvent(payload);
    case 'web_sources':
      return readWebSourcesEvent(payload);
    case 'progress':
      return readProgressEvent(payload);
    case 'dose_parameters':
      return readDoseParametersEvent(payload);
    case 'done':
      return { type: 'done', stopReason: readStringField(payload, 'stopReason') };
    case 'error':
      return { type: 'error', message: readStringField(payload, 'message') };
    default:
      return null;
  }
}

function parseFrame(frame: string): ChatStreamEvent | null {
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
    }
  }

  if (dataLines.length === 0) return null;
  return toStreamEvent(eventName, JSON.parse(dataLines.join('\n')));
}

export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      let separatorIndex = buffer.indexOf(FRAME_SEPARATOR);
      while (separatorIndex !== -1) {
        const event = parseFrame(buffer.slice(0, separatorIndex));
        buffer = buffer.slice(separatorIndex + FRAME_SEPARATOR.length);
        if (event) yield event;
        separatorIndex = buffer.indexOf(FRAME_SEPARATOR);
      }

      if (done) break;
    }

    const trailingEvent = buffer.trim() ? parseFrame(buffer) : null;
    if (trailingEvent) yield trailingEvent;
  } finally {
    reader.releaseLock();
  }
}
