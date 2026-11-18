import Anthropic from '@anthropic-ai/sdk';
import { calculateDose, loadRuleSet, MOH_DOSING_RULES } from '@rytm/dosing';
import type { RuleSet } from '@rytm/dosing';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../app.js';
import type { Hono } from 'hono';
import { buildSourceIndex } from '../retrieval/sourceIndex.js';
import type { SourceIndex } from '../retrieval/sourceIndex.js';
import { chunk, row } from '../retrieval/sourceFixtures.js';
import type { GroundedDependencies, GroundedMessage, GroundedStream } from './groundedReply.js';
import { DOSE_PARAMETERS_GRACE_MS } from '../dosing/recogniseDoseParameters.js';
import { NO_SOURCE_MESSAGE, WITHHELD_MESSAGE } from './groundedReply.js';

type SseEvent = { event: string; data: Record<string, unknown> };

const TEXT_FRAGMENT = 'Синтетичний протокол гіпотермії: зігрівання, інфузія 0,15 мг/кг.';
const TABLE_FRAGMENT = '| Препарат | Доза |\n| --- | --- |\n| Синтетикол | 0,15 мг/кг |';

const fixtureIndex = (): SourceIndex =>
  buildSourceIndex(
    [
      chunk('text', 3, TEXT_FRAGMENT, { headingPath: ['Синтетичний розділ'] }),
      chunk('table', 4, TABLE_FRAGMENT, { type: 'table', headingPath: ['Синтетичний протокол гіпотермії: зігрівання, інфузія'] }),
      chunk('other', 9, 'Організація роботи бригади.'),
      chunk('other', 10, 'Транспортування пацієнта.'),
    ],
    [row('text'), row('table'), row('other')],
  );

const citedText = (text: string, searchResultIndex: number): Anthropic.Beta.BetaTextBlock => ({
  type: 'text',
  text,
  citations: [
    {
      type: 'search_result_location',
      cited_text: 'синтетичний',
      source: 'fixture',
      title: null,
      search_result_index: searchResultIndex,
      start_block_index: 0,
      end_block_index: 1,
    },
  ],
});

const message = (content: Anthropic.Beta.BetaContentBlock[]): GroundedMessage => ({
  content,
  stop_reason: 'end_turn',
  usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
});

const resolvedStream = (reply: GroundedMessage): GroundedStream => ({ abort: () => undefined, finalMessage: async () => reply });

const testRuleSet = async (): Promise<RuleSet> => loadRuleSet(MOH_DOSING_RULES, new Map([['1269-20190605-dod', 'unknown']]));

const NOT_A_DOSE_REQUEST = JSON.stringify({ isDoseRequest: false, drug: null, indication: null, route: null, weightKg: null });

const dependencies = (overrides: Partial<GroundedDependencies> = {}): GroundedDependencies => ({
  getSourceIndex: async () => fixtureIndex(),
  startStream: () => {
    throw new Error('model must not be called');
  },
  replyWithoutSources: () => {
    throw new Error('conversation reply must not be called');
  },
  extractDoseParameters: async () => ({ stopReason: 'end_turn', text: NOT_A_DOSE_REQUEST }),
  getRuleSet: testRuleSet,
  ...overrides,
});

const createTestApp = (grounded: GroundedDependencies): Hono =>
  createApp(new Anthropic({ apiKey: 'test-key' }), { grounded, getRuleSet: grounded.getRuleSet });

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

type ChatTurn = { role: 'user' | 'assistant'; content: string };

const postJson = (app: Hono, path: string, body: unknown): Promise<Response> =>
  Promise.resolve(app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

const postChatHistory = async (app: Hono, messages: ChatTurn[]): Promise<{ raw: string; events: SseEvent[] }> => {
  const raw = await (await postJson(app, '/chat', { messages })).text();
  return { raw, events: parseSse(raw) };
};

const postChat = (grounded: GroundedDependencies, question: string): Promise<{ raw: string; events: SseEvent[] }> =>
  postChatHistory(createTestApp(grounded), [{ role: 'user', content: question }]);

const QUESTION = 'Синтетичне питання: гіпотермія зігрівання інфузія';
const OFF_BASE_QUESTION = 'рецепт борщу';
const CONVERSATION_TEXT = 'Вітаю! Поставте питання щодо протоколів.';

test('a verified answer is sent as delta, citations, done with moz.gov.ua urls and the model text unchanged', async () => {
  const reply = message([{ type: 'text', text: 'Зігрівання.\n', citations: null }, citedText('Інфузія 0,15 мг/кг.', 0)]);
  const { events } = await postChat(dependencies({ startStream: () => resolvedStream(reply) }), QUESTION);
  assert.deepEqual(events.map(({ event }) => event), ['delta', 'citations', 'done']);
  assert.equal(events[0]?.data.text, 'Зігрівання.\nІнфузія 0,15 мг/кг.');
  const items = events[1]?.data.items;
  assert.ok(Array.isArray(items) && items.length > 0);
  items.forEach((item: unknown) => {
    assert.ok(typeof item === 'object' && item !== null && 'url' in item && typeof item.url === 'string');
    assert.ok(item.url.startsWith('https://moz.gov.ua/'));
  });
});

test('a citation title is the section name, not a repeat of order, date and page', async () => {
  const reply = message([citedText('Інфузія 0,15 мг/кг.', 0)]);
  const { events } = await postChat(dependencies({ startStream: () => resolvedStream(reply) }), QUESTION);
  const items = events[1]?.data.items;
  assert.ok(Array.isArray(items));
  const [first]: unknown[] = items;
  assert.ok(typeof first === 'object' && first !== null && 'title' in first);
  assert.equal(first.title, 'Синтетичний розділ');
});

test('order numbers and dates from the citation metadata do not verify numbers in the answer', async () => {
  const reply = message([citedText('Згідно з наказом № 1000 інфузія 0,15 мг/кг.', 0)]);
  const { raw, events } = await postChat(dependencies({ startStream: () => resolvedStream(reply) }), QUESTION);
  assert.ok(!raw.includes('№ 1000'));
  assert.deepEqual(events.at(-1)?.data, { stopReason: 'withheld' });
});

test('a text block with digits but no citation withholds the whole answer', async () => {
  const reply = message([{ type: 'text', text: 'Ввести 0,15 мг/кг ', citations: null }, citedText('зігрівання.', 0)]);
  const { raw, events } = await postChat(dependencies({ startStream: () => resolvedStream(reply) }), QUESTION);
  assert.ok(!raw.includes('Ввести'));
  assert.deepEqual(events.at(-1)?.data, { stopReason: 'withheld' });
});

test('an answer with an unverified number is never visible on the event stream', async () => {
  const reply = message([citedText('Ввести 0,2 мг/кг.', 0)]);
  const { raw, events } = await postChat(dependencies({ startStream: () => resolvedStream(reply) }), QUESTION);
  assert.ok(!raw.includes('0,2') && !raw.includes('Ввести'));
  assert.deepEqual(events.map(({ event }) => event), ['delta', 'citations', 'done']);
  assert.equal(events[0]?.data.text, WITHHELD_MESSAGE);
  assert.deepEqual(events.at(-1)?.data, { stopReason: 'withheld' });
});

test('a withheld answer shows cited tables verbatim and lists every cited fragment as a source', async () => {
  const fragments = fixtureIndex().search(QUESTION);
  const tableIndex = fragments.findIndex(({ chunk: { type } }) => type === 'table');
  const textIndex = fragments.findIndex(({ chunk: { type } }) => type === 'text');
  assert.ok(tableIndex >= 0 && textIndex >= 0);
  const reply = message([citedText('Ввести 0,2 мг/кг.', tableIndex), citedText(' Зігрівання.', textIndex)]);
  const { raw, events } = await postChat(dependencies({ startStream: () => resolvedStream(reply) }), QUESTION);
  assert.ok(!raw.includes('0,2'));
  assert.equal(events[0]?.data.text, `${WITHHELD_MESSAGE}\n\n${TABLE_FRAGMENT}`);
  const items = events[1]?.data.items;
  assert.ok(Array.isArray(items));
  assert.deepEqual(
    items.map((item: unknown) => (typeof item === 'object' && item !== null && 'id' in item ? item.id : null)).sort(),
    ['table:p4:0', 'text:p3:0'],
  );
});

test('an uncited answer to a medical message is replaced by the no-source answer', async () => {
  const reply = message([{ type: 'text', text: 'Зігрівання.', citations: null }]);
  const grounded = dependencies({ startStream: () => resolvedStream(reply), replyWithoutSources: async () => ({ kind: 'medical' }) });
  const { events } = await postChat(grounded, QUESTION);
  assert.deepEqual(events.map(({ event }) => event), ['delta', 'citations', 'done']);
  assert.equal(events[0]?.data.text, NO_SOURCE_MESSAGE);
  assert.deepEqual(events[1]?.data, { items: [] });
  assert.deepEqual(events.at(-1)?.data, { stopReason: 'no_sources' });
});

test('an uncited answer to a conversation message is replaced by the conversation reply', async () => {
  const reply = message([{ type: 'text', text: 'Зігрівання.', citations: null }]);
  const grounded = dependencies({
    startStream: () => resolvedStream(reply),
    replyWithoutSources: async () => ({ kind: 'conversation', text: CONVERSATION_TEXT }),
  });
  const { events } = await postChat(grounded, QUESTION);
  assert.equal(events[0]?.data.text, CONVERSATION_TEXT);
  assert.deepEqual(events[1]?.data, { items: [] });
  assert.deepEqual(events.at(-1)?.data, { stopReason: 'conversation' });
});

test('no fragment above threshold and a medical message answer with the no-source message without the grounded model', async () => {
  const grounded = dependencies({ replyWithoutSources: async () => ({ kind: 'medical' }) });
  const { events } = await postChat(grounded, OFF_BASE_QUESTION);
  assert.deepEqual(events.map(({ event }) => event), ['delta', 'citations', 'done']);
  assert.equal(events[0]?.data.text, NO_SOURCE_MESSAGE);
  assert.deepEqual(events[1]?.data, { items: [] });
  assert.deepEqual(events.at(-1)?.data, { stopReason: 'no_sources' });
});

test('no fragment above threshold and a conversation message answer with the conversation text and no citations', async () => {
  let receivedMessages: unknown;
  const grounded = dependencies({
    replyWithoutSources: async (messages) => {
      receivedMessages = messages;
      return { kind: 'conversation', text: CONVERSATION_TEXT };
    },
  });
  const { events } = await postChat(grounded, OFF_BASE_QUESTION);
  assert.deepEqual(receivedMessages, [{ role: 'user', content: OFF_BASE_QUESTION }]);
  assert.deepEqual(events.map(({ event }) => event), ['delta', 'citations', 'done']);
  assert.equal(events[0]?.data.text, CONVERSATION_TEXT);
  assert.deepEqual(events[1]?.data, { items: [] });
  assert.deepEqual(events.at(-1)?.data, { stopReason: 'conversation' });
});

test('a conversation reply with a number is replaced by the no-source answer', async () => {
  const grounded = dependencies({ replyWithoutSources: async () => ({ kind: 'conversation', text: 'Синтетична відповідь 5 мг.' }) });
  const { raw, events } = await postChat(grounded, OFF_BASE_QUESTION);
  assert.ok(!raw.includes('Синтетична відповідь'));
  assert.equal(events[0]?.data.text, NO_SOURCE_MESSAGE);
  assert.deepEqual(events[1]?.data, { items: [] });
  assert.deepEqual(events.at(-1)?.data, { stopReason: 'no_sources' });
});

test('a conversation reply that matches the source base is replaced by the no-source answer', async () => {
  const grounded = dependencies({ replyWithoutSources: async () => ({ kind: 'conversation', text: 'Гіпотермія: зігрівання та інфузія.' }) });
  const { raw, events } = await postChat(grounded, OFF_BASE_QUESTION);
  assert.ok(!raw.includes('Гіпотермія'));
  assert.equal(events[0]?.data.text, NO_SOURCE_MESSAGE);
  assert.deepEqual(events.at(-1)?.data, { stopReason: 'no_sources' });
});

test('a failed conversation reply yields a Ukrainian error event and no answer', async () => {
  const grounded = dependencies({
    replyWithoutSources: async () => {
      throw new Error('synthetic failure');
    },
  });
  const { events } = await postChat(grounded, OFF_BASE_QUESTION);
  assert.deepEqual(events.map(({ event }) => event), ['error']);
  assert.match(String(events[0]?.data.message), /[а-яіїєґ]/i);
});

test('client disconnect aborts the conversation reply and writes no error', async (t) => {
  const consoleError = t.mock.method(console, 'error', () => undefined);
  let receivedSignal: AbortSignal | undefined;
  let markStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => (markStarted = resolve));
  const app = createTestApp(
    dependencies({
      replyWithoutSources: (_messages, signal) => {
        receivedSignal = signal;
        markStarted();
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Anthropic.APIUserAbortError())));
      },
    }),
  );
  const response = await app.request('/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: OFF_BASE_QUESTION }] }),
  });
  await started;
  await response.body?.cancel();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(receivedSignal?.aborted, true);
  assert.equal(consoleError.mock.callCount(), 0);
});

test('a source base failure yields a Ukrainian error event and no answer', async () => {
  const failing = dependencies({
    getSourceIndex: async () => {
      throw new Error('synthetic failure');
    },
  });
  const { events } = await postChat(failing, QUESTION);
  assert.deepEqual(events.map(({ event }) => event), ['error']);
  assert.match(String(events[0]?.data.message), /[а-яіїєґ]/i);
});

test('client disconnect aborts the Claude request', async () => {
  let isAborted = false;
  let rejectPending: (error: unknown) => void = () => undefined;
  const pendingStream: GroundedStream = {
    abort: () => {
      isAborted = true;
      rejectPending(new Anthropic.APIUserAbortError());
    },
    finalMessage: () => new Promise((_, reject) => (rejectPending = reject)),
  };
  let markStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => (markStarted = resolve));
  const app = createTestApp(
    dependencies({
      startStream: () => {
        markStarted();
        return pendingStream;
      },
    }),
  );
  const response = await app.request('/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: QUESTION }] }),
  });
  await started;
  await response.body?.cancel();
  assert.equal(isAborted, true);
});

test('client disconnect while the source base loads never starts the Claude request', async () => {
  let isStreamStarted = false;
  let releaseIndex: () => void = () => undefined;
  const indexGate = new Promise<void>((resolve) => (releaseIndex = resolve));
  let markLoading: () => void = () => undefined;
  const loading = new Promise<void>((resolve) => (markLoading = resolve));
  const app = createTestApp(
    dependencies({
      getSourceIndex: async () => {
        markLoading();
        await indexGate;
        return fixtureIndex();
      },
      startStream: (messages) => {
        isStreamStarted = true;
        return resolvedStream(message([citedText(String(messages.length), 0)]));
      },
    }),
  );
  const response = await app.request('/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: QUESTION }] }),
  });
  await loading;
  await response.body?.cancel();
  releaseIndex();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(isStreamStarted, false);
});

const DOSE_QUESTION = 'Синтетичний пацієнт: дексаметазон перорально при крупі, дитина 12 кг';

const doseHistory = (question = DOSE_QUESTION): ChatTurn[] => [
  { role: 'user', content: question },
  { role: 'assistant', content: 'Синтетична попередня відповідь.' },
  { role: 'user', content: QUESTION },
];

const extractionOf = (fields: Record<string, unknown>): GroundedDependencies['extractDoseParameters'] => async () => ({
  stopReason: 'end_turn',
  text: JSON.stringify({ isDoseRequest: true, drug: null, indication: null, route: null, weightKg: null, ...fields }),
});

const CROUP_PO_12 = { drug: 'дексаметазон', indication: 'круп', route: 'po', weightKg: 12 };

const verifiedReply = (): GroundedStream => resolvedStream(message([citedText('Інфузія 0,15 мг/кг.', 0)]));

test('a dose request sends dose_parameters before the answer, and /dose for it equals calculateDose', async () => {
  const grounded = dependencies({ startStream: verifiedReply, extractDoseParameters: extractionOf(CROUP_PO_12) });
  const app = createTestApp(grounded);
  const { events } = await postChatHistory(app, doseHistory());
  assert.deepEqual(events.map(({ event }) => event), ['dose_parameters', 'delta', 'citations', 'done']);
  const parameters = events[0]?.data;
  assert.equal(parameters?.status, 'confirm');
  assert.equal(parameters?.ruleId, 'dexamethasone-croup-po');
  assert.equal(parameters?.weightKg, 12);
  assert.equal(events[1]?.data.text, 'Інфузія 0,15 мг/кг.');

  const response = await postJson(app, '/dose', { ruleId: parameters?.ruleId, weightKg: parameters?.weightKg });
  const body: unknown = await response.json();
  const outcome = calculateDose(await testRuleSet(), { drug: 'дексаметазон', indication: 'круп', route: 'po', weightKg: 12 });
  assert.equal(response.status, 200);
  assert.ok(outcome.kind === 'dose' && typeof body === 'object' && body !== null);
  const expected: unknown = JSON.parse(JSON.stringify(outcome));
  assert.deepEqual(Object.fromEntries(Object.entries(body).filter(([key]) => key in outcome)), expected);
});

test('a missing weight gives an incomplete card asking for it and no dose number on the stream', async () => {
  const grounded = dependencies({
    startStream: verifiedReply,
    extractDoseParameters: extractionOf({ ...CROUP_PO_12, weightKg: null }),
  });
  const { raw, events } = await postChatHistory(createTestApp(grounded), doseHistory('Синтетичний пацієнт: дексаметазон перорально при крупі, яка доза?'));
  assert.deepEqual(events[0], {
    event: 'dose_parameters',
    data: {
      status: 'incomplete',
      ruleId: 'dexamethasone-croup-po',
      weightKg: null,
      missing: ['weight'],
      candidates: events[0]?.data.candidates,
    },
  });
  assert.ok(!raw.includes('doseMg') && !raw.includes('7.2') && !raw.includes('7,2'));
});

test('a weight the user did not write is dropped and asked for', async () => {
  const grounded = dependencies({ startStream: verifiedReply, extractDoseParameters: extractionOf({ ...CROUP_PO_12, weightKg: 14 }) });
  const { events } = await postChatHistory(createTestApp(grounded), doseHistory());
  assert.equal(events[0]?.data.weightKg, null);
  assert.deepEqual(events[0]?.data.missing, ['weight']);
});

test('a drug with no approved rule gives a no_rule card with no number', async () => {
  const grounded = dependencies({
    startStream: verifiedReply,
    extractDoseParameters: extractionOf({ drug: 'other', indication: 'other', route: 'im', weightKg: 12 }),
  });
  const { events } = await postChatHistory(createTestApp(grounded), doseHistory());
  assert.deepEqual(events.map(({ event }) => event), ['dose_parameters', 'delta', 'citations', 'done']);
  assert.deepEqual(events[0]?.data, { status: 'no_rule', reason: 'no_rule' });
});

test('the answer text next to a card still goes through the number check, and the weight never verifies it', async () => {
  const reply = message([citedText('Дитині 12 кг ввести 0,15 мг/кг.', 0)]);
  const grounded = dependencies({ startStream: () => resolvedStream(reply), extractDoseParameters: extractionOf(CROUP_PO_12) });
  const { raw, events } = await postChatHistory(createTestApp(grounded), doseHistory());
  assert.deepEqual(events.map(({ event }) => event), ['dose_parameters', 'delta', 'citations', 'done']);
  assert.ok(!raw.includes('Дитині'));
  assert.equal(events[1]?.data.text, WITHHELD_MESSAGE);
  assert.deepEqual(events.at(-1)?.data, { stopReason: 'withheld' });
});

test('no card next to a no-source answer', async () => {
  const reply = message([{ type: 'text', text: 'Зігрівання.', citations: null }]);
  const grounded = dependencies({
    startStream: () => resolvedStream(reply),
    replyWithoutSources: async () => ({ kind: 'medical' }),
    extractDoseParameters: extractionOf(CROUP_PO_12),
  });
  const { events } = await postChatHistory(createTestApp(grounded), doseHistory());
  assert.deepEqual(events.map(({ event }) => event), ['delta', 'citations', 'done']);
  assert.deepEqual(events.at(-1)?.data, { stopReason: 'no_sources' });
});

test('a failed or invalid extraction sends no card and leaves the cited answer intact', async (t) => {
  const consoleWarn = t.mock.method(console, 'warn', () => undefined);
  const failures: GroundedDependencies['extractDoseParameters'][] = [
    async () => {
      throw new Anthropic.InternalServerError(500, undefined, 'synthetic', new Headers());
    },
    async () => ({ stopReason: 'max_tokens', text: '{"isDoseRequest":true' }),
    async () => ({ stopReason: 'end_turn', text: 'not json' }),
  ];
  for (const extractDoseParameters of failures) {
    const { events } = await postChatHistory(createTestApp(dependencies({ startStream: verifiedReply, extractDoseParameters })), doseHistory());
    assert.deepEqual(events.map(({ event }) => event), ['delta', 'citations', 'done']);
  }
  assert.equal(consoleWarn.mock.callCount(), failures.length);
});

test('a rule set that fails to load sends no card in /chat', async (t) => {
  t.mock.method(console, 'warn', () => undefined);
  const grounded = dependencies({
    startStream: verifiedReply,
    extractDoseParameters: extractionOf(CROUP_PO_12),
    getRuleSet: async () => {
      throw new Error('synthetic failure');
    },
  });
  const { events } = await postChatHistory(createTestApp(grounded), doseHistory());
  assert.deepEqual(events.map(({ event }) => event), ['delta', 'citations', 'done']);
});

test('client disconnect aborts the extraction request', async () => {
  let extractionSignal: AbortSignal | undefined;
  let markStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => (markStarted = resolve));
  let rejectPending: (error: unknown) => void = () => undefined;
  const pendingStream: GroundedStream = {
    abort: () => rejectPending(new Anthropic.APIUserAbortError()),
    finalMessage: () => new Promise((_, reject) => (rejectPending = reject)),
  };
  const app = createTestApp(
    dependencies({
      startStream: () => pendingStream,
      extractDoseParameters: (_messages, signal) => {
        extractionSignal = signal;
        markStarted();
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Anthropic.APIUserAbortError())));
      },
    }),
  );
  const response = await postJson(app, '/chat', { messages: doseHistory() });
  await started;
  await response.body?.cancel();
  assert.equal(extractionSignal?.aborted, true);
});

test('age, weight and the calculated dose never reach the server logs', async (t) => {
  const logged: string[] = [];
  const capture = (...parts: unknown[]): void => {
    logged.push(parts.map(String).join(' '));
  };
  t.mock.method(console, 'log', capture);
  t.mock.method(console, 'warn', capture);
  t.mock.method(console, 'error', capture);
  const question = 'Синтетичний пацієнт 7 років: дексаметазон перорально при крупі, вага 23,45 кг';
  const grounded = dependencies({ startStream: verifiedReply, extractDoseParameters: extractionOf({ ...CROUP_PO_12, weightKg: 23.45 }) });
  const app = createTestApp(grounded);
  const { events } = await postChatHistory(app, doseHistory(question));
  assert.equal(events[0]?.data.weightKg, 23.45);
  const doseBody: unknown = await (await postJson(app, '/dose', { ruleId: 'dexamethasone-croup-po', weightKg: 23.45 })).json();
  assert.ok(typeof doseBody === 'object' && doseBody !== null && 'doseMg' in doseBody && doseBody.doseMg === '14.07');
  await postJson(app, '/dose', { ruleId: 'dexamethasone-croup-po', weightKg: 350.5 });
  assert.ok(logged.length > 0);
  const forbidden = ['23.45', '23,45', '350.5', '350,5', '14.07', '14,07', 'рок', DOSE_QUESTION];
  logged.forEach((line) => forbidden.forEach((value) => assert.ok(!line.includes(value), `log line contains ${value}`)));
});

test('an extraction that never settles is aborted after the grace period and the answer goes out without a card', async (t) => {
  const consoleWarn = t.mock.method(console, 'warn', () => undefined);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let extractionSignal: AbortSignal | undefined;
  const grounded = dependencies({
    startStream: verifiedReply,
    extractDoseParameters: (_messages, signal) => {
      extractionSignal = signal;
      return new Promise(() => undefined);
    },
  });
  let isSettled = false;
  const pending = postChatHistory(createTestApp(grounded), doseHistory());
  void pending.then(() => (isSettled = true));
  for (let attempt = 0; attempt < 50 && !isSettled; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(DOSE_PARAMETERS_GRACE_MS);
  }
  const { events } = await pending;
  assert.deepEqual(events.map(({ event }) => event), ['delta', 'citations', 'done']);
  assert.equal(extractionSignal?.aborted, true);
  assert.match(String(consoleWarn.mock.calls[0]?.arguments[0]), /dose_parameters=failed error=timeout$/);
});

test('the extraction is aborted as soon as the answer turns out uncited', async () => {
  let extractionSignal: AbortSignal | undefined;
  let isAbortedBeforeConversationReply: boolean | undefined;
  const grounded = dependencies({
    startStream: () => resolvedStream(message([{ type: 'text', text: 'Зігрівання.', citations: null }])),
    extractDoseParameters: (_messages, signal) => {
      extractionSignal = signal;
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Anthropic.APIUserAbortError())));
    },
    replyWithoutSources: async () => {
      isAbortedBeforeConversationReply = extractionSignal?.aborted;
      return { kind: 'medical' };
    },
  });
  const { events } = await postChatHistory(createTestApp(grounded), doseHistory());
  assert.equal(isAbortedBeforeConversationReply, true);
  assert.deepEqual(events.at(-1)?.data, { stopReason: 'no_sources' });
});
