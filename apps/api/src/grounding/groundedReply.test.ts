import Anthropic from '@anthropic-ai/sdk';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../app.js';
import { buildSourceIndex } from '../retrieval/sourceIndex.js';
import type { SourceIndex } from '../retrieval/sourceIndex.js';
import { chunk, row } from '../retrieval/sourceFixtures.js';
import type { GroundedDependencies, GroundedMessage, GroundedStream } from './groundedReply.js';
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

const dependencies = (overrides: Partial<GroundedDependencies> = {}): GroundedDependencies => ({
  getSourceIndex: async () => fixtureIndex(),
  startStream: () => {
    throw new Error('model must not be called');
  },
  replyWithoutSources: () => {
    throw new Error('conversation reply must not be called');
  },
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

const postChat = async (grounded: GroundedDependencies, question: string): Promise<{ raw: string; events: SseEvent[] }> => {
  const app = createApp(new Anthropic({ apiKey: 'test-key' }), grounded);
  const response = await app.request('/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: question }] }),
  });
  const raw = await response.text();
  return { raw, events: parseSse(raw) };
};

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
  const app = createApp(
    new Anthropic({ apiKey: 'test-key' }),
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
  const app = createApp(
    new Anthropic({ apiKey: 'test-key' }),
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
  const app = createApp(
    new Anthropic({ apiKey: 'test-key' }),
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
