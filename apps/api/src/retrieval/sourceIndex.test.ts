import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SourceChunk } from '../sources/sourceChunks.js';
import { buildSourceIndex, loadSourceIndex } from './sourceIndex.js';
import { chunk, row } from './sourceFixtures.js';

const FILLER = ['Організація роботи бригади.', 'Транспортування пацієнта.', 'Документування виклику.'];

const fillerChunks = (documentId: string): SourceChunk[] =>
  FILLER.map((content, index) => chunk(documentId, 100 + index, content));

const documentIds = (fragments: ReturnType<ReturnType<typeof buildSourceIndex>['search']>): string[] =>
  [...new Set(fragments.map(({ row: { id } }) => id))].sort();

test('excludes needs_review, superseded, chunks with warnings and stale chunks; keeps unknown and in_force', () => {
  const text = 'Синтетичний протокол: гіпотермія, зігрівання пацієнта.';
  const index = buildSourceIndex(
    [
      chunk('unknown', 1, text),
      chunk('inforce', 1, text),
      chunk('review', 1, text),
      chunk('superseded', 1, text),
      chunk('warned', 1, text, { warnings: ['text run crosses a column border'] }),
      chunk('stale', 1, text, { sourceSha256: 'old' }),
      ...fillerChunks('unknown'),
    ],
    [row('unknown'), row('inforce', 'in_force'), row('review', 'needs_review'), row('superseded', 'superseded'), row('warned'), row('stale')],
  );
  assert.deepEqual(documentIds(index.search('гіпотермія зігрівання')), ['inforce', 'unknown']);
});

test('returns fragments from every relevant document, not only the best one', () => {
  const index = buildSourceIndex(
    [
      chunk('a', 1, 'Синтетичний текст: гіперкаліємія, лікування гіперкаліємії, кальцій.'),
      chunk('b', 2, 'Синтетичний текст: гіперкаліємія, лікування.'),
      ...fillerChunks('c'),
    ],
    [row('a'), row('b'), row('c')],
  );
  assert.deepEqual(documentIds(index.search('гіперкаліємія лікування')), ['a', 'b']);
});

test('off-topic question returns nothing', () => {
  const index = buildSourceIndex([chunk('a', 1, 'Синтетичний текст про опіки.'), ...fillerChunks('a')], [row('a')]);
  assert.deepEqual(index.search('рецепт борщу'), []);
});

test('Latin homoglyphs, word endings and drug synonyms are folded', () => {
  const index = buildSourceIndex([chunk('a', 1, 'Бригада ЕМД вводить епінефрину розчин.'), ...fillerChunks('b')], [row('a'), row('b')]);
  assert.deepEqual(documentIds(index.search('EMД адреналін')), ['a']);
});

test('patient age and weight in the query do not filter out the matching section', () => {
  const index = buildSourceIndex(
    [chunk('a', 1, 'Синтетичний текст: анафілаксія, дозування епінефрину 0,5 мг в/м.'), ...fillerChunks('b')],
    [row('a'), row('b')],
  );
  const expected = index.search('дозування адреналіну при анафілаксії');
  assert.deepEqual(documentIds(expected), ['a']);
  assert.deepEqual(index.search('дозування адреналіну 20 років 70кг, 70kg, 15 кілограмів, 5 міс, 2 тиж, 3 р. при анафілаксії'), expected);
  assert.deepEqual(index.search('70 кг 20 років'), []);
});

test('caps fragments per document', () => {
  const chunks = Array.from({ length: 6 }, (_, page) =>
    chunk('a', page + 1, 'Синтетичний текст: тахікардія.', { id: `a:p${page + 1}:0` }),
  );
  const index = buildSourceIndex([...chunks, ...fillerChunks('b')], [row('a'), row('b')]);
  assert.equal(index.search('тахікардія').length, 3);
});

test('missing source files reject instead of returning an empty index', async () => {
  await assert.rejects(loadSourceIndex('/nonexistent/chunks.jsonl', '/nonexistent/registry.json'));
});
