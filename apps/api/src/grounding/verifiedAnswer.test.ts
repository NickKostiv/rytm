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

const check = (blocks: Anthropic.Beta.BetaContentBlock[], fragments: RetrievedFragment[], hasCalculatorRule = false) => {
  const answer = collectVerifiedAnswer(blocks, fragments);
  const result = runDeterministicChecks(answer, splitAnswerSentences(answer.text), { hasCalculatorRule });
  return result.status === 'failed' ? result.check : 'passed';
};

const VOLUME_SENTENCE = 'Наберіть 0,3 мл: «0,3 мг», «1 мг/мл».';

const PAGE_URL = 'https://example.org/synthetic-page';
const PAGE_TEXT = ['Синтетична сторінка.', 'Синтетикол розчин 1 мг/мл, дорослим 0,3 мг в/м.', 'Синтетазол 5 мг/мл.', 'Дітям 0,15 мг.'].join('\n');

const fetchedPage = (text: string): Anthropic.Beta.BetaWebFetchToolResultBlock => ({
  type: 'web_fetch_tool_result',
  tool_use_id: 'srvtoolu_synthetic',
  content: {
    type: 'web_fetch_result',
    url: PAGE_URL,
    retrieved_at: null,
    content: { type: 'document', title: 'Синтетична сторінка', citations: { enabled: true }, source: { type: 'text', media_type: 'text/plain', data: text } },
  },
});

const pageCited = (text: string, citedText: string, start = PAGE_TEXT.indexOf(citedText)): Anthropic.Beta.BetaTextBlock => ({
  type: 'text',
  text,
  citations: [
    {
      type: 'char_location',
      cited_text: citedText,
      document_index: 0,
      document_title: 'Синтетична сторінка',
      file_id: null,
      start_char_index: start,
      end_char_index: start + citedText.length,
    },
  ],
});

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

test('a failed check carries value-free reasons for the log', () => {
  const fragments = [fragment(ONE_ITEM_FRAGMENT)];
  const reasonsOf = (blocks: Anthropic.Beta.BetaTextBlock[]): string[] => {
    const answer = collectVerifiedAnswer(blocks, fragments);
    const result = runDeterministicChecks(answer, splitAnswerSentences(answer.text), { hasCalculatorRule: false });
    return result.status === 'failed' ? [result.check, ...result.reasons] : [];
  };
  assert.deepEqual(reasonsOf([{ type: 'text', text: 'Без цитати «0,3 мг».', citations: null }]), ['numbers', 'uncited']);
  assert.deepEqual(reasonsOf([mohCited('Протокол: «дорослі 0,3 г в/м».')]), ['numbers', 'unit_mismatch']);
  assert.deepEqual(reasonsOf([mohCited('Протокол: «дорослі 0,3 мг в/м». Це 0,3 мл.')]), ['volumes', 'verbatim_absent']);
});

const DOSE_LINE = 'Синтетикол розчин 1 мг/мл, дорослим 0,3 мг в/м.';
const DOSE_LINES = PAGE_TEXT.slice(PAGE_TEXT.indexOf(DOSE_LINE));

test('a fetched page vouches only through the range the model cited: a number elsewhere on the page fails', () => {
  const page = fetchedPage(PAGE_TEXT);
  assert.equal(check([page, pageCited('Дорослим «0,3 мг».', DOSE_LINE)], []), 'passed');
  assert.equal(check([page, pageCited('Дорослим «0,3 мкг».', DOSE_LINE)], []), 'numbers');
  assert.equal(check([page, pageCited('Дітям «0,15 мг».', DOSE_LINE)], []), 'numbers');
  assert.deepEqual(collectVerifiedAnswer([page, pageCited('Дорослим «0,3 мг».', DOSE_LINE)], []).webSources, [
    { id: 'w1', url: PAGE_URL, title: 'Синтетична сторінка', domain: 'example.org', pageAge: null },
  ]);
});

test('a char range that is not the text of a fetched page leaves the block uncited', () => {
  assert.equal(check([fetchedPage(PAGE_TEXT), pageCited('Дорослим «0,3 мг».', DOSE_LINE, 3)], []), 'numbers');
  assert.equal(check([pageCited('Дорослим «0,3 мг».', DOSE_LINE)], []), 'numbers');
});

test('a volume recomputes only from one unit inside the cited range; a web search citation of a fetched URL stays snippet-only', () => {
  const page = fetchedPage(PAGE_TEXT);
  const searchCited: Anthropic.Beta.BetaTextBlock = {
    type: 'text',
    text: VOLUME_SENTENCE,
    citations: [{ type: 'web_search_result_location', cited_text: 'Синтетична сторінка', encrypted_index: 'synthetic', title: null, url: PAGE_URL }],
  };
  assert.equal(check([page, pageCited(VOLUME_SENTENCE, DOSE_LINE)], []), 'passed');
  assert.equal(check([page, searchCited], []), 'numbers');
  assert.equal(check([page, pageCited('Наберіть 0,15 мл: «0,15 мг», «1 мг/мл».', DOSE_LINES)], []), 'volumes');
  assert.equal(check([page, pageCited('Наберіть 0,06 мл: «0,3 мг», «5 мг/мл».', DOSE_LINES)], []), 'volumes');
});

const uncited = (text: string): Anthropic.Beta.BetaTextBlock => ({ type: 'text', text, citations: null });

const ASSIGNABLE = 'Наберіть 0,3 мл: «Синтетикол (1 мг/мл): а) дорослі 0,3 мг в/м».';

test('code assigns a citation to an uncited quotation found, whitespace collapsed, in exactly one fragment; the checks then run as usual', () => {
  const answer = collectVerifiedAnswer([uncited(ASSIGNABLE)], [fragment(ITEMS_FRAGMENT), fragment(ONE_ITEM_FRAGMENT)]);
  assert.equal(answer.assignedCitations, 1);
  assert.deepEqual(answer.citedFragments.map(({ chunk }) => chunk.content), [ONE_ITEM_FRAGMENT]);
  assert.equal(answer.blocks.map(({ text }) => text).join(''), ASSIGNABLE);
  assert.equal(check([uncited(ASSIGNABLE)], [fragment(ITEMS_FRAGMENT), fragment(ONE_ITEM_FRAGMENT)]), 'passed');
});

test('a quotation in no fragment, in two fragments or shorter than the minimum assigns nothing', () => {
  assert.equal(check([uncited(ASSIGNABLE)], [fragment(ITEMS_FRAGMENT)]), 'numbers');
  assert.equal(check([uncited(ASSIGNABLE)], [fragment(ONE_ITEM_FRAGMENT), fragment(`${ONE_ITEM_FRAGMENT}\n2. Інше.`)]), 'numbers');
  const short = collectVerifiedAnswer([uncited('Синтетикол «0,3 мг в/м».')], [fragment(ONE_ITEM_FRAGMENT)]);
  assert.equal(short.assignedCitations, 0);
  assert.equal(check([uncited('Синтетикол «0,3 мг в/м».')], [fragment(ONE_ITEM_FRAGMENT)]), 'numbers');
});

test('only the quotation is cited: a number outside it stays uncited, and a block the API cited is never re-assigned', () => {
  assert.equal(check([uncited(`${ASSIGNABLE} Повторіть через 5 мг.`)], [fragment(ONE_ITEM_FRAGMENT)]), 'numbers');
  const webBlock = webCited('«Синтетикол (1 мг/мл): а) дорослі 0,3 мг в/м»', 'Синтетикол');
  assert.equal(collectVerifiedAnswer([webBlock], [fragment(ONE_ITEM_FRAGMENT)]).assignedCitations, 0);
  assert.equal(check([webBlock], [fragment(ONE_ITEM_FRAGMENT)]), 'numbers');
});

test('a quotation that starts or ends inside a fragment number assigns nothing and fails, with or without a calculator rule', () => {
  const repros: [string, string][] = [
    ['Синтетикол 125 мг в/в струминно.', 'Дорослим синтетикол «25 мг в/в струминно».'],
    ['Синтетикол 10,5 мг в/в повільно.', 'Дорослим «0,5 мг в/в повільно».'],
    ['Синтетикол: діти (менше 25 кг): 0,15 мг в/м.', 'Дітям «діти (менше 25 кг): 0,1» мг.'],
    ['Синтетикол 0,5 мг в/в повільно.', 'Дорослим «5 мг в/в повільно».'],
    ['Синтетикол дітям: 0,15 мг в/м.', 'Дорослим «Синтетикол дітям: 0» мг.'],
  ];
  repros.forEach(([source, answer]) => {
    assert.equal(collectVerifiedAnswer([uncited(answer)], [fragment(source)]).assignedCitations, 0, answer);
    assert.equal(check([uncited(answer)], [fragment(source)]), 'numbers', answer);
    assert.equal(check([uncited(answer)], [fragment(source)], true), 'numbers', answer);
  });
});

test('an assigned quotation verifies its numbers against the fragment, not against itself', () => {
  const answer = 'Дітям «Синтетикол дітям 0,15 мг».';
  const source = fragment('Синтетикол дітям 0,15 мг/кг в/м повільно.');
  assert.equal(collectVerifiedAnswer([uncited(answer)], [source]).assignedCitations, 1);
  assert.equal(check([uncited(answer)], [source]), 'numbers');
});
