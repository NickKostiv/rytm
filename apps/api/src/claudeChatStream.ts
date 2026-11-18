import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStream } from '@anthropic-ai/sdk/lib/BetaMessageStream';
import type { ChatMessage } from './chatRequest.js';
import { DOSE_EXTRACTION_SCHEMA } from './dosing/doseExtraction.js';
import type { StructuredOutput } from './dosing/doseExtraction.js';
import { DOSING_PARAMETERS_SYSTEM_PROMPT } from './dosing/dosingParametersPrompt.js';
import { JUDGE_VERDICT_SCHEMA } from './grounding/judgeVerdict.js';
import {
  CONVERSATION_SYSTEM_PROMPT,
  GROUNDED_SYSTEM_PROMPT,
  JUDGE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  VERIFIED_CONVERSATION_SYSTEM_PROMPT,
  VERIFIED_SYSTEM_PROMPT,
} from './systemPrompt.js';

const CLAUDE_MODEL = 'claude-opus-5-5';

const MAX_TOKENS = 16000;
const EFFORT = 'medium';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

type Effort = NonNullable<Anthropic.Beta.BetaOutputConfig['effort']>;

const STRUCTURED_MAX_TOKENS = 4096;
const STRUCTURED_EFFORT: Effort = 'low';
const JUDGE_EFFORT: Effort = 'high';
const CONVERSATION_REPLY_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['medical', 'conversation'] },
    text: { type: 'string' },
  },
  required: ['kind', 'text'],
  additionalProperties: false,
};
const VERIFIED_CLASSIFIER_SCHEMA = {
  ...CONVERSATION_REPLY_SCHEMA,
  properties: { ...CONVERSATION_REPLY_SCHEMA.properties, retrievalTerms: { type: 'array', items: { type: 'string' } } },
  required: [...CONVERSATION_REPLY_SCHEMA.required, 'retrievalTerms'],
};

const WEB_SEARCH_TOOL: Anthropic.Beta.BetaWebSearchTool20260209 = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: 3,
  blocked_domains: ['moz.gov.ua'],
  user_location: { type: 'approximate', country: 'UA' },
};

export type ConversationReply = { kind: 'medical' } | { kind: 'conversation'; text: string };

export type ClassifiedReply = { kind: 'medical'; retrievalTerms: string[] } | { kind: 'conversation'; text: string };

const MEDICAL_REPLY: ClassifiedReply = { kind: 'medical', retrievalTerms: [] };

type ChatStreamRequest = {
  systemPrompt: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools?: Anthropic.Beta.BetaToolUnion[];
  container?: string;
};

const streamWithSystemPrompt = (client: Anthropic, { systemPrompt, messages, ...toolParams }: ChatStreamRequest): BetaMessageStream =>
  client.beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: { effort: EFFORT },
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages,
    ...toolParams,
  });

export const startClaudeChatStream = (client: Anthropic, messages: ChatMessage[]): BetaMessageStream =>
  streamWithSystemPrompt(client, { systemPrompt: SYSTEM_PROMPT, messages });

export const startGroundedChatStream = (client: Anthropic, messages: Anthropic.Beta.BetaMessageParam[]): BetaMessageStream =>
  streamWithSystemPrompt(client, { systemPrompt: GROUNDED_SYSTEM_PROMPT, messages });

export type VerifiedStreamRequest = {
  messages: Anthropic.Beta.BetaMessageParam[];
  containerId: string | null;
  onServerToolUse: () => void;
};

export const startVerifiedChatStream = (
  client: Anthropic,
  { messages, containerId, onServerToolUse }: VerifiedStreamRequest,
): BetaMessageStream => {
  const container = containerId === null ? {} : { container: containerId };
  const stream = streamWithSystemPrompt(client, { systemPrompt: VERIFIED_SYSTEM_PROMPT, messages, tools: [WEB_SEARCH_TOOL], ...container });
  stream.on('streamEvent', (event) => {
    if (event.type === 'content_block_start' && event.content_block.type === 'server_tool_use') onServerToolUse();
  });
  return stream;
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const toRetrievalTerms = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap((term) => (typeof term === 'string' ? [term] : [])) : [];

const toClassifiedReply = (output: unknown): ClassifiedReply => {
  if (typeof output !== 'object' || output === null || !('kind' in output) || !('text' in output)) return MEDICAL_REPLY;
  const { kind, text } = output;
  if (kind === 'medical') return { kind, retrievalTerms: 'retrievalTerms' in output ? toRetrievalTerms(output.retrievalTerms) : [] };
  if (kind !== 'conversation' || typeof text !== 'string' || text.trim().length === 0) return MEDICAL_REPLY;
  return { kind, text: text.trim() };
};

type StructuredRequest = { systemPrompt: string; schema: Record<string, unknown>; effort: Effort; maxTokens: number };

type StructuredOutputWithUsage = StructuredOutput & { usage: string };

const createStructuredOutput = async (
  client: Anthropic,
  request: StructuredRequest,
  { messages, signal }: { messages: ChatMessage[]; signal: AbortSignal },
): Promise<StructuredOutputWithUsage> => {
  const message = await client.beta.messages.create(
    {
      model: CLAUDE_MODEL,
      max_tokens: request.maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: request.effort, format: { type: 'json_schema', schema: request.schema } },
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      system: [{ type: 'text', text: request.systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages,
    },
    { signal },
  );
  const { input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite } = message.usage;
  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  return {
    stopReason: message.stop_reason,
    text,
    usage: `input=${input} output=${output} cache_read=${cacheRead ?? 0} cache_write=${cacheWrite ?? 0}`,
  };
};

const DOSE_EXTRACTION_REQUEST: StructuredRequest = {
  systemPrompt: DOSING_PARAMETERS_SYSTEM_PROMPT,
  schema: DOSE_EXTRACTION_SCHEMA,
  effort: STRUCTURED_EFFORT,
  maxTokens: STRUCTURED_MAX_TOKENS,
};

const JUDGE_REQUEST: StructuredRequest = {
  systemPrompt: JUDGE_SYSTEM_PROMPT,
  schema: JUDGE_VERDICT_SCHEMA,
  effort: JUDGE_EFFORT,
  maxTokens: MAX_TOKENS,
};

const CONVERSATION_REQUEST: StructuredRequest = {
  systemPrompt: CONVERSATION_SYSTEM_PROMPT,
  schema: CONVERSATION_REPLY_SCHEMA,
  effort: STRUCTURED_EFFORT,
  maxTokens: STRUCTURED_MAX_TOKENS,
};

const VERIFIED_CLASSIFIER_REQUEST: StructuredRequest = {
  systemPrompt: VERIFIED_CONVERSATION_SYSTEM_PROMPT,
  schema: VERIFIED_CLASSIFIER_SCHEMA,
  effort: STRUCTURED_EFFORT,
  maxTokens: STRUCTURED_MAX_TOKENS,
};

const classifyMessage = async (
  client: Anthropic,
  request: StructuredRequest,
  { messages, signal }: { messages: ChatMessage[]; signal: AbortSignal },
): Promise<ClassifiedReply> => {
  const output = await createStructuredOutput(client, request, { messages, signal });
  const reply = output.stopReason === 'end_turn' ? toClassifiedReply(parseJson(output.text)) : MEDICAL_REPLY;
  console.log(`Conversation reply: kind=${reply.kind} stop=${output.stopReason} ${output.usage}`);
  return reply;
};

export const createConversationReply = (client: Anthropic, messages: ChatMessage[], signal: AbortSignal): Promise<ClassifiedReply> =>
  classifyMessage(client, CONVERSATION_REQUEST, { messages, signal });

export const createVerifiedClassification = (client: Anthropic, messages: ChatMessage[], signal: AbortSignal): Promise<ClassifiedReply> =>
  classifyMessage(client, VERIFIED_CLASSIFIER_REQUEST, { messages, signal });

export const createDoseExtraction = async (client: Anthropic, messages: ChatMessage[], signal: AbortSignal): Promise<StructuredOutput> => {
  const output = await createStructuredOutput(client, DOSE_EXTRACTION_REQUEST, { messages, signal });
  console.log(`Dose parameters: stop=${output.stopReason} ${output.usage}`);
  return output;
};

export const createJudgeVerdict = async (client: Anthropic, judgeInput: string, signal: AbortSignal): Promise<StructuredOutput> => {
  const output = await createStructuredOutput(client, JUDGE_REQUEST, { messages: [{ role: 'user', content: judgeInput }], signal });
  console.log(`Judge verdict: stop=${output.stopReason} ${output.usage}`);
  return output;
};
