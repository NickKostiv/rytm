import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunk, row } from '../retrieval/sourceFixtures.js';
import { createLazySourceIndex } from '../retrieval/sourceIndex.js';
import type { RetrievedFragment } from '../retrieval/sourceIndex.js';
import { splitAnswerSentences } from './answerSentences.js';
import { fragmentTitle } from './groundingFragments.js';
import { formatWithheldQuote, MAX_WITHHELD_QUOTE_LENGTH, MAX_WITHHELD_QUOTES, selectWithheldQuotes } from './withheldQuotes.js';
import type { WithheldQuote } from './withheldQuotes.js';

const DOSE_ITEM = ['1. Синтетикол (1 мг/мл):', 'а) дорослі 0,3 мг в/м;', 'б) діти 0,15 мг в/м.'].join('\n');
const TRANSPORT_ITEM = '2. Транспортування в положенні лежачи.';
const OTHER_DRUG_ITEM = '3. Синтетазол 5 мг в/в.';
const QUESTION = 'синтетикол доза при синтетичному шоку';

const fragment = (id: string, page: number, content: string, section = 'Синтетичний розділ'): RetrievedFragment => ({
  chunk: chunk(id, page, content, { headingPath: [section] }),
  row: row(id),
  score: 1,
});

const others = (...fragments: RetrievedFragment[]) => ({ contradicting: [], others: fragments });

const unitsOf = (quotes: WithheldQuote[]): string[][] => quotes.map(({ units }) => units);

const idsOf = (quotes: WithheldQuote[]): string[] => quotes.map(({ fragment: { chunk: { id } } }) => id);

test('only units holding the answer numbers with their units are quoted, whole and in source order, under the fragment title', () => {
  const doses = fragment('doses', 3, ['Синтетичний шок.', DOSE_ITEM, TRANSPORT_ITEM, OTHER_DRUG_ITEM].join('\n'));
  const quotes = selectWithheldQuotes(others(doses), { answerText: 'Синтетикол «(1 мг/мл)», «0,3 мг в/м».', questionText: QUESTION });
  assert.deepEqual(unitsOf(quotes), [[DOSE_ITEM]]);
  assert.equal(formatWithheldQuote(quotes[0] ?? { fragment: doses, units: [] }), `${fragmentTitle(doses)}:\n${DOSE_ITEM}`);
});

test('nested items are units of their own, and a unit carrying two answer numbers drops units that share only one', () => {
  const magnesium = '1.4. Синтетикол 4 г в/в (20% розчин) протягом 20 хв, потім 1 г/год\nв/в за можливості.';
  const other = '1.1. Синтетазол 20 мг в/в:\nа) мета - знизити тиск на 20-25%';
  const item = fragment('item', 144, ['1. Синтетична гіпертензія.', other, magnesium].join('\n'));
  const answer = 'Синтетикол «4 г в/в (20% розчин) протягом 20 хв, потім 1 г/год».';
  assert.deepEqual(unitsOf(selectWithheldQuotes(others(item), { answerText: answer, questionText: QUESTION })), [[magnesium]]);
});

test('with no anchored unit, a dose answer quotes dose units naming a topic term; a doseless mention is not quoted', () => {
  const mention = '1. Доза синтетиколу залежить від ваги.';
  const doses = fragment('doses', 3, [mention, DOSE_ITEM.replace('1. ', '2. '), OTHER_DRUG_ITEM].join('\n'));
  const quotes = selectWithheldQuotes(others(doses), { answerText: 'Синтетикол «0,5 мг» в/м.', questionText: QUESTION });
  assert.deepEqual(unitsOf(quotes), [[DOSE_ITEM.replace('1. ', '2. ')]]);
});

test('topic terms are the question terms the answer repeats, so a generic question word anchors nothing', () => {
  const generic = fragment('doses', 5, '1. Синтетичному пацієнту 5 мг синтетазолу.');
  const doses = fragment('doses', 3, DOSE_ITEM);
  const context = { answerText: 'Синтетикол «0,5 мг».', questionText: 'синтетичному пацієнту синтетикол' };
  assert.deepEqual(idsOf(selectWithheldQuotes(others(generic, doses), context)), ['doses:p3:0']);
});

test('once a unit is anchored, fragments of other sections are dropped and the same section stays', () => {
  const doses = fragment('doses', 3, DOSE_ITEM);
  const sameSection = fragment('doses', 4, '4. Синтетикол 1 мг/мл, 5 мл через небулайзер; дорослі 0,3 мг.');
  const otherSection = fragment('other', 9, 'Синтетикол 0,3 мг в/м (1 мг/мл)', 'Інший розділ');
  const context = { answerText: 'Синтетикол «(1 мг/мл)», «0,3 мг».', questionText: QUESTION };
  assert.deepEqual(idsOf(selectWithheldQuotes(others(doses, otherSection, sameSection), context)), ['doses:p3:0', 'doses:p4:0']);
});

test('a contradicted fragment quotes the units matching the answer plus every dose unit, in source order', () => {
  const contradicted = fragment('contra', 2, ['1. Анафілаксія:', '1.3. Епінефрин (1 мг/мл) в/м.', '1.4. Дорослі 0,3 мг в/м в стегно.'].join('\n'));
  const quotes = selectWithheldQuotes({ contradicting: [contradicted], others: [] }, { answerText: 'Епінефрин «1 мг/мл» 0,5 мг в/м.', questionText: 'епінефрин анафілаксія' });
  assert.deepEqual(unitsOf(quotes), [['1.3. Епінефрин (1 мг/мл) в/м.', '1.4. Дорослі 0,3 мг в/м в стегно.']]);
});

test('a unit that is only a heading is never quoted; with no content left the next unit with content goes out, with none no quotes', () => {
  const heading = '2.2. БІЛЬ У ГРУДЯХ/ГОСТРИЙ КОРОНАРНИЙ СИНДРОМ (ГКС)/';
  const context = { answerText: '', questionText: 'синтетичний біль у грудях доза' };
  const headed = fragment('chest', 30, [heading, 'Організація роботи бригади.'].join('\n'));
  assert.deepEqual(unitsOf(selectWithheldQuotes(others(headed), context)), [['Організація роботи бригади.']]);
  const headingOnly = fragment('heading', 31, heading);
  const content = fragment('content', 32, 'Документування виклику.');
  assert.deepEqual(unitsOf(selectWithheldQuotes(others(headingOnly, content), context)), [['Документування виклику.']]);
  assert.deepEqual(selectWithheldQuotes(others(headingOnly), context), []);
});

test('the section comes from the first cited or retrieved fragment, so a wrong answer number cannot pull in a foreign section', () => {
  const doses = fragment('doses', 3, DOSE_ITEM);
  const foreign = fragment('foreign', 9, '1. Синтетазол 5 мг в/в.', 'Інший розділ');
  const quotes = selectWithheldQuotes(others(doses, foreign), { answerText: 'Синтетикол «5 мг» в/в.', questionText: QUESTION });
  assert.deepEqual(unitsOf(quotes), [[DOSE_ITEM]]);
});

test('a contradicting fragment is always quoted first, with its dose units or else its first unit', () => {
  const doses = fragment('doses', 3, DOSE_ITEM);
  const contradictingDoses = fragment('contra', 7, `${TRANSPORT_ITEM}\n3. Інший препарат 7 мг.`, 'Інший розділ');
  const contradictingText = fragment('text', 8, 'Не застосовуйте лід.\nДругий рядок.', 'Третій розділ');
  const context = { answerText: 'Синтетикол «(1 мг/мл)», «0,3 мг».', questionText: QUESTION };
  const quotes = selectWithheldQuotes({ contradicting: [contradictingDoses, contradictingText], others: [doses] }, context);
  assert.deepEqual(unitsOf(quotes), [['3. Інший препарат 7 мг.'], ['Не застосовуйте лід.'], [DOSE_ITEM]]);
});

test('when nothing is relevant the first fragment is still quoted; only no fragments at all gives no quotes', () => {
  const unrelated = fragment('unrelated', 9, 'Організація роботи бригади.\nДокументування виклику.');
  const quotes = selectWithheldQuotes(others(unrelated), { answerText: '', questionText: QUESTION });
  assert.deepEqual(unitsOf(quotes), [['Організація роботи бригади.']]);
  assert.deepEqual(selectWithheldQuotes(others(), { answerText: '', questionText: QUESTION }), []);
});

test('at most three fragments are quoted, in order', () => {
  const fragments = [1, 2, 3, 4].map((page) => fragment('f', page, `Синтетикол ${page} мг.`));
  const quotes = selectWithheldQuotes(others(...fragments), { answerText: '', questionText: QUESTION });
  assert.equal(quotes.length, MAX_WITHHELD_QUOTES);
  assert.deepEqual(idsOf(quotes), ['f:p1:0', 'f:p2:0', 'f:p3:0']);
});

test('the length cap never cuts a unit: selection stops before the first unit that does not fit, the first unit always goes out', () => {
  const half = `1. Синтетикол ${'а'.repeat(MAX_WITHHELD_QUOTE_LENGTH / 2)}`;
  const fits = '2. Синтетикол коротко.';
  const overflow = `3. Синтетикол ${'б'.repeat(MAX_WITHHELD_QUOTE_LENGTH / 2)}`;
  const long = fragment('long', 1, [half, fits, overflow, '4. Синтетикол.'].join('\n'));
  assert.deepEqual(unitsOf(selectWithheldQuotes(others(long), { answerText: '', questionText: QUESTION })), [[half, fits]]);
  const oversized = `1. Синтетикол ${'в'.repeat(MAX_WITHHELD_QUOTE_LENGTH * 2)}`;
  assert.deepEqual(unitsOf(selectWithheldQuotes(others(fragment('huge', 1, oversized)), { answerText: '', questionText: QUESTION })), [[oversized]]);
});

test('the dose units of a contradicted fragment survive the length cap; other units give way', () => {
  const long = `1. Синтетикол ${'а'.repeat(MAX_WITHHELD_QUOTE_LENGTH)}`;
  const dose = '2. Синтетикол дорослим 0,3 мг в/м.';
  const contradicted = fragment('contra', 2, [long, dose].join('\n'));
  const quotes = selectWithheldQuotes({ contradicting: [contradicted], others: [fragment('doses', 3, DOSE_ITEM)] }, { answerText: '', questionText: QUESTION });
  assert.deepEqual(unitsOf(quotes), [[long, dose]]);
});

const realQuotes = async (questionText: string, answerText: string): Promise<WithheldQuote[]> => {
  const index = await createLazySourceIndex()();
  const sentenceHits = splitAnswerSentences(answerText).flatMap(({ text }) => index.search(text));
  return selectWithheldQuotes(others(...index.search(questionText), ...sentenceHits), { answerText, questionText });
};

test('real source base: a failed child anaphylaxis answer quotes only the 3.4 epinephrine dose item', async () => {
  const quotes = await realQuotes(
    'Дитині 12 кг анафілаксія, скільки мл адреналіну набрати?',
    '«введіть епінефрин (1 мг/мл)», «діти (менше 25 кг): 0,15 мг в верхньо-зовнішню поверхню стегна», тобто 0,15 мл.\n- Інша група: «дорослі (25 кг або більше) 0,3 мг в/м».\n- «Діти <25-30 кг 0,15 мг в/м».',
  );
  assert.deepEqual(idsOf(quotes), ['1269-20190605-dod:p64:0']);
  assert.equal(quotes[0]?.units.length, 1);
  assert.match(quotes[0]?.units[0] ?? '', /^2\. Якщо є ознаки анафілаксії, введіть епінефрин \(1 мг\/мл\)/);
});

test('real source base: a failed magnesium answer in pre-eclampsia quotes only the magnesium items, no other drug of item 1', async () => {
  const quotes = await realQuotes(
    'АТ 180/100, гіпертензивний криз, скільки МЛ магнію сульфату вводити?\nтак, є симптоми прееклампсії',
    'При прееклампсії: «Магнію сульфат - 4 г в/в (20% розчин) протягом 20 хв, потім 1 г/год», тобто 20 мл.',
  );
  assert.deepEqual(unitsOf(quotes).flat().map((unit) => unit.split('\n')[0]), [
    '1.4. Магнію сульфат - 4 г в/в (20% розчин) протягом 20 хв, потім 1 г/год',
    '2.1. Магнію сульфат:',
  ]);
});
