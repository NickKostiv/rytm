import Anthropic from '@anthropic-ai/sdk';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../app.js';
import { buildSourceIndex } from '../retrieval/sourceIndex.js';
import type { SourceIndex } from '../retrieval/sourceIndex.js';
import { chunk, row } from '../retrieval/sourceFixtures.js';
import type { GroundedDependencies, GroundedMessage, GroundedStream } from './groundedReply.js';
import { NO_SOURCE_MESSAGE, WITHHELD_EXPLANATION } from './groundedReply.js';

type SseEvent = { event: string; data: Record<string, unknown> };

const TEXT_FRAGMENT = 'Синтетичний протокол гіпотермії: зігрівання, інфузія 0,15 мг/кг.';
const TABLE_FRAGMENT = '| Препарат | Доза |\n| --- | --- |\n| Синтетикол | 0,15 мг/кг |';
const FLAG_LINE = '🟢 GREEN \u2014 відповідь є у протоколі';

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

test('a verified answer is sent as flag, delta, citations, done with moz.gov.ua urls and no flag line in delta', async () => {
  const reply = message([{ type: 'text', text: `${FLAG_LINE}\n`, citations: null }, citedText('Інфузія 0,15 мг/кг.', 0)]);
  const { events } = await postChat(dependencies({ startStream: () => resolvedStream(reply) }), QUESTION);
  assert.deepEqual(events.map(({ event }) => event), ['flag', 'delta', 'citations', 'done']);
  assert.deepEqual(events[0]?.data, { level: 'GREEN', explanation: 'відповідь є у протоколі' });
  const delta = String(events[1]?.data.text);
  assert.equal(delta, 'Інфузія 0,15 мг/кг.');
  assert.ok(!delta.includes('GREEN') && !delta.includes('🟢'));
  const items = events[2]?.data.items;
  assert.ok(Array.isArray(items) && items.length > 0);
  items.forEach((item: unknown) => {
    assert.ok(typeof item === 'object' && item !== null && 'url' in item && typeof item.url === 'string');
    assert.ok(item.url.startsWith('https://moz.gov.ua/'));
  });
});

test('a citation title is the section name, not a repeat of order, date and page', async () => {
  const reply = message([{ type: 'text', text: `${FLAG_LINE}\n`, citations: null }, citedText('Інфузія 0,15 мг/кг.', 0)]);
  const { events } = await postChat(dependencies({ startStream: () => resolvedStream(reply) }), QUESTION);
  const items = events[2]?.data.items;
  assert.ok(Array.isArray(items));
  const [first]: unknown[] = items;
  assert.ok(typeof first === 'object' && first !== null && 'title' in first);
  assert.equal(first.title, 'Синтетичний розділ');
});

test('order numbers and dates from the citation metadata do not verify numbers in the answer', async () => {
  const reply = message([citedText(`${FLAG_LINE}\nЗгідно з наказом № 1000 інфузія 0,15 мг/кг.`, 0)]);
  const { raw, events } = await postChat(dependencies({ startStream: () => resolvedStream(reply) }), QUESTION);
  assert.ok(!raw.includes('№ 1000'));
  assert.deepEqual(events.at(-1)?.data, { stopReason: 'withheld' });
});

test('a text block with digits but no citation withholds the whole answer', async () => {
  const reply = message([{ type: 'text', text: `${FLAG_LINE}\nВвести 0,15 мг/кг `, citations: null }, citedText('зігрівання.', 0)]);
  const { raw, events } = await postChat(dependencies({ startStream: () => resolvedStream(reply) }), QUESTION);
  assert.ok(!raw.includes('Ввести'));
  assert.deepEqual(events.at(-1)?.data, { stopReason: 'withheld' });
});

test('an answer with an unverified number is never visible on the event stream', async () => {
  const reply = message([citedText(`${FLAG_LINE}\nВвести 0,2 мг/кг.`, 0)]);
  const { raw, events } = await postChat(dependencies({ startStream: () => resolvedStream(reply) }), QUESTION);
  assert.ok(!raw.includes('0,2') && !raw.includes('Ввести'));
  assert.deepEqual(events[0]?.data, { level: 'RED', explanation: WITHHELD_EXPLANATION });
  assert.equal(events[1]?.data.text, WITHHELD_EXPLANATION);
  assert.deepEqual(events.at(-1)?.data, { stopReason: 'withheld' });
});

test('a withheld answer that cited a table shows that table verbatim', async () => {
  const fragmentIndex = fixtureIndex().search(QUESTION).findIndex(({ chunk: { type } }) => type === 'table');
  assert.ok(fragmentIndex >= 0);
  const reply = message([citedText(`${FLAG_LINE}\nВвести 0,2 мг/кг.`, fragmentIndex)]);
  const { raw, events } = await postChat(dependencies({ startStream: () => resolvedStream(reply) }), QUESTION);
  assert.ok(!raw.includes('0,2'));
  assert.equal(events[1]?.data.text, TABLE_FRAGMENT);
});

test('a missing flag line becomes RED with an undetermined level', async () => {
  const reply = message([citedText('Зігрівання.', 0)]);
  const { events } = await postChat(dependencies({ startStream: () => resolvedStream(reply) }), QUESTION);
  assert.deepEqual(events[0]?.data, { level: 'RED', explanation: 'Рівень не визначено моделлю' });
  assert.equal(events[1]?.data.text, 'Зігрівання.');
});

test('an answer without citations is replaced by the no-source answer', async () => {
  const reply = message([{ type: 'text', text: `${FLAG_LINE}\nЗігрівання.`, citations: null }]);
  const { events } = await postChat(dependencies({ startStream: () => resolvedStream(reply) }), QUESTION);
  assert.deepEqual(events.map(({ event }) => event), ['flag', 'delta', 'citations', 'done']);
  assert.deepEqual(events[0]?.data, { level: 'RED', explanation: NO_SOURCE_MESSAGE });
  assert.deepEqual(events[2]?.data, { items: [] });
});

test('no fragment above threshold answers RED without calling the model', async () => {
  const { events } = await postChat(dependencies(), 'рецепт борщу');
  assert.deepEqual(events[0]?.data, { level: 'RED', explanation: NO_SOURCE_MESSAGE });
  assert.equal(events[1]?.data.text, NO_SOURCE_MESSAGE);
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
