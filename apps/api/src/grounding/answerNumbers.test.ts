import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findUnverifiedNumbers, findUnverifiedNumbersByUnit } from './answerNumbers.js';

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

const checkByUnit = (answer: string, sourceTexts: string[]): string[] => findUnverifiedNumbersByUnit([{ text: answer, sourceTexts }]);

test('by unit: a number with a dose unit needs the same number with the same unit, spellings normalised and magnitudes never converted', () => {
  assert.deepEqual(checkByUnit('Синтетикол «10 г».', ['синтетикол 10 мг (5 мг/мл)']), ['10']);
  assert.deepEqual(checkByUnit('Синтетикол «10 mg».', ['синтетикол 10 мкг']), ['10']);
  assert.deepEqual(checkByUnit('Синтетикол «10 mg».', ['синтетикол 10 мг']), []);
  assert.deepEqual(checkByUnit('«1000 мг».', ['синтетикол 1 г']), ['1000']);
  assert.deepEqual(checkByUnit('«5 mcg/kg/min», «20 IU», «2 mmol», «1 µg».', ['5 мкг/кг/хв; 20 МО; 2 ммоль; 1 мкг']), []);
  assert.deepEqual(checkByUnit('«5000 ОД».', ['5000 МО']), ['5000']);
});

test('by unit: per-kg, per-minute and concentration suffixes must match, and a range carries its unit to both ends', () => {
  assert.deepEqual(checkByUnit('«0,15 мг».', ['0,15 мг/кг в/в']), ['0.15']);
  assert.deepEqual(checkByUnit('«0,15 мг/кг».', ['0,15 мг/кг в/в']), []);
  assert.deepEqual(checkByUnit('«1 мг/мл».', ['(1 мг/мл)']), []);
  assert.deepEqual(checkByUnit('«1 мг/мл».', ['1 мг в/м']), ['1']);
  assert.deepEqual(checkByUnit('«0,3–0,5 мг».', ['0,3 мг - 0,5 мг']), []);
  assert.deepEqual(checkByUnit('«0,3 мг».', ['0,3-0,5 г']), ['0.3']);
  assert.deepEqual(checkByUnit('«20%».', ['20 мг']), ['20']);
});

test('by unit: numbers without a recognised unit keep the plain rule, and volumes are left to the volume check', () => {
  assert.deepEqual(checkByUnit('Кожні «5 хв», «25 кг».', ['5 мг; 25 мг']), []);
  assert.deepEqual(checkByUnit('Наберіть 0,3 мл.', ['0,3 мг']), []);
  assert.deepEqual(checkByUnit('Кожні «7 хв».', ['5 хв']), ['7']);
});

test('grounded rule is unchanged: a number passes by value whatever its unit', () => {
  assert.deepEqual(check('Ввести 0,15 г.'), []);
});
