import Anthropic from '@anthropic-ai/sdk';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import type { SSEStreamingApi } from 'hono/streaming';
import { parseChatRequest } from './chatRequest.js';
import type { ChatMessage } from './chatRequest.js';
import { REFUSAL_MESSAGE, toUserSafeChatError } from './chatErrorMessage.js';
import { writeEvent } from './chatSse.js';
import { createConversationReply, startClaudeChatStream, startGroundedChatStream } from './claudeChatStream.js';
import { pipeGroundedReply } from './grounding/groundedReply.js';
import type { GroundedDependencies } from './grounding/groundedReply.js';
import { createLazySourceIndex } from './retrieval/sourceIndex.js';

const HTTP_BAD_REQUEST = 400;
const REFUSAL_STOP_REASON = 'refusal';

const readJsonBody = async (c: Context): Promise<unknown> => {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
};

const pipeClaudeReply = async (sse: SSEStreamingApi, client: Anthropic, messages: ChatMessage[]): Promise<void> => {
  const claudeStream = startClaudeChatStream(client, messages);
  sse.onAbort(() => claudeStream.abort());
  try {
    for await (const event of claudeStream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        await writeEvent(sse, 'delta', { text: event.delta.text });
      }
    }
    const { stop_reason: stopReason } = await claudeStream.finalMessage();
    if (stopReason === REFUSAL_STOP_REASON) {
      await writeEvent(sse, 'error', { message: REFUSAL_MESSAGE });
      return;
    }
    await writeEvent(sse, 'done', { stopReason });
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) return;
    await writeEvent(sse, 'error', { message: toUserSafeChatError(error) });
  }
};

const createGroundedDependencies = (client: Anthropic): GroundedDependencies | null =>
  process.env.GROUNDED_MODE === '1'
    ? {
        getSourceIndex: createLazySourceIndex(),
        startStream: (messages) => startGroundedChatStream(client, messages),
        replyWithoutSources: (messages, signal) => createConversationReply(client, messages, signal),
      }
    : null;

export const createApp = (client: Anthropic, grounded = createGroundedDependencies(client)): Hono => {
  const app = new Hono();
  app.use('*', cors());
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.post('/chat', async (c) => {
    const parsed = parseChatRequest(await readJsonBody(c));
    if (parsed.status === 'invalid') {
      return c.json({ error: parsed.error }, HTTP_BAD_REQUEST);
    }
    return streamSSE(c, (sse) =>
      grounded ? pipeGroundedReply(sse, parsed.messages, grounded) : pipeClaudeReply(sse, client, parsed.messages),
    );
  });
  return app;
};
