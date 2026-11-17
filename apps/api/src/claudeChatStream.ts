import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStream } from '@anthropic-ai/sdk/lib/BetaMessageStream';
import type { ChatMessage } from './chatRequest.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';

const CLAUDE_MODEL = 'claude-opus-5-5';

const MAX_TOKENS = 16000;
const EFFORT = 'medium';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export const startClaudeChatStream = (client: Anthropic, messages: ChatMessage[]): BetaMessageStream =>
  client.beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: { effort: EFFORT },
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages,
  });
