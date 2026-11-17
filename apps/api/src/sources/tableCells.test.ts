import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectTables, type RuleSegment } from './tableCells.js';

const horizontal = (y: number, from: number, to: number): RuleSegment => ({ orientation: 'horizontal', position: y, start: from, end: to });
const vertical = (x: number, from: number, to: number): RuleSegment => ({ orientation: 'vertical', position: x, start: from, end: to });

test('grid with a merged header row gives spans and row/column indexes', () => {
  const segments = [
    horizontal(300, 0, 200),
    horizontal(200, 0, 200),
    horizontal(100, 0, 200),
    horizontal(0, 0, 200),
    vertical(0, 0, 300),
    vertical(200, 0, 300),
    vertical(100.8, 0, 200),
  ];
  const [table, ...rest] = detectTables(segments);
  assert.equal(rest.length, 0);
  assert.equal(table?.rowCount, 3);
  assert.equal(table?.columnCount, 2);
  assert.deepEqual(
    table?.cells.map(({ row, column, rowSpan, columnSpan }) => [row, column, rowSpan, columnSpan]),
    [
      [0, 0, 1, 2],
      [1, 0, 1, 1],
      [1, 1, 1, 1],
      [2, 0, 1, 1],
      [2, 1, 1, 1],
    ],
  );
});

test('adjacent border pieces drawn as separate rectangles are joined', () => {
  const segments = [
    horizontal(100, 0, 49.5),
    horizontal(100.4, 50, 100),
    horizontal(50, 0, 100),
    horizontal(0, 0, 100),
    vertical(0, 0, 100),
    vertical(50, 0, 100),
    vertical(100, 0, 100),
  ];
  const [table] = detectTables(segments);
  assert.equal(table?.rowCount, 2);
  assert.equal(table?.columnCount, 2);
  assert.equal(table?.cells.length, 4);
});

test('a single framed box is not a table', () => {
  const segments = [horizontal(100, 0, 100), horizontal(0, 0, 100), vertical(0, 0, 100), vertical(100, 0, 100)];
  assert.deepEqual(detectTables(segments), []);
});
