import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toRetrievalQuery } from './retrievalTerms.js';
import { createLazySourceIndex } from './sourceIndex.js';

test('term cleaning drops numbers, numbers with units and route tokens, and keeps letters-with-digits names', () => {
  assert.equal(toRetrievalQuery(['анафілаксія', 'епінефрин 0,3 мг', '70', '70кг', '10%', 'в/м', '(в/в)', 'п/ш', 'В/К']), 'анафілаксія епінефрин мг');
  assert.equal(toRetrievalQuery(['ремдесивір', 'COVID-19']), 'ремдесивір COVID-19');
  assert.equal(toRetrievalQuery(['5', '0.3 мл', 'в/м']), 'мл');
  assert.equal(toRetrievalQuery([]), '');
});

const OWNER_QUERY = 'Пацієнт 70 років, після антибіотика почалась анафілаксія, скільки мл адреналіну набрати в м’яз?';

const sections = (fragments: { chunk: { headingPath: string[] } }[]): string[] =>
  [...new Set(fragments.map(({ chunk }) => chunk.headingPath[0]?.split(' ')[0] ?? ''))];

test('real source base: the raw owner query finds nothing and the reduced queries hit the record sections with the unchanged threshold', async () => {
  const index = await createLazySourceIndex()();
  assert.deepEqual(index.search(OWNER_QUERY), []);
  assert.equal(sections(index.search('анафілаксія епінефрин'))[0], '3.4.');
  assert.deepEqual(sections(index.search('круп стридор')), ['5.3.']);
  assert.equal(sections(index.search('гіпоглікемія глюкоза'))[0], '3.9.');
  assert.deepEqual(index.search('ремдесивір COVID-19'), []);
  assert.deepEqual(index.search('гіпертензивний криз магнію сульфат'), []);
});
