import Anthropic from '@anthropic-ai/sdk';
import type { RuleSet } from '@rytm/dosing';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import type { SSEStreamingApi } from 'hono/streaming';
import { parseChatRequest } from './chatRequest.js';
import type { ChatMessage } from './chatRequest.js';
import { REFUSAL_MESSAGE, toUserSafeChatError } from './chatErrorMessage.js';
import { writeEvent } from './chatSse.js';
import { createConversationReply, createDoseExtraction, startClaudeChatStream, startGroundedChatStream } from './claudeChatStream.js';
import { respondToDoseRequest } from './dosing/doseResponse.js';
import { createLazyDoseRuleSet } from './dosing/doseRuleSet.js';
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

type AppDependencies = { grounded: GroundedDependencies | null; getRuleSet: () => Promise<RuleSet> };

const createAppDependencies = (client: Anthropic): AppDependencies => {
  const getRuleSet = createLazyDoseRuleSet();
  const grounded: GroundedDependencies | null =
    process.env.GROUNDED_MODE === '1'
      ? {
          getSourceIndex: createLazySourceIndex(),
          startStream: (messages) => startGroundedChatStream(client, messages),
          replyWithoutSources: (messages, signal) => createConversationReply(client, messages, signal),
          extractDoseParameters: (messages, signal) => createDoseExtraction(client, messages, signal),
          getRuleSet,
        }
      : null;
  return { grounded, getRuleSet };
};

export const createApp = (client: Anthropic, { grounded, getRuleSet } = createAppDependencies(client)): Hono => {
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
  app.post('/dose', async (c) => {
    const { status, body } = await respondToDoseRequest(await readJsonBody(c), getRuleSet);
    return c.json(body, status);
  });
  return app;
};
