import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStream } from '@anthropic-ai/sdk/lib/BetaMessageStream';
import type { ChatMessage } from './chatRequest.js';
import { GROUNDED_SYSTEM_PROMPT, SYSTEM_PROMPT } from './systemPrompt.js';

const CLAUDE_MODEL = 'claude-opus-5-5';

const MAX_TOKENS = 16000;
const EFFORT = 'medium';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

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
