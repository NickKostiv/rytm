import type Anthropic from '@anthropic-ai/sdk';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunk, row } from '../retrieval/sourceFixtures.js';
import type { RetrievedFragment } from '../retrieval/sourceIndex.js';
import { splitAnswerSentences } from './answerSentences.js';
import { collectVerifiedAnswer, runDeterministicChecks, splitSourceUnits } from './verifiedAnswer.js';

const ITEMS_FRAGMENT = ['Синтетичний розділ.', '1. Синтетикол 0,3 мг в/м:', 'а) повторно через 5 хв.', '2. Розчин синтетиколу 1 мг/мл.'].join('\n');
const ONE_ITEM_FRAGMENT = ['1. Синтетикол (1 мг/мл):', 'а) дорослі 0,3 мг в/м.'].join('\n');

const fragment = (content: string): RetrievedFragment => ({ chunk: chunk('synthetic', 1, content), row: row('synthetic'), score: 1 });

const mohCited = (text: string): Anthropic.Beta.BetaTextBlock => ({
  type: 'text',
  text,
  citations: [
    { type: 'search_result_location', cited_text: 'синтетикол', source: 'fixture', title: null, search_result_index: 0, start_block_index: 0, end_block_index: 1 },
  ],
});

const webCited = (text: string, citedText: string): Anthropic.Beta.BetaTextBlock => ({
  type: 'text',
  text,
  citations: [{ type: 'web_search_result_location', cited_text: citedText, encrypted_index: 'synthetic', title: null, url: 'https://example.org/synthetic' }],
});

const check = (blocks: Anthropic.Beta.BetaTextBlock[], fragments: RetrievedFragment[], hasCalculatorRule = false) => {
  const answer = collectVerifiedAnswer(blocks, fragments);
  const result = runDeterministicChecks(answer, splitAnswerSentences(answer.text), { hasCalculatorRule });
  return result.status === 'failed' ? result.check : 'passed';
};

const VOLUME_SENTENCE = 'Наберіть 0,3 мл: «0,3 мг», «1 мг/мл».';

test('a source unit is one top-level numbered item with its sub-lines, or one line when the fragment has no numbering', () => {
  assert.deepEqual(splitSourceUnits(ITEMS_FRAGMENT), [
    'Синтетичний розділ.',
    '1. Синтетикол 0,3 мг в/м:\nа) повторно через 5 хв.',
    '2. Розчин синтетиколу 1 мг/мл.',
  ]);
  assert.deepEqual(splitSourceUnits('Рядок один.\nРядок два.'), ['Рядок один.', 'Рядок два.']);
});

test('a unit closes on a blank line or a new paragraph after the last item; continuation and ТА/АБО lines stay in it', () => {
  const content = ['1. Синтетикол 1 мг/мл:', 'а) 0,3 мг', 'ТА/АБО', 'б) 0,15 мг.', 'Примітки', 'Розчин 10 мкг/мл.', '', 'інший абзац 5 мг'].join('\n');
  assert.deepEqual(splitSourceUnits(content), ['1. Синтетикол 1 мг/мл:\nа) 0,3 мг\nТА/АБО\nб) 0,15 мг.', 'Примітки', 'Розчин 10 мкг/мл.', 'інший абзац 5 мг']);
});

test('a volume fails when its dose and concentration sit in different items of one cited fragment, and passes within one item', () => {
  assert.equal(check([mohCited(VOLUME_SENTENCE)], [fragment(ITEMS_FRAGMENT)]), 'volumes');
  assert.equal(check([mohCited(VOLUME_SENTENCE)], [fragment(ONE_ITEM_FRAGMENT)]), 'passed');
});

test('a volume in ml, мілілітрів, кубиків or см³ is recomputed, so a dose number cannot vouch for it', () => {
  const fragments = [fragment('2. введіть синтетикол 10 мг (5 мг/мл)')];
  ['10 ml', '10 мілілітрів', '10 кубиків', '10 см³'].forEach((volume) => {
    const blocks = [mohCited(`Синтетикол «10 мг» «(5 мг/мл)» — ${volume}.`)];
    assert.equal(check(blocks, fragments), 'volumes', volume);
    assert.equal(check(blocks, fragments, true), 'volumes', volume);
  });
  assert.equal(check([mohCited('Синтетикол «10 мг» «(5 мг/мл)» — 2 ml.')], fragments), 'passed');
});

test('the number check compares dose units on the MoH and the web path', () => {
  const fragments = [fragment(ONE_ITEM_FRAGMENT)];
  assert.equal(check([mohCited('Протокол: «дорослі 0,3 г в/м».')], fragments), 'numbers');
  assert.equal(check([mohCited('Протокол: «дорослі 0,3 mg в/м».')], fragments), 'passed');
  assert.equal(check([webCited('Синтетикол «10 г».', 'синтетикол 10 мг')], fragments), 'numbers');
  assert.equal(check([webCited('Синтетикол «10 mg».', 'синтетикол 10 мкг')], fragments), 'numbers');
  assert.equal(check([webCited('Синтетикол «10 mg».', 'синтетикол 10 мг')], fragments), 'passed');
});

test('calculator precedence: with a matched rule a recomputed volume or a number only a web source states fails; a verbatim MoH number passes', () => {
  const fragments = [fragment(ONE_ITEM_FRAGMENT)];
  assert.equal(check([mohCited(VOLUME_SENTENCE)], fragments, true), 'calculator');
  assert.equal(check([webCited('Синтетикол «0,5 мг».', 'синтетикол 0,5 мг')], fragments, false), 'passed');
  assert.equal(check([webCited('Синтетикол «0,5 мг».', 'синтетикол 0,5 мг')], fragments, true), 'calculator');
  assert.equal(check([mohCited('Протокол: «дорослі 0,3 мг в/м».')], fragments, true), 'passed');
});
