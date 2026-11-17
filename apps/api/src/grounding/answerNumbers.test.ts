import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findUnverifiedNumbers } from './answerNumbers.js';

const FRAGMENT = 'Синтетичний препарат: 0,15 мг/кг в/в, максимум 7,5 мг; інфузія 25–100 мл/год.';

const check = (answer: string, sourceTexts: string[] = [FRAGMENT]): string[] =>
  findUnverifiedNumbers([{ text: answer, sourceTexts }]);

test('a number missing from every cited fragment is rejected', () => {
  assert.deepEqual(check('Ввести 0,2 мг/кг.'), ['0.2']);
});

test('an answer whose numbers all appear in cited fragments passes', () => {
  assert.deepEqual(check('Доза 0,15 мг/кг, максимум 7,5 мг; інфузія 25-100 мл/год.'), []);
});

test('decimal comma and point, dashes and non-breaking spaces are normalised the same way', () => {
  assert.deepEqual(check('0.15\u00A0мг/кг, 25\u2014100 мл/год, 7.50 мг'), []);
});

test('ordered-list markers at line start are ignored, numbers elsewhere are not', () => {
  assert.deepEqual(check('1. Ввести 0,15 мг/кг\n2) Контроль через 15 хв'), ['15']);
});

test('a ratio with a thousands group is compared whole: 1:400 against 1:400 000', () => {
  assert.deepEqual(check('розчин 1:400', ['розчин 1:400 000']), ['1:400']);
});

test('a ratio with several thousands groups is compared whole: 1:1 000 against 1:1 000 000', () => {
  assert.deepEqual(check('розчин 1:1 000', ['розчин 1:1\u00A0000\u00A0000']), ['1:1000']);
});

test('a grouped number is one number: 50 000 ОД against 5 000 ОД and 50 мл', () => {
  assert.deepEqual(check('50 000 ОД', ['5 000 ОД у 50 мл']), ['50000']);
});

test('a grouped number from the fragment passes in either spacing', () => {
  assert.deepEqual(check('5\u202F000 ОД у 50 мл', ['5 000 ОД у 50 мл']), []);
});

test('a non-ASCII numeral must appear verbatim in the cited fragment', () => {
  assert.deepEqual(check('½ дози'), ['½']);
  assert.deepEqual(check('½ дози', ['½ ампули']), []);
});

test('each block is checked only against the fragments it cites', () => {
  const unverified = findUnverifiedNumbers([
    { text: 'Немовлятам 2 мг', sourceTexts: ['Немовлятам: див. таблицю'] },
    { text: '. Дорослим 2 мг.', sourceTexts: ['Дорослим 2 мг'] },
  ]);
  assert.deepEqual(unverified, ['2']);
});

test('a block with digits and no citation is rejected even if another block cites the number', () => {
  const unverified = findUnverifiedNumbers([
    { text: 'Ввести 0,15 мг/кг', sourceTexts: [] },
    { text: ' згідно з протоколом', sourceTexts: [FRAGMENT] },
  ]);
  assert.deepEqual(unverified, ['0.15']);
});
