import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseProtocolList } from './protocolList.js';

const BASE = 'https://moz.gov.ua/storage/uploads/00000000-0000-0000-0000-000000000000';

const PROTOCOL_TEXT = [
  'https://moz.gov.ua/uploads/2/10000-dn_20190605_1000_dod.pdf',
  `${BASE}/dn_2000_18072024_dod_2-.pdf`,
  `${BASE}/dn_3000_22072024_dod_3.pdf`,
  `${BASE}/dn_3000_16072024_dod.pdf`,
  `${BASE}/dn_3000_22072024_dod_4.pdf`,
  'https://moz.gov.ua/uploads/11/55450-dn_714_25042024_dod1.pdf',
  'https://moz.gov.ua/uploads/6/33038-dn_4000_15_09_2021_dod.PDF',
  `${BASE}/dn_5000_13102025_dod_4.pdf`,
  `${BASE}/dn_5000_13102025_dod_4.pdf`,
  '',
].join('\n');

test('one source per unique URL, duplicate kept with both line numbers and a warning', () => {
  const list = parseProtocolList(PROTOCOL_TEXT);
  assert.equal(list.lineCount, 9);
  assert.equal(list.sources.length + list.skippedScanned.length, 8);
  const duplicate = list.sources.find(({ id }) => id === '5000-20251013-dod4');
  assert.deepEqual(duplicate?.lines, [8, 9]);
  assert.match(duplicate?.warnings.join(' ') ?? '', /lines 8, 9/);
});

test('scanned order 714 annexes are skipped and reported', () => {
  const list = parseProtocolList(PROTOCOL_TEXT);
  assert.deepEqual(list.skippedScanned.map(({ lines }) => lines), [[6]]);
  assert.ok(list.sources.every(({ orderNumber }) => orderNumber !== '714'));
});

test('order number, date and annex come from both file name layouts', () => {
  const byLine = new Map(parseProtocolList(PROTOCOL_TEXT).sources.map((source) => [source.lines[0], source]));
  assert.deepEqual(
    [1, 2, 7].map((line) => {
      const source = byLine.get(line);
      return [source?.orderNumber, source?.orderDate, source?.annex];
    }),
    [
      ['1000', '2019-06-05', null],
      ['2000', '2024-07-18', '2'],
      ['4000', '2021-09-15', null],
    ],
  );
});

test('trailing dash annex and sibling date conflict are flagged', () => {
  const byLine = new Map(parseProtocolList(PROTOCOL_TEXT).sources.map((source) => [source.lines[0], source]));
  assert.match(byLine.get(2)?.warnings.join(' ') ?? '', /annex 2 needs confirming/);
  assert.match(byLine.get(4)?.warnings.join(' ') ?? '', /differs from sibling annexes of order 3000/);
  assert.deepEqual(byLine.get(3)?.warnings, []);
});

test('non-official host is rejected', () => {
  assert.throws(() => parseProtocolList('https://example.com/dn_1_01012024_dod.pdf'), /moz\.gov\.ua/);
});
