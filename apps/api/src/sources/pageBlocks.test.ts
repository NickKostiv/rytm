import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPageBlocks } from './pageBlocks.js';
import type { PageContent, PageTextItem } from './pdfPageContent.js';
import type { RuleSegment } from './tableCells.js';

const FONT_SIZE = 12;

const word = (text: string, x: number, y: number, width: number, fontSize = FONT_SIZE): PageTextItem => ({
  text,
  x,
  y,
  width,
  fontSize,
  directionX: 1,
  directionY: 0,
});

const rotatedWord = (text: string, x: number, y: number, width: number): PageTextItem => ({
  ...word(text, x, y, width),
  directionX: 0,
  directionY: 1,
});

const GRID: RuleSegment[] = [
  { orientation: 'horizontal', position: 300, start: 0, end: 300 },
  { orientation: 'horizontal', position: 200, start: 0, end: 300 },
  { orientation: 'horizontal', position: 100, start: 0, end: 300 },
  { orientation: 'vertical', position: 0, start: 100, end: 300 },
  { orientation: 'vertical', position: 100, start: 100, end: 300 },
  { orientation: 'vertical', position: 300, start: 100, end: 300 },
];

const page = (items: PageTextItem[]): PageContent => ({ pageNumber: 1, items, segments: GRID, boxes: [] });

test('table renders as markdown with the header row first and cells kept apart', () => {
  const blocks = buildPageBlocks(
    page([word('Препарат', 5, 250, 60), word('Доза', 105, 250, 30), word('Синтетик', 5, 150, 60), word('1 мг', 105, 150, 30)]),
  );
  assert.deepEqual(blocks, [
    { type: 'table', markdown: '| Препарат | Доза |\n| --- | --- |\n| Синтетик | 1 мг |', warnings: [] },
  ]);
});

test('superscript stays on its line, marked so it never merges into a number', () => {
  const [block] = buildPageBlocks({
    pageNumber: 1,
    items: [word('Доза 1,5 мг', 10, 500, 60), word('1', 70.5, 504, 4, 7), word('PaCO', 10, 484, 30), word('2', 40.2, 482, 4, 7)],
    segments: [],
    boxes: [],
  });
  assert.deepEqual(block, { type: 'text', lines: ['Доза 1,5 мг^1', 'PaCO2'] });
});

test('rotated row label is placed in its own cell', () => {
  const [block] = buildPageBlocks(page([word('Заголовок', 105, 250, 60), rotatedWord('Мітка', 99, 120, 40), word('Вміст', 105, 150, 40)]));
  assert.equal(block?.type === 'table' && block.markdown.split('\n')[2], '| Мітка | Вміст |');
});

test('a text run crossing a column border is flagged on the table', () => {
  const [block] = buildPageBlocks(page([word('Заголовок', 5, 250, 60), word('Назва 2 мг', 5, 150, 160)]));
  assert.equal(block?.type, 'table');
  assert.match(block?.type === 'table' ? block.warnings.join(' ') : '', /crosses a column border/);
});

test('side-by-side boxes keep their own lines instead of interleaving', () => {
  const [block] = buildPageBlocks({
    pageNumber: 1,
    items: [word('Ліва', 10, 180, 30), word('A 1-2', 10, 165, 40), word('Права', 110, 180, 30), word('B 3-4', 110, 165, 40)],
    segments: [],
    boxes: [
      { left: 0, right: 90, bottom: 150, top: 200 },
      { left: 100, right: 190, bottom: 150, top: 199 },
    ],
  });
  assert.deepEqual(block, { type: 'text', lines: ['Ліва', 'A 1-2', 'Права', 'B 3-4'] });
});
