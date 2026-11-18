import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import type { SSEStreamingApi } from 'hono/streaming';
import { REFUSAL_MESSAGE, toUserSafeChatError } from '../chatErrorMessage.js';
import type { ChatMessage } from '../chatRequest.js';
import { writeEvent } from '../chatSse.js';
import type { ConversationReply } from '../claudeChatStream.js';
import { awaitDoseParameters, describeDoseParameters, startDoseParameters } from '../dosing/recogniseDoseParameters.js';
import type { DoseParameterDependencies, PendingDoseParameters } from '../dosing/recogniseDoseParameters.js';
import type { RetrievedFragment, SourceIndex } from '../retrieval/sourceIndex.js';
import { findUnverifiedNumbers } from './answerNumbers.js';
import type { AnswerSegment } from './answerNumbers.js';
import { toCitationItem, toSearchResultBlock } from './groundingFragments.js';

export type GroundedMessage = Pick<Anthropic.Beta.BetaMessage, 'content' | 'stop_reason'> & {
  usage: Pick<Anthropic.Beta.BetaUsage, 'input_tokens' | 'cache_read_input_tokens' | 'cache_creation_input_tokens'>;
};

export type GroundedStream = { abort: () => void; finalMessage: () => Promise<GroundedMessage> };

export type GroundedDependencies = DoseParameterDependencies & {
  getSourceIndex: () => Promise<SourceIndex>;
  startStream: (messages: Anthropic.Beta.BetaMessageParam[]) => GroundedStream;
  replyWithoutSources: (messages: ChatMessage[], signal: AbortSignal) => Promise<ConversationReply>;
};

export const NO_SOURCE_MESSAGE = 'Цього немає в базі протоколів МОЗ';
export const WITHHELD_MESSAGE = 'Відповідь приховано: числа не підтверджені цитованими джерелами';
const SOURCE_BASE_UNAVAILABLE_MESSAGE = 'База джерел тимчасово недоступна. Спробуйте ще раз.';
const REFUSAL_STOP_REASON = 'refusal';
const CONVERSATION_STOP_REASON = 'conversation';
const SHORT_QUESTION_LENGTH = 40;

type RequestWithoutSources = { requestId: string; messages: ChatMessage[]; index: SourceIndex };

type RequestWithFragments = RequestWithoutSources & {
  fragments: RetrievedFragment[];
  doseParameters: PendingDoseParameters;
};

const buildRetrievalQuery = (messages: ChatMessage[]): string => {
  const userMessages = messages.filter(({ role }) => role === 'user').map(({ content }) => content);
  const last = userMessages.at(-1) ?? '';
  const previous = userMessages.at(-2);
  return last.length < SHORT_QUESTION_LENGTH && previous ? `${previous}\n${last}` : last;
};

const toGroundedMessages = (messages: ChatMessage[], fragments: RetrievedFragment[]): Anthropic.Beta.BetaMessageParam[] => {
  const history = messages.slice(0, -1);
  const question = messages.at(-1)?.content ?? '';
  return [...history, { role: 'user', content: [...fragments.map(toSearchResultBlock), { type: 'text', text: question }] }];
};

type CollectedAnswer = { text: string; cited: RetrievedFragment[]; segments: AnswerSegment[] };

const citedFragments = (block: Anthropic.Beta.BetaTextBlock, fragments: RetrievedFragment[]): { fragment: RetrievedFragment; citedText: string }[] =>
  (block.citations ?? []).flatMap((citation) => {
    const fragment = citation.type === 'search_result_location' ? fragments[citation.search_result_index] : undefined;
    return fragment ? [{ fragment, citedText: citation.cited_text }] : [];
  });

const collectAnswer = (content: Anthropic.Beta.BetaContentBlock[], fragments: RetrievedFragment[]): CollectedAnswer => {
  const textBlocks = content.flatMap((block) => (block.type === 'text' ? [block] : []));
  const blockCitations = textBlocks.map((block) => citedFragments(block, fragments));
  const segments = textBlocks.map(({ text }, index) => ({
    text,
    sourceTexts: (blockCitations[index] ?? []).flatMap(({ fragment, citedText }) => [citedText, fragment.chunk.content]),
  }));
  const cited = [...new Set(blockCitations.flat().map(({ fragment }) => fragment))];
  return { text: textBlocks.map(({ text }) => text).join(''), cited, segments };
};

const writeGroundedAnswer = async (
  sse: SSEStreamingApi,
  answer: { text: string; cited: RetrievedFragment[]; stopReason: string },
): Promise<void> => {
  if (answer.text) await writeEvent(sse, 'delta', { text: answer.text });
  await writeEvent(sse, 'citations', { items: answer.cited.map(toCitationItem) });
  await writeEvent(sse, 'done', { stopReason: answer.stopReason });
};

const writeNoSourceAnswer = (sse: SSEStreamingApi): Promise<void> =>
  writeGroundedAnswer(sse, { text: NO_SOURCE_MESSAGE, cited: [], stopReason: 'no_sources' });

const writeWithheldAnswer = (sse: SSEStreamingApi, cited: RetrievedFragment[]): Promise<void> => {
  const tables = cited.filter(({ chunk }) => chunk.type === 'table');
  return writeGroundedAnswer(sse, {
    text: [WITHHELD_MESSAGE, ...tables.map(({ chunk }) => chunk.content)].join('\n\n'),
    cited,
    stopReason: 'withheld',
  });
};

const readFinalMessage = async (sse: SSEStreamingApi, stream: GroundedStream): Promise<GroundedMessage | null> => {
  sse.onAbort(() => stream.abort());
  try {
    return await stream.finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) return null;
    await writeEvent(sse, 'error', { message: toUserSafeChatError(error) });
    return null;
  }
};

const readConversationReply = async (
  sse: SSEStreamingApi,
  messages: ChatMessage[],
  dependencies: GroundedDependencies,
): Promise<ConversationReply | null> => {
  if (sse.aborted) return null;
  const controller = new AbortController();
  sse.onAbort(() => controller.abort());
  try {
    const reply = await dependencies.replyWithoutSources(messages, controller.signal);
    return sse.aborted ? null : reply;
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) return null;
    await writeEvent(sse, 'error', { message: toUserSafeChatError(error) });
    return null;
  }
};

const describeMedicalContent = (text: string, index: SourceIndex): string | null => {
  const numbers = findUnverifiedNumbers([{ text, sourceTexts: [] }]).length;
  if (numbers > 0) return `numbers=${numbers}`;
  const fragments = index.search(text).length;
  return fragments > 0 ? `fragments=${fragments}` : null;
};

const describeUnverifiedNumbers = (segments: AnswerSegment[], fragments: RetrievedFragment[]): string => {
  const inUncitedBlocks = segments.filter(({ sourceTexts }) => sourceTexts.length === 0).flatMap((segment) => findUnverifiedNumbers([segment])).length;
  const retrievedTexts = fragments.map(({ chunk }) => chunk.content);
  const absentFromRetrieved = findUnverifiedNumbers(segments.map(({ text }) => ({ text, sourceTexts: retrievedTexts }))).length;
  return `in_uncited_blocks=${inUncitedBlocks} absent_from_retrieved=${absentFromRetrieved}`;
};

const writeAnswerWithoutSources = async (
  sse: SSEStreamingApi,
  reply: ConversationReply,
  request: RequestWithoutSources,
): Promise<void> => {
  if (reply.kind === 'medical') {
    await writeNoSourceAnswer(sse);
    return;
  }
  const medicalContent = describeMedicalContent(reply.text, request.index);
  if (medicalContent) {
    console.warn(`Grounded request ${request.requestId}: conversation reply replaced by no-source answer, ${medicalContent}`);
    await writeNoSourceAnswer(sse);
    return;
  }
  await writeGroundedAnswer(sse, { text: reply.text, cited: [], stopReason: CONVERSATION_STOP_REASON });
};

const answerWithoutSources = async (
  sse: SSEStreamingApi,
  request: RequestWithoutSources,
  dependencies: GroundedDependencies,
): Promise<void> => {
  const reply = await readConversationReply(sse, request.messages, dependencies);
  if (reply) await writeAnswerWithoutSources(sse, reply, request);
};

const writeDoseParameters = async (sse: SSEStreamingApi, request: RequestWithFragments): Promise<void> => {
  const event = await awaitDoseParameters(request.doseParameters);
  if (!event || sse.aborted) return;
  console.log(`Grounded request ${request.requestId}: dose_parameters ${describeDoseParameters(event)}`);
  await writeEvent(sse, 'dose_parameters', event);
};

const answerFromFragments = async (
  sse: SSEStreamingApi,
  request: RequestWithFragments,
  dependencies: GroundedDependencies,
): Promise<void> => {
  const { requestId, messages, fragments, doseParameters } = request;
  const message = await readFinalMessage(sse, dependencies.startStream(toGroundedMessages(messages, fragments)));
  if (!message) {
    doseParameters.abort();
    return;
  }
  const { input_tokens: input, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite } = message.usage;
  console.log(`Grounded request ${requestId}: fragments=${fragments.length} input=${input} cache_read=${cacheRead ?? 0} cache_write=${cacheWrite ?? 0}`);
  if (message.stop_reason === REFUSAL_STOP_REASON) {
    doseParameters.abort();
    await writeEvent(sse, 'error', { message: REFUSAL_MESSAGE });
    return;
  }

  const { text, cited, segments } = collectAnswer(message.content, fragments);
  if (cited.length === 0) {
    doseParameters.abort();
    console.log(`Grounded request ${requestId}: answer has no citations`);
    await answerWithoutSources(sse, request, dependencies);
    return;
  }
  await writeDoseParameters(sse, request);
  const unverified = findUnverifiedNumbers(segments);
  if (unverified.length > 0) {
    console.warn(
      `Grounded request ${requestId}: answer withheld, unverified numbers=${unverified.length} ${describeUnverifiedNumbers(segments, fragments)}, citations=${cited.length}`,
    );
    await writeWithheldAnswer(sse, cited);
    return;
  }
  await writeGroundedAnswer(sse, { text, cited, stopReason: message.stop_reason ?? 'end_turn' });
};

const loadIndex = async (sse: SSEStreamingApi, dependencies: GroundedDependencies): Promise<SourceIndex | null> => {
  try {
    return await dependencies.getSourceIndex();
  } catch (error) {
    console.error(`Source index unavailable: ${error instanceof Error ? error.name : typeof error}`);
    await writeEvent(sse, 'error', { message: SOURCE_BASE_UNAVAILABLE_MESSAGE });
    return null;
  }
};

export const pipeGroundedReply = async (
  sse: SSEStreamingApi,
  messages: ChatMessage[],
  dependencies: GroundedDependencies,
): Promise<void> => {
  const requestId = randomUUID();
  const index = await loadIndex(sse, dependencies);
  if (!index) return;
  const fragments = index.search(buildRetrievalQuery(messages));
  if (sse.aborted) return;
  const requestWithoutSources = { requestId, messages, index };
  if (fragments.length === 0) {
    console.log(`Grounded request ${requestId}: no fragment above threshold`);
    await answerWithoutSources(sse, requestWithoutSources, dependencies);
    return;
  }
  const doseParameters = startDoseParameters({ requestId, messages }, dependencies);
  sse.onAbort(() => doseParameters.abort());
  try {
    await answerFromFragments(sse, { ...requestWithoutSources, fragments, doseParameters }, dependencies);
  } finally {
    doseParameters.abort();
  }
};
