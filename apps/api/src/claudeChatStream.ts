import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStream } from '@anthropic-ai/sdk/lib/BetaMessageStream';
import type { ChatMessage } from './chatRequest.js';
import { CONVERSATION_SYSTEM_PROMPT, GROUNDED_SYSTEM_PROMPT, SYSTEM_PROMPT } from './systemPrompt.js';

const CLAUDE_MODEL = 'claude-opus-5-5';

const MAX_TOKENS = 16000;
const EFFORT = 'medium';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const CONVERSATION_MAX_TOKENS = 4096;
const CONVERSATION_EFFORT = 'low';
const CONVERSATION_REPLY_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['medical', 'conversation'] },
    text: { type: 'string' },
  },
  required: ['kind', 'text'],
  additionalProperties: false,
};

export type ConversationReply = { kind: 'medical' } | { kind: 'conversation'; text: string };

const MEDICAL_REPLY: ConversationReply = { kind: 'medical' };

const streamWithSystemPrompt = (
  client: Anthropic,
  systemPrompt: string,
  messages: Anthropic.Beta.BetaMessageParam[],
): BetaMessageStream =>
  client.beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: { effort: EFFORT },
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages,
  });

export const startClaudeChatStream = (client: Anthropic, messages: ChatMessage[]): BetaMessageStream =>
  streamWithSystemPrompt(client, SYSTEM_PROMPT, messages);

export const startGroundedChatStream = (client: Anthropic, messages: Anthropic.Beta.BetaMessageParam[]): BetaMessageStream =>
  streamWithSystemPrompt(client, GROUNDED_SYSTEM_PROMPT, messages);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const toConversationReply = (output: unknown): ConversationReply => {
  if (typeof output !== 'object' || output === null || !('kind' in output) || !('text' in output)) return MEDICAL_REPLY;
  const { kind, text } = output;
  if (kind !== 'conversation' || typeof text !== 'string' || text.trim().length === 0) return MEDICAL_REPLY;
  return { kind, text: text.trim() };
};

export const createConversationReply = async (
  client: Anthropic,
  messages: ChatMessage[],
  signal: AbortSignal,
): Promise<ConversationReply> => {
  const message = await client.beta.messages.create(
    {
      model: CLAUDE_MODEL,
      max_tokens: CONVERSATION_MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { effort: CONVERSATION_EFFORT, format: { type: 'json_schema', schema: CONVERSATION_REPLY_SCHEMA } },
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      system: [{ type: 'text', text: CONVERSATION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages,
    },
    { signal },
  );
  const outputText = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  const reply = message.stop_reason === 'end_turn' ? toConversationReply(parseJson(outputText)) : MEDICAL_REPLY;
  const { input_tokens: input, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite } = message.usage;
  console.log(`Conversation reply: kind=${reply.kind} stop=${message.stop_reason} input=${input} cache_read=${cacheRead ?? 0} cache_write=${cacheWrite ?? 0}`);
  return reply;
};
