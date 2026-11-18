import Anthropic from '@anthropic-ai/sdk';
import { loadRuleSet, MOH_DOSING_RULES } from '@rytm/dosing';
import type { RuleSet } from '@rytm/dosing';
import type { Hono } from 'hono';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../app.js';
import type { ClassifiedReply, VerifiedStreamRequest } from '../claudeChatStream.js';
import type { StructuredOutput } from '../dosing/doseExtraction.js';
import { chunk, row } from '../retrieval/sourceFixtures.js';
import { buildSourceIndex, createLazySourceIndex } from '../retrieval/sourceIndex.js';
import type { SourceIndex } from '../retrieval/sourceIndex.js';
import { NO_SOURCE_MESSAGE } from './groundedReply.js';
import { OUTSIDE_PROTOCOLS_LABEL, VERIFICATION_FAILED_MESSAGE, VERIFIED_TURN_DEADLINE_MS } from './verifiedReply.js';
import type { VerifiedDependencies, VerifiedMessage, VerifiedStream } from './verifiedReply.js';

type SseEvent = { event: string; data: Record<string, unknown> };

type Verdict = 'supported' | 'contradicted' | 'not_covered';

const ITEM_FRAGMENT = [
  'Синтетичний протокол гіпотермії: зігрівання.',
  '1. Введіть синтетикол (1 мг/мл):',
  'а) дорослі (25 кг або більше) 0,3 мг в/м;',
  'б) діти (менше 25 кг) 0,15 мг в/м.',
  '2. Транспортування.',
].join('\n');
const OTHER_FRAGMENT = 'Синтетичний протокол гіпотермії: зігрівання, інфузія підігрітих розчинів.';
const QUESTION = 'Синтетичне питання: гіпотермія зігрівання синтетикол';
const OFF_BASE_QUESTION = 'рецепт борщу';
const WEB_URL = 'https://example.org/synthetic-instruction';

const fixtureIndex = (): SourceIndex =>
  buildSourceIndex(
    [
      chunk('item', 3, ITEM_FRAGMENT, { headingPath: ['Синтетичний розділ'] }),
      chunk('other', 4, OTHER_FRAGMENT, { headingPath: ['Синтетичний розділ'] }),
      chunk('filler', 9, 'Організація роботи бригади.'),
      chunk('filler', 10, 'Документування виклику.'),
    ],
    [row('item'), row('other'), row('filler')],
  );

const ITEM_INDEX = fixtureIndex()
  .search(QUESTION)
  .findIndex(({ chunk: { id } }) => id === 'item:p3:0');

const mohCited = (text: string, searchResultIndex = ITEM_INDEX): Anthropic.Beta.BetaTextBlock => ({
  type: 'text',
  text,
  citations: [
    {
      type: 'search_result_location',
      cited_text: 'синтетикол',
      source: 'fixture',
      title: null,
      search_result_index: searchResultIndex,
      start_block_index: 0,
      end_block_index: 1,
    },
  ],
});

const webCited = (text: string, citedText: string): Anthropic.Beta.BetaTextBlock => ({
  type: 'text',
  text,
  citations: [{ type: 'web_search_result_location', cited_text: citedText, encrypted_index: 'synthetic', title: 'Синтетична інструкція', url: WEB_URL }],
});

const plain = (text: string): Anthropic.Beta.BetaTextBlock => ({ type: 'text', text, citations: null });

const webResults: Anthropic.Beta.BetaWebSearchToolResultBlock = {
  type: 'web_search_tool_result',
  tool_use_id: 'srvtoolu_synthetic',
  content: [{ type: 'web_search_result', encrypted_content: 'synthetic', page_age: '2026-01-01', title: 'Синтетична інструкція', url: WEB_URL }],
};

const message = (content: Anthropic.Beta.BetaContentBlock[], stopReason: Anthropic.Beta.BetaStopReason = 'end_turn'): VerifiedMessage => ({
  content,
  stop_reason: stopReason,
  container: null,
  usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: null },
});

const streamOf = (reply: VerifiedMessage): VerifiedStream => ({ abort: () => undefined, finalMessage: async () => reply });

const judgeOf =
  (...verdicts: [Verdict, string[]][]): VerifiedDependencies['judge'] =>
  async () => ({
    stopReason: 'end_turn',
    text: JSON.stringify({ sentences: verdicts.map(([verdict, fragmentIds], index) => ({ id: `S${index + 1}`, verdict, fragmentIds })) }),
  });

const NOT_A_DOSE_REQUEST = JSON.stringify({ isDoseRequest: false, drug: null, indication: null, route: null, weightKg: null });

const extractionOf = (fields: Record<string, unknown>): VerifiedDependencies['extractDoseParameters'] => async () => ({
  stopReason: 'end_turn',
  text: JSON.stringify({ isDoseRequest: true, drug: null, indication: null, route: null, weightKg: null, ...fields }),
});

const testRuleSet = async (): Promise<RuleSet> => loadRuleSet(MOH_DOSING_RULES, new Map([['1269-20190605-dod', 'unknown']]));

const dependencies = (overrides: Partial<VerifiedDependencies> = {}): VerifiedDependencies => ({
  getSourceIndex: async () => fixtureIndex(),
  startStream: () => {
    throw new Error('model must not be called');
  },
  classify: () => {
    throw new Error('classifier must not be called');
  },
  judge: () => {
    throw new Error('judge must not be called');
  },
  extractDoseParameters: async () => ({ stopReason: 'end_turn', text: NOT_A_DOSE_REQUEST }),
  getRuleSet: testRuleSet,
  ...overrides,
});

const parseSse = (body: string): SseEvent[] =>
  body
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const lines = block.split('\n');
      const event = lines.find((line) => line.startsWith('event: '))?.slice('event: '.length) ?? '';
      const data: unknown = JSON.parse(lines.find((line) => line.startsWith('data: '))?.slice('data: '.length) ?? '{}');
      assert.ok(typeof data === 'object' && data !== null && !Array.isArray(data));
      return { event, data: Object.fromEntries(Object.entries(data)) };
    });

const createTestApp = (verified: VerifiedDependencies): Hono =>
  createApp(new Anthropic({ apiKey: 'test-key' }), { grounded: null, verified, getRuleSet: verified.getRuleSet });

const postChat = async (verified: VerifiedDependencies, question: string): Promise<{ raw: string; events: SseEvent[] }> => {
  const response = await createTestApp(verified).request('/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: question }] }),
  });
  const raw = await response.text();
  return { raw, events: parseSse(raw) };
};

const names = (events: SseEvent[]): string[] => events.map(({ event }) => event);

const final = (events: SseEvent[]): SseEvent[] => events.filter(({ event }) => event !== 'progress');

const itemIds = (event: SseEvent | undefined): unknown[] => {
  const items = event?.data.items;
  assert.ok(Array.isArray(items));
  return items.map((item: unknown) => (typeof item === 'object' && item !== null && 'id' in item ? item.id : null));
};

const VOLUME_ANSWER = 'Наберіть 0,3 мл: синтетикол «(1 мг/мл)», «дорослі (25 кг або більше) 0,3 мг в/м».';

test('a passing answer goes out after progress stages, unlabelled, with MoH citations and the model stop reason', async () => {
  const { events } = await postChat(
    dependencies({ startStream: () => streamOf(message([mohCited(VOLUME_ANSWER)])), judge: judgeOf(['supported', ['F1']]) }),
    QUESTION,
  );
  assert.deepEqual(names(events), ['progress', 'progress', 'progress', 'delta', 'citations', 'done']);
  assert.deepEqual(
    events.slice(0, 3).map(({ data }) => data.stage),
    ['retrieving', 'answering', 'verifying'],
  );
  assert.equal(events[3]?.data.text, VOLUME_ANSWER);
  assert.deepEqual(itemIds(events[4]), ['item:p3:0']);
  assert.deepEqual(events[5]?.data, { stopReason: 'end_turn' });
});

test('an answer with no supported sentence passes and every not_covered line carries the label', async () => {
  const answer = 'Зігрівання.\nТранспортування теплим.';
  const { events } = await postChat(
    dependencies({
      startStream: () => streamOf(message([mohCited(answer)])),
      judge: judgeOf(['not_covered', []], ['not_covered', []]),
    }),
    QUESTION,
  );
  assert.equal(final(events)[0]?.data.text, `Зігрівання.${OUTSIDE_PROTOCOLS_LABEL}\nТранспортування теплим.${OUTSIDE_PROTOCOLS_LABEL}`);
});

test('a contradicted sentence withholds the answer; the judge sees fragments the answer sentences retrieve, and the contradicting one is quoted first', async () => {
  const answer = 'Інфузія підігрітих розчинів, зігрівання.';
  const { raw, events } = await postChat(
    dependencies({
      startStream: () => streamOf(message([mohCited(answer)])),
      judge: async (input, signal) => {
        const otherId = [...input.matchAll(/<fragment id="(F\d+)"[^>]*>\n([^<]*)\n<\/fragment>/g)].find(([, , content]) => content === OTHER_FRAGMENT)?.[1];
        assert.ok(otherId);
        return judgeOf(['contradicted', [otherId]])(input, signal);
      },
    }),
    QUESTION,
  );
  assert.ok(!raw.includes('Інфузія підігрітих розчинів,'));
  const answerEvents = final(events);
  assert.deepEqual(names(answerEvents), ['delta', 'citations', 'done']);
  assert.equal(answerEvents[0]?.data.text, [VERIFICATION_FAILED_MESSAGE, OTHER_FRAGMENT, ITEM_FRAGMENT].join('\n\n'));
  assert.deepEqual(itemIds(answerEvents[1]), ['other:p4:0', 'item:p3:0']);
  assert.deepEqual(answerEvents[2]?.data, { stopReason: 'withheld' });
});

test('a volume code cannot recompute from a cited dose and concentration withholds the answer before the judge', async () => {
  const { events } = await postChat(
    dependencies({ startStream: () => streamOf(message([mohCited('Наберіть 0,5 мл: «(1 мг/мл)», «0,3 мг в/м».')])) }),
    QUESTION,
  );
  assert.deepEqual(final(events).at(-1)?.data, { stopReason: 'withheld' });
  assert.ok(!events.some(({ data }) => data.stage === 'verifying'));
});

test('a volume bound only to a web citation passes with the web label and a web_sources item', async () => {
  const answer = 'Синтетикол «1 мг/мл», «0,5 мг»: 0,5 мл.';
  const { events } = await postChat(
    dependencies({
      startStream: () => streamOf(message([webResults, webCited(answer, 'Синтетикол 1 мг/мл: 0,5 мг в/м')])),
      judge: judgeOf(['supported', ['F1']]),
    }),
    QUESTION,
  );
  const answerEvents = final(events);
  assert.deepEqual(names(answerEvents), ['delta', 'citations', 'web_sources', 'done']);
  assert.equal(answerEvents[0]?.data.text, `${answer}${OUTSIDE_PROTOCOLS_LABEL}`);
  assert.deepEqual(answerEvents[1]?.data, { items: [] });
  assert.deepEqual(answerEvents[2]?.data, {
    items: [{ id: 'w1', url: WEB_URL, title: 'Синтетична інструкція', domain: 'example.org', pageAge: '2026-01-01' }],
  });
});

test('a number found only in a web cited text passes the number check; outside every source it fails', async () => {
  const passing = dependencies({
    startStream: () => streamOf(message([webCited('Інтервал «кожні 5 хв».', 'синтетикол кожні 5 хв')])),
    judge: judgeOf(['not_covered', []]),
  });
  assert.deepEqual(final((await postChat(passing, QUESTION)).events).at(-1)?.data, { stopReason: 'end_turn' });
  const failing = dependencies({ startStream: () => streamOf(message([webCited('Інтервал «кожні 7 хв».', 'синтетикол кожні 5 хв')])) });
  assert.deepEqual(final((await postChat(failing, QUESTION)).events).at(-1)?.data, { stopReason: 'withheld' });
});

test('calculator precedence: a matched rule fails any volume, no_rule keeps it, a failed extraction counts as matched', async (t) => {
  t.mock.method(console, 'warn', () => undefined);
  const run = (extractDoseParameters: VerifiedDependencies['extractDoseParameters']) =>
    postChat(
      dependencies({
        startStream: () => streamOf(message([mohCited(VOLUME_ANSWER)])),
        judge: judgeOf(['supported', ['F1']]),
        extractDoseParameters,
      }),
      QUESTION,
    );
  const matched = await run(extractionOf({ drug: 'дексаметазон', indication: 'круп', route: 'po', weightKg: null }));
  assert.deepEqual(names(final(matched.events)), ['dose_parameters', 'delta', 'citations', 'done']);
  assert.equal(final(matched.events)[0]?.data.status, 'incomplete');
  assert.deepEqual(final(matched.events).at(-1)?.data, { stopReason: 'withheld' });

  const noRule = await run(extractionOf({ drug: 'other', indication: 'other', route: 'im' }));
  assert.deepEqual(final(noRule.events)[0]?.data, { status: 'no_rule', reason: 'no_rule' });
  assert.deepEqual(final(noRule.events).at(-1)?.data, { stopReason: 'end_turn' });

  const failed = await run(async () => ({ stopReason: 'end_turn', text: 'not json' }));
  assert.deepEqual(final(failed.events).at(-1)?.data, { stopReason: 'withheld' });
});

test('judge API error, invalid output and refusal each withhold the answer, never an error event', async (t) => {
  t.mock.method(console, 'warn', () => undefined);
  const judges: VerifiedDependencies['judge'][] = [
    async () => {
      throw new Anthropic.InternalServerError(500, undefined, 'synthetic', new Headers());
    },
    async () => ({ stopReason: 'end_turn', text: '{"sentences":' }),
    async () => ({ stopReason: 'refusal', text: '' }),
    judgeOf(['supported', []]),
  ];
  for (const judge of judges) {
    const { events } = await postChat(dependencies({ startStream: () => streamOf(message([mohCited(VOLUME_ANSWER)])), judge }), QUESTION);
    assert.deepEqual(final(events).at(-1)?.data, { stopReason: 'withheld' });
  }
});

test('a judge that never settles is cut by the turn deadline and the turn ends withheld with protocol quotes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let judgeSignal: AbortSignal | undefined;
  const pending = postChat(
    dependencies({
      startStream: () => streamOf(message([mohCited(VOLUME_ANSWER)])),
      judge: (_input, signal) => {
        judgeSignal = signal;
        return new Promise<StructuredOutput>(() => undefined);
      },
    }),
    QUESTION,
  );
  let isSettled = false;
  void pending.then(() => (isSettled = true));
  for (let attempt = 0; attempt < 50 && !isSettled; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(VERIFIED_TURN_DEADLINE_MS);
  }
  const { events } = await pending;
  assert.equal(judgeSignal?.aborted, true);
  assert.deepEqual(final(events).at(-1)?.data, { stopReason: 'withheld' });
  assert.ok(String(final(events)[0]?.data.text).startsWith(VERIFICATION_FAILED_MESSAGE));
});

test('pause_turn is resumed with the paused content and container, at most twice; a third pause withholds', async () => {
  const requests: VerifiedStreamRequest[] = [];
  const paused = { ...message([plain('Шукаю.')], 'pause_turn'), container: { id: 'container_synthetic' } };
  const resumed = await postChat(
    dependencies({
      startStream: (request) => {
        requests.push(request);
        return streamOf(requests.length === 1 ? paused : message([mohCited(VOLUME_ANSWER)]));
      },
      judge: judgeOf(['supported', ['F1']]),
    }),
    QUESTION,
  );
  assert.equal(requests.length, 2);
  assert.equal(requests[1]?.containerId, 'container_synthetic');
  assert.deepEqual(requests[1]?.messages.at(-1), { role: 'assistant', content: paused.content });
  assert.deepEqual(final(resumed.events).at(-1)?.data, { stopReason: 'end_turn' });

  const alwaysPaused: VerifiedStreamRequest[] = [];
  const { events } = await postChat(
    dependencies({
      startStream: (request) => {
        alwaysPaused.push(request);
        return streamOf(message([mohCited('Зігрівання.')], 'pause_turn'));
      },
    }),
    QUESTION,
  );
  assert.equal(alwaysPaused.length, 3);
  assert.deepEqual(final(events).at(-1)?.data, { stopReason: 'withheld' });
});

test('a server tool call sends one searching_web progress event', async () => {
  const { events } = await postChat(
    dependencies({
      startStream: (request) => {
        request.onServerToolUse();
        request.onServerToolUse();
        return streamOf(message([mohCited(VOLUME_ANSWER)]));
      },
      judge: judgeOf(['supported', ['F1']]),
    }),
    QUESTION,
  );
  assert.deepEqual(
    events.filter(({ event }) => event === 'progress').map(({ data }) => data.stage),
    ['retrieving', 'answering', 'searching_web', 'verifying'],
  );
});

test('nothing retrieved: the classifier terms drive exactly one re-search, and its fragments reach the answer request', async () => {
  const classified: ClassifiedReply[] = [{ kind: 'medical', retrievalTerms: ['гіпотермія 0,3 мг', 'синтетикол', 'в/м'] }];
  let classifierCalls = 0;
  const requests: VerifiedStreamRequest[] = [];
  const { events } = await postChat(
    dependencies({
      classify: async () => {
        classifierCalls += 1;
        return classified[0] ?? { kind: 'medical', retrievalTerms: [] };
      },
      startStream: (request) => {
        requests.push(request);
        return streamOf(message([plain('Зігрівання.')]));
      },
      judge: judgeOf(['not_covered', []]),
    }),
    OFF_BASE_QUESTION,
  );
  assert.equal(classifierCalls, 1);
  const content = requests[0]?.messages.at(-1)?.content;
  assert.ok(Array.isArray(content));
  assert.ok(content.some((block) => block.type === 'search_result'));
  assert.deepEqual(final(events).at(-1)?.data, { stopReason: 'end_turn' });
});

test('nothing retrieved and a conversation message: the short reply, no re-search and no answer request', async () => {
  const { events } = await postChat(
    dependencies({ classify: async () => ({ kind: 'conversation', text: 'Вітаю! Поставте питання щодо протоколів.' }) }),
    OFF_BASE_QUESTION,
  );
  assert.deepEqual(final(events).at(-1)?.data, { stopReason: 'conversation' });
});

test('nothing found after the re-search: a labelled free answer with empty citations, or no_sources when it fails', async () => {
  const medical = async (): Promise<ClassifiedReply> => ({ kind: 'medical', retrievalTerms: ['ремдесивір'] });
  const passing = await postChat(
    dependencies({ classify: medical, startStream: () => streamOf(message([webResults, webCited('Синтетична порада «вдома».', 'порада вдома')])) }),
    OFF_BASE_QUESTION,
  );
  const answerEvents = final(passing.events);
  assert.deepEqual(names(answerEvents), ['delta', 'citations', 'web_sources', 'done']);
  assert.equal(answerEvents[0]?.data.text, `Синтетична порада «вдома».${OUTSIDE_PROTOCOLS_LABEL}`);
  assert.deepEqual(answerEvents[1]?.data, { items: [] });

  const failing = await postChat(dependencies({ classify: medical, startStream: () => streamOf(message([plain('Ввести 5 мг.')])) }), OFF_BASE_QUESTION);
  assert.deepEqual(final(failing.events).map(({ data }) => data), [{ text: NO_SOURCE_MESSAGE }, { items: [] }, { stopReason: 'no_sources' }]);

  const refused = await postChat(dependencies({ classify: medical, startStream: () => streamOf(message([plain(`${NO_SOURCE_MESSAGE}.`)])) }), OFF_BASE_QUESTION);
  assert.deepEqual(final(refused.events).at(-1)?.data, { stopReason: 'no_sources' });
});

test('empty retrieval terms skip the re-search and the free answer goes out without fragments', async () => {
  const requests: VerifiedStreamRequest[] = [];
  const { events } = await postChat(
    dependencies({
      classify: async () => ({ kind: 'medical', retrievalTerms: ['70', 'в/м'] }),
      startStream: (request) => {
        requests.push(request);
        return streamOf(message([webResults, webCited('Синтетична порада «вдома».', 'порада вдома')]));
      },
    }),
    OFF_BASE_QUESTION,
  );
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0]?.messages.at(-1)?.content, [{ type: 'text', text: OFF_BASE_QUESTION }]);
  assert.deepEqual(final(events).at(-1)?.data, { stopReason: 'end_turn' });
});

test('calculator precedence on the no-fragment path: a matched rule turns a web-bound volume into no_sources, no_rule lets it pass, no card is sent', async (t) => {
  t.mock.method(console, 'warn', () => undefined);
  const answer = 'Синтетикол «1 мг/мл», «0,5 мг»: 0,5 мл.';
  const run = (extractDoseParameters: VerifiedDependencies['extractDoseParameters']) =>
    postChat(
      dependencies({
        classify: async () => ({ kind: 'medical', retrievalTerms: [] }),
        startStream: () => streamOf(message([webResults, webCited(answer, 'Синтетикол 1 мг/мл: 0,5 мг в/м')])),
        extractDoseParameters,
      }),
      OFF_BASE_QUESTION,
    );
  const matched = await run(extractionOf({ drug: 'дексаметазон', indication: 'круп', route: 'po', weightKg: 12 }));
  assert.deepEqual(final(matched.events).map(({ data }) => data), [{ text: NO_SOURCE_MESSAGE }, { items: [] }, { stopReason: 'no_sources' }]);

  const noRule = await run(extractionOf({ drug: 'other', indication: 'other', route: 'im' }));
  assert.deepEqual(names(final(noRule.events)), ['delta', 'citations', 'web_sources', 'done']);
  assert.equal(final(noRule.events)[0]?.data.text, `${answer}${OUTSIDE_PROTOCOLS_LABEL}`);

  const failed = await run(async () => ({ stopReason: 'end_turn', text: 'not json' }));
  assert.deepEqual(final(failed.events).at(-1)?.data, { stopReason: 'no_sources' });
});

test('a withheld answer quotes at most three fragments', async () => {
  const answer = 'Зігрівання.\nОрганізація роботи бригади.\nДокументування виклику.';
  const { events } = await postChat(
    dependencies({
      startStream: () => streamOf(message([mohCited(answer)])),
      judge: async (input, signal) => {
        const fragmentIds = [...input.matchAll(/<fragment id="(F\d+)"/g)].map(([, id = '']) => id);
        assert.ok(fragmentIds.length > 3);
        return judgeOf(['contradicted', fragmentIds], ['not_covered', []], ['not_covered', []])(input, signal);
      },
    }),
    QUESTION,
  );
  const answerEvents = final(events);
  assert.deepEqual(answerEvents.at(-1)?.data, { stopReason: 'withheld' });
  assert.equal(itemIds(answerEvents.find(({ event }) => event === 'citations')).length, 3);
});

test('an empty answer is withheld with quotes when fragments exist and is no_sources without them; the judge is not called', async () => {
  const medical = async (): Promise<ClassifiedReply> => ({ kind: 'medical', retrievalTerms: [] });
  let judgeCalls = 0;
  const countingJudge: VerifiedDependencies['judge'] = async (input, signal) => {
    judgeCalls += 1;
    return judgeOf()(input, signal);
  };
  const withFragments = await postChat(
    dependencies({ classify: medical, startStream: () => streamOf(message([plain('  ')])), judge: countingJudge }),
    QUESTION,
  );
  assert.equal(judgeCalls, 0);
  assert.deepEqual(final(withFragments.events).at(-1)?.data, { stopReason: 'withheld' });
  assert.ok(String(final(withFragments.events)[0]?.data.text).startsWith(VERIFICATION_FAILED_MESSAGE));
  const withoutFragments = await postChat(dependencies({ classify: medical, startStream: () => streamOf(message([plain('')])) }), OFF_BASE_QUESTION);
  assert.deepEqual(final(withoutFragments.events).at(-1)?.data, { stopReason: 'no_sources' });
});

test('the no-fragment path past the turn deadline ends as no_sources, never as an answer', async (t) => {
  t.mock.method(console, 'warn', () => undefined);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = postChat(
    dependencies({
      classify: async () => ({ kind: 'medical', retrievalTerms: [] }),
      startStream: () => streamOf(message([webResults, webCited('Синтетична порада «вдома».', 'порада вдома')])),
      extractDoseParameters: () => new Promise<StructuredOutput>(() => undefined),
    }),
    OFF_BASE_QUESTION,
  );
  let isSettled = false;
  void pending.then(() => (isSettled = true));
  for (let attempt = 0; attempt < 50 && !isSettled; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(VERIFIED_TURN_DEADLINE_MS);
  }
  const { events } = await pending;
  assert.deepEqual(final(events).at(-1)?.data, { stopReason: 'no_sources' });
});

test('an API error on the no-fragment path is an error event, never no_sources', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  const apiError = new Anthropic.BadRequestError(400, undefined, 'synthetic', new Headers());
  const failingStream: VerifiedStream = { abort: () => undefined, finalMessage: async () => Promise.reject(apiError) };
  const answerFails = await postChat(
    dependencies({ classify: async () => ({ kind: 'medical', retrievalTerms: [] }), startStream: () => failingStream }),
    OFF_BASE_QUESTION,
  );
  assert.deepEqual(names(final(answerFails.events)), ['error']);
  const classifierFails = await postChat(dependencies({ classify: async () => Promise.reject(apiError) }), OFF_BASE_QUESTION);
  assert.deepEqual(names(final(classifierFails.events)), ['error']);
});

test('owner acceptance case on the real source base: rewrite retrieves 3.4, the 0,3 мл answer from page 64 passes', async () => {
  const index = await createLazySourceIndex()();
  const ownerQuestion = 'Пацієнт 70 років, після антибіотика почалась анафілаксія, скільки мл адреналіну набрати в м’яз?';
  const page64Index = index.search('анафілаксія епінефрин').findIndex(({ chunk: { id } }) => id === '1269-20190605-dod:p64:0');
  assert.ok(page64Index >= 0);
  const answer = 'Наберіть 0,3 мл: протокол — епінефрин «(1 мг/мл)», «дорослі (25 кг або більше) 0,3 мг в/м в верхньо-зовнішню поверхню стегна».';
  const { events } = await postChat(
    dependencies({
      getSourceIndex: async () => index,
      classify: async () => ({ kind: 'medical', retrievalTerms: ['анафілаксія', 'епінефрин'] }),
      startStream: () => streamOf(message([mohCited(answer, page64Index)])),
      judge: judgeOf(['supported', ['F1']]),
      extractDoseParameters: extractionOf({ drug: 'other', indication: 'other', route: 'im' }),
    }),
    ownerQuestion,
  );
  const answerEvents = final(events);
  assert.deepEqual(names(answerEvents), ['dose_parameters', 'delta', 'citations', 'done']);
  assert.equal(answerEvents[1]?.data.text, answer);
  assert.deepEqual(itemIds(answerEvents[2]), ['1269-20190605-dod:p64:0']);
  assert.deepEqual(answerEvents[3]?.data, { stopReason: 'end_turn' });
});

test('a model refusal of the answer is an error event', async () => {
  const { events } = await postChat(dependencies({ startStream: () => streamOf(message([], 'refusal')) }), QUESTION);
  assert.deepEqual(names(final(events)), ['error']);
});

test('patient age, weight, the answer text and web cited text never reach the server logs', async (t) => {
  const logged: string[] = [];
  const capture = (...parts: unknown[]): void => {
    logged.push(parts.map(String).join(' '));
  };
  t.mock.method(console, 'log', capture);
  t.mock.method(console, 'warn', capture);
  t.mock.method(console, 'error', capture);
  const question = `${QUESTION}, пацієнт 67 років, вага 23,45 кг`;
  const runs: Partial<VerifiedDependencies>[] = [
    { startStream: () => streamOf(message([mohCited(VOLUME_ANSWER)])), judge: judgeOf(['supported', ['F1']]) },
    { startStream: () => streamOf(message([mohCited(VOLUME_ANSWER)])), judge: judgeOf(['contradicted', ['F1']]) },
    { startStream: () => streamOf(message([webResults, webCited('Синтетична порада «вдома».', 'порада вдома')])), judge: judgeOf(['not_covered', []]) },
  ];
  for (const overrides of runs) await postChat(dependencies({ extractDoseParameters: extractionOf({ weightKg: 23.45 }), ...overrides }), question);
  assert.ok(logged.length > 0);
  const forbidden = ['23,45', '23.45', 'років', 'рок', 'Наберіть', 'синтетикол', 'порада', WEB_URL, 'example.org'];
  logged.forEach((line) => forbidden.forEach((value) => assert.ok(!line.includes(value), `log line contains ${value}`)));
});
