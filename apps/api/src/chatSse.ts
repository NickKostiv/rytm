import type { SSEStreamingApi } from 'hono/streaming';

export const writeEvent = (sse: SSEStreamingApi, event: string, payload: object): Promise<void> =>
  sse.writeSSE({ event, data: JSON.stringify(payload) });
