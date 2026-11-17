import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SourceRow } from '../sources/sourceRegistry.js';
import { resolveOrderDates } from './resolveOrderDates.js';
import { row } from './sourceFixtures.js';

const withCheck = (base: SourceRow, orderDate: string, documentDate: string): SourceRow => ({
  ...base,
  orderDate,
  documentCheck: {
    pageCount: 1,
    orderNumber: base.orderNumber,
    orderDate: documentDate,
    mismatches: orderDate === documentDate ? [] : [`file name date ${orderDate}, document date ${documentDate}`],
  },
});

test('a mismatched date takes the document date when a sibling row of the same order confirms it', () => {
  const rows = [withCheck(row('annex'), '2024-07-22', '2024-07-16'), withCheck(row('main'), '2024-07-16', '2024-07-16')];
  const [annex] = resolveOrderDates(rows);
  assert.equal(annex?.orderDate, '2024-07-16');
  assert.equal(annex?.dateSource, 'document');
  assert.equal(annex?.documentCheck?.mismatches.length, 1);
});

test('a mismatched date without a confirming sibling keeps the file-name date', () => {
  const rows = [withCheck(row('lonely'), '2025-03-26', '2026-03-26'), withCheck({ ...row('other'), orderNumber: '9' }, '2026-03-26', '2026-03-26')];
  const [lonely] = resolveOrderDates(rows);
  assert.equal(lonely?.orderDate, '2025-03-26');
  assert.equal(lonely?.dateSource, 'filename');
});
