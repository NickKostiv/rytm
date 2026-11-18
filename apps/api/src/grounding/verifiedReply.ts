import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import type { SSEStreamingApi } from 'hono/streaming';
import { REFUSAL_MESSAGE, toUserSafeChatError } from '../chatErrorMessage.js';
import type { ChatMessage } from '../chatRequest.js';
import { writeEvent } from '../chatSse.js';
import type { ClassifiedReply, VerifiedStreamRequest } from '../claudeChatStream.js';
import type { StructuredOutput } from '../dosing/doseExtraction.js';
import type { DoseParametersEvent } from '../dosing/doseParameters.js';
import { awaitDoseRecognition, describeDoseParameters, startDoseParameters } from '../dosing/recogniseDoseParameters.js';
import type { DoseParameterDependencies, DoseRecognition, PendingDoseParameters } from '../dosing/recogniseDoseParameters.js';
import { toRetrievalQuery } from '../retrieval/retrievalTerms.js';
import { MAX_FRAGMENTS_TOTAL } from '../retrieval/sourceIndex.js';
import type { RetrievedFragment, SourceIndex } from '../retrieval/sourceIndex.js';
import { appendToLines, splitAnswerSentences } from './answerSentences.js';
import type { AnswerSentence } from './answerSentences.js';
import { buildRetrievalQuery, loadIndex, NO_SOURCE_MESSAGE, toGroundedMessages, writeAnswerWithoutSources, writeNoSourceAnswer } from './groundedReply.js';
import { fragmentTitle, toCitationItem } from './groundingFragments.js';
import { buildJudgeInput, parseJudgeVerdict, VERDICTS } from './judgeVerdict.js';
import type { JudgedSentence } from './judgeVerdict.js';
import { collectVerifiedAnswer, runDeterministicChecks } from './verifiedAnswer.js';
import type { VerifiedAnswer, WebSourceItem } from './verifiedAnswer.js';

export type VerifiedMessage = Pick<Anthropic.Beta.BetaMessage, 'content' | 'stop_reason'> & {
  container: { id: string } | null;
  usage: Pick<
    Anthropic.Beta.BetaUsage,
    'input_tokens' | 'output_tokens' | 'cache_read_input_tokens' | 'cache_creation_input_tokens' | 'server_tool_use'
  >;
};

export type VerifiedStream = { abort: () => void; finalMessage: () => Promise<VerifiedMessage> };

export type VerifiedDependencies = DoseParameterDependencies & {
  getSourceIndex: () => Promise<SourceIndex>;
  startStream: (request: VerifiedStreamRequest) => VerifiedStream;
  classify: (messages: ChatMessage[], signal: AbortSignal) => Promise<ClassifiedReply>;
  judge: (judgeInput: string, signal: AbortSignal) => Promise<StructuredOutput>;
};

type ProgressStage = 'retrieving' | 'answering' | 'searching_web' | 'verifying';

type ProgressWriter = { send: (stage: ProgressStage) => Promise<void>; flush: () => Promise<void> };

type Turn = {
  requestId: string;
  messages: ChatMessage[];
  index: SourceIndex;
  signal: AbortSignal;
  progress: ProgressWriter;
  startedAt: number;
};

type TurnOutcome =
  | { kind: 'answer'; text: string; cited: RetrievedFragment[]; webSources: WebSourceItem[]; stopReason: string; doseEvent: DoseParametersEvent | null }
  | { kind: 'withheld'; quotes: RetrievedFragment[]; doseEvent: DoseParametersEvent | null }
  | { kind: 'no_sources' }
  | { kind: 'conversation'; reply: ClassifiedReply }
  | { kind: 'error'; message: string }
  | { kind: 'aborted' };

type AnswerResult = { content: Anthropic.Beta.BetaContentBlock[]; stopReason: string | null };

type AnswerRequest = { history: Anthropic.Beta.BetaMessageParam[]; collected: Anthropic.Beta.BetaContentBlock[]; containerId: string | null; resumes: number };

export const VERIFIED_TURN_DEADLINE_MS = 90_000;
export const VERIFICATION_FAILED_MESSAGE = 'Відповідь не пройшла перевірку за протоколами МОЗ. Цитати з протоколу:';
export const OUTSIDE_PROTOCOLS_LABEL = ' (поза протоколами МОЗ)';
const MAX_PAUSE_RESUMES = 2;
const MAX_WITHHELD_QUOTES = 3;
const PAUSE_TURN = 'pause_turn';
const END_TURN = 'end_turn';
const REFUSAL = 'refusal';
const TRAILING_PUNCTUATION = /[.!\s]+$/;
const DEADLINE_EXCEEDED = 'deadline_exceeded';
const NO_SOURCES: TurnOutcome = { kind: 'no_sources' };
const ABORTED: TurnOutcome = { kind: 'aborted' };

const createProgressWriter = (sse: SSEStreamingApi): ProgressWriter => {
  const sent = new Set<ProgressStage>();
  let chain = Promise.resolve();
  const send = (stage: ProgressStage): Promise<void> => {
    if (sent.has(stage) || sse.aborted) return chain;
    sent.add(stage);
    chain = chain.then(() => writeEvent(sse, 'progress', { stage }));
    return chain;
  };
  return { send, flush: () => chain };
};

const untilAborted = async <T>(pending: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) throw new Anthropic.APIUserAbortError();
  let onAbort = (): void => undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Anthropic.APIUserAbortError());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([pending, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};

const elapsed = (turn: Turn): string => `elapsed_ms=${Date.now() - turn.startedAt}`;

const log = (turn: Turn, details: string): void => {
  console.log(`Verified request ${turn.requestId}: ${details} ${elapsed(turn)}`);
};

const logAnswerUsage = (turn: Turn, message: VerifiedMessage, resumes: number): void => {
  const { input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite } = message.usage;
  const searches = message.usage.server_tool_use?.web_search_requests ?? 0;
  log(
    turn,
    `answer resume=${resumes} stop=${message.stop_reason} input=${input} output=${output} cache_read=${cacheRead ?? 0} cache_write=${cacheWrite ?? 0} web_searches=${searches}`,
  );
};

const requestAnswer = async (turn: Turn, dependencies: VerifiedDependencies, request: AnswerRequest): Promise<AnswerResult> => {
  const stream = dependencies.startStream({
    messages: request.history,
    containerId: request.containerId,
    onServerToolUse: () => void turn.progress.send('searching_web'),
  });
  const abortStream = (): void => stream.abort();
  turn.signal.addEventListener('abort', abortStream, { once: true });
  try {
    const message = await untilAborted(stream.finalMessage(), turn.signal);
    logAnswerUsage(turn, message, request.resumes);
    const content = [...request.collected, ...message.content];
    if (message.stop_reason !== PAUSE_TURN || request.resumes >= MAX_PAUSE_RESUMES) return { content, stopReason: message.stop_reason };
    return await requestAnswer(turn, dependencies, {
      history: [...request.history, { role: 'assistant', content: message.content }],
      collected: content,
      containerId: message.container?.id ?? request.containerId,
      resumes: request.resumes + 1,
    });
  } finally {
    turn.signal.removeEventListener('abort', abortStream);
  }
};

const startAnswer = (turn: Turn, dependencies: VerifiedDependencies, fragments: RetrievedFragment[]): Promise<AnswerResult> =>
  requestAnswer(turn, dependencies, { history: toGroundedMessages(turn.messages, fragments), collected: [], containerId: null, resumes: 0 });

const startTurnDoseRecognition = (turn: Turn, dependencies: VerifiedDependencies): PendingDoseParameters => {
  const pending = startDoseParameters({ requestId: turn.requestId, messages: turn.messages }, dependencies);
  turn.signal.addEventListener('abort', pending.abort, { once: true });
  return pending;
};

const hasCalculatorRule = (recognition: DoseRecognition): boolean =>
  recognition.status === 'failed' || recognition.event?.status === 'confirm' || recognition.event?.status === 'incomplete';

const recognisedEvent = (recognition: DoseRecognition): DoseParametersEvent | null =>
  recognition.status === 'recognised' ? recognition.event : null;

const isNoSourceRefusal = (text: string): boolean => text.trim().replace(TRAILING_PUNCTUATION, '') === NO_SOURCE_MESSAGE;

const uniqueFragments = (fragments: RetrievedFragment[]): RetrievedFragment[] =>
  [...new Map(fragments.map((fragment) => [fragment.chunk.id, fragment])).values()];

const withheld = (quoteCandidates: RetrievedFragment[], doseEvent: DoseParametersEvent | null): TurnOutcome => ({
  kind: 'withheld',
  quotes: uniqueFragments(quoteCandidates).slice(0, MAX_WITHHELD_QUOTES),
  doseEvent,
});

const failureOutcome = (error: unknown, turn: Turn, onDeadline: TurnOutcome): TurnOutcome => {
  if (turn.signal.aborted && turn.signal.reason !== DEADLINE_EXCEEDED) return ABORTED;
  if (turn.signal.aborted) {
    log(turn, 'deadline exceeded');
    return onDeadline;
  }
  return { kind: 'error', message: toUserSafeChatError(error) };
};

const judgeFragments = (fragments: RetrievedFragment[], sentences: AnswerSentence[], index: SourceIndex): RetrievedFragment[] =>
  uniqueFragments([...fragments, ...sentences.flatMap(({ text }) => index.search(text))]).slice(0, MAX_FRAGMENTS_TOTAL);

const judgeSentences = async (
  turn: Turn,
  dependencies: VerifiedDependencies,
  { sentences, fragments }: { sentences: AnswerSentence[]; fragments: RetrievedFragment[] },
): Promise<JudgedSentence[] | null> => {
  const judgeInput = buildJudgeInput({
    userTexts: turn.messages.filter(({ role }) => role === 'user').map(({ content }) => content),
    sentences: sentences.map(({ text }) => text),
    fragments: fragments.map((fragment) => ({ title: fragmentTitle(fragment), content: fragment.chunk.content })),
  });
  try {
    const output = await untilAborted(dependencies.judge(judgeInput, turn.signal), turn.signal);
    return parseJudgeVerdict(output, { sentences: sentences.length, fragments: fragments.length });
  } catch (error) {
    const status = error instanceof Anthropic.APIError ? ` status=${error.status ?? 'none'}` : '';
    log(turn, `judge failed error=${error instanceof Error ? error.name : typeof error}${status}`);
    return null;
  }
};

const countVerdicts = (judged: JudgedSentence[]): string =>
  VERDICTS.map((verdict) => `${verdict}=${judged.filter((sentence) => sentence.verdict === verdict).length}`)
    .join(' ');

type FragmentAnswer = { fragments: RetrievedFragment[]; answer: VerifiedAnswer; stopReason: string | null; recognition: DoseRecognition };

const verifyFragmentAnswer = async (turn: Turn, dependencies: VerifiedDependencies, context: FragmentAnswer): Promise<TurnOutcome> => {
  const { fragments, answer, stopReason, recognition } = context;
  const doseEvent = recognisedEvent(recognition);
  const fallbackQuotes = [...answer.citedFragments, ...fragments];
  if (stopReason !== END_TURN) {
    log(turn, `withheld check=stop_reason stop=${stopReason}`);
    return withheld(fallbackQuotes, doseEvent);
  }
  const sentences = splitAnswerSentences(answer.text);
  const checked = runDeterministicChecks(answer, sentences, { hasCalculatorRule: hasCalculatorRule(recognition) });
  if (checked.status === 'failed') {
    log(turn, `withheld check=${checked.check}`);
    return withheld(fallbackQuotes, doseEvent);
  }
  await turn.progress.send('verifying');
  const judgedFragments = judgeFragments(fragments, sentences, turn.index);
  const judged = await judgeSentences(turn, dependencies, { sentences, fragments: judgedFragments });
  if (!judged) {
    log(turn, `withheld check=judge sentences=${sentences.length} fragments=${judgedFragments.length}`);
    return withheld(fallbackQuotes, doseEvent);
  }
  log(turn, `judge sentences=${sentences.length} fragments=${judgedFragments.length} ${countVerdicts(judged)}`);
  const contradicting = judged.flatMap(({ verdict, fragmentIndexes }) =>
    verdict === 'contradicted' ? fragmentIndexes.flatMap((index) => judgedFragments[index] ?? []) : [],
  );
  if (judged.some(({ verdict }) => verdict === 'contradicted')) return withheld([...contradicting, ...fallbackQuotes], doseEvent);
  const labelledLines = new Set(
    sentences.flatMap(({ line }, index) =>
      judged[index]?.verdict === 'not_covered' || checked.webBoundSentences.has(index) ? [line] : [],
    ),
  );
  return {
    kind: 'answer',
    text: appendToLines(answer.text, labelledLines, OUTSIDE_PROTOCOLS_LABEL),
    cited: answer.citedFragments,
    webSources: answer.webSources,
    stopReason: END_TURN,
    doseEvent,
  };
};

const classifyTurn = async (turn: Turn, dependencies: VerifiedDependencies): Promise<ClassifiedReply> =>
  untilAborted(dependencies.classify(turn.messages, turn.signal), turn.signal);

const answerWithFragments = async (
  turn: Turn,
  dependencies: VerifiedDependencies,
  { fragments, isKnownMedical }: { fragments: RetrievedFragment[]; isKnownMedical: boolean },
): Promise<TurnOutcome> => {
  const dose = startTurnDoseRecognition(turn, dependencies);
  try {
    await turn.progress.send('answering');
    const { content, stopReason } = await startAnswer(turn, dependencies, fragments);
    if (stopReason === REFUSAL) return { kind: 'error', message: REFUSAL_MESSAGE };
    const answer = collectVerifiedAnswer(content, fragments);
    if (isNoSourceRefusal(answer.text)) return NO_SOURCES;
    if (!answer.hasCitations && !isKnownMedical) {
      log(turn, 'answer has no citations');
      const reply = await classifyTurn(turn, dependencies);
      if (reply.kind === 'conversation') return { kind: 'conversation', reply };
    }
    const recognition = await awaitDoseRecognition(dose);
    return await verifyFragmentAnswer(turn, dependencies, { fragments, answer, stopReason, recognition });
  } catch (error) {
    return failureOutcome(error, turn, withheld(fragments, null));
  } finally {
    dose.abort();
  }
};

const answerWithoutFragments = async (turn: Turn, dependencies: VerifiedDependencies): Promise<TurnOutcome> => {
  const dose = startTurnDoseRecognition(turn, dependencies);
  try {
    await turn.progress.send('answering');
    const { content, stopReason } = await startAnswer(turn, dependencies, []);
    if (stopReason === REFUSAL) return { kind: 'error', message: REFUSAL_MESSAGE };
    const answer = collectVerifiedAnswer(content, []);
    if (isNoSourceRefusal(answer.text) || stopReason !== END_TURN) return NO_SOURCES;
    const recognition = await awaitDoseRecognition(dose);
    const sentences = splitAnswerSentences(answer.text);
    const checked = runDeterministicChecks(answer, sentences, { hasCalculatorRule: hasCalculatorRule(recognition) });
    if (checked.status === 'failed') {
      log(turn, `no_sources check=${checked.check}`);
      return NO_SOURCES;
    }
    const allLines = new Set(sentences.map(({ line }) => line));
    const text = appendToLines(answer.text, allLines, OUTSIDE_PROTOCOLS_LABEL);
    return { kind: 'answer', text, cited: [], webSources: answer.webSources, stopReason: END_TURN, doseEvent: null };
  } catch (error) {
    return failureOutcome(error, turn, NO_SOURCES);
  } finally {
    dose.abort();
  }
};

const resolveTurn = async (turn: Turn, dependencies: VerifiedDependencies): Promise<TurnOutcome> => {
  const fragments = turn.index.search(buildRetrievalQuery(turn.messages));
  if (fragments.length > 0) return answerWithFragments(turn, dependencies, { fragments, isKnownMedical: false });
  try {
    const reply = await classifyTurn(turn, dependencies);
    if (reply.kind === 'conversation') return { kind: 'conversation', reply };
    const query = toRetrievalQuery(reply.retrievalTerms);
    const researched = query ? turn.index.search(query) : [];
    log(turn, `no fragment above threshold, retrieval_terms=${reply.retrievalTerms.length} researched_fragments=${researched.length}`);
    if (researched.length > 0) return await answerWithFragments(turn, dependencies, { fragments: researched, isKnownMedical: true });
    return await answerWithoutFragments(turn, dependencies);
  } catch (error) {
    return failureOutcome(error, turn, NO_SOURCES);
  }
};

const writeDoseEvent = async (sse: SSEStreamingApi, turn: Turn, event: DoseParametersEvent | null): Promise<void> => {
  if (!event) return;
  log(turn, `dose_parameters ${describeDoseParameters(event)}`);
  await writeEvent(sse, 'dose_parameters', event);
};

const writeOutcome = async (sse: SSEStreamingApi, turn: Turn, outcome: TurnOutcome): Promise<void> => {
  await turn.progress.flush();
  if (outcome.kind === 'aborted' || sse.aborted) return;
  if (outcome.kind === 'error') {
    await writeEvent(sse, 'error', { message: outcome.message });
    return;
  }
  if (outcome.kind === 'no_sources') {
    await writeNoSourceAnswer(sse);
    return;
  }
  if (outcome.kind === 'conversation') {
    await writeAnswerWithoutSources(sse, outcome.reply, turn);
    return;
  }
  if (outcome.kind === 'withheld') {
    if (outcome.quotes.length > 0) await writeDoseEvent(sse, turn, outcome.doseEvent);
    await writeEvent(sse, 'delta', { text: [VERIFICATION_FAILED_MESSAGE, ...outcome.quotes.map(({ chunk }) => chunk.content)].join('\n\n') });
    await writeEvent(sse, 'citations', { items: outcome.quotes.map(toCitationItem) });
    await writeEvent(sse, 'done', { stopReason: 'withheld' });
    return;
  }
  if (outcome.cited.length > 0) await writeDoseEvent(sse, turn, outcome.doseEvent);
  if (outcome.text) await writeEvent(sse, 'delta', { text: outcome.text });
  await writeEvent(sse, 'citations', { items: outcome.cited.map(toCitationItem) });
  if (outcome.webSources.length > 0) await writeEvent(sse, 'web_sources', { items: outcome.webSources });
  await writeEvent(sse, 'done', { stopReason: outcome.stopReason });
  log(turn, `answered citations=${outcome.cited.length} web_sources=${outcome.webSources.length}`);
};

export const pipeVerifiedReply = async (sse: SSEStreamingApi, messages: ChatMessage[], dependencies: VerifiedDependencies): Promise<void> => {
  const controller = new AbortController();
  sse.onAbort(() => controller.abort());
  const deadline = setTimeout(() => controller.abort(DEADLINE_EXCEEDED), VERIFIED_TURN_DEADLINE_MS);
  const progress = createProgressWriter(sse);
  try {
    await progress.send('retrieving');
    const index = await loadIndex(sse, dependencies);
    if (!index || sse.aborted) return;
    const turn: Turn = { requestId: randomUUID(), messages, index, signal: controller.signal, progress, startedAt: Date.now() };
    await writeOutcome(sse, turn, await resolveTurn(turn, dependencies));
  } finally {
    clearTimeout(deadline);
  }
};
