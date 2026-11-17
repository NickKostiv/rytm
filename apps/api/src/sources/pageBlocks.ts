import type { PageContent, PageTextItem } from './pdfPageContent.js';
import { type Box, detectTables, type TableCell, type TableGrid } from './tableCells.js';

export type PageBlock = { type: 'text'; lines: string[] } | { type: 'table'; markdown: string; warnings: string[] };

const LINE_OVERLAP_RATIO = 0.6;
const WORD_GAP_RATIO = 0.15;
const CELL_TOLERANCE = 1;
const BASELINE_LIFT_RATIO = 0.3;
const CROSSING_TOLERANCE = 2;
const WARNING_SAMPLE_LENGTH = 60;
const SUPERSCRIPT_RISE_RATIO = 0.2;

const isWhitespace = (text: string): boolean => /^\s/.test(text) || /\s$/.test(text);

const isHorizontal = (item: PageTextItem): boolean => item.directionX > 0 && item.directionY === 0;

const groupLines = (items: PageTextItem[]): PageTextItem[][] => {
  const lines: Array<{ lowestBaseline: number; items: PageTextItem[] }> = [];
  [...items]
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .forEach((item) => {
      const line = lines.at(-1);
      if (line && item.y + item.fontSize * LINE_OVERLAP_RATIO > line.lowestBaseline) {
        line.items.push(item);
        line.lowestBaseline = Math.min(line.lowestBaseline, item.y);
        return;
      }
      lines.push({ lowestBaseline: item.y, items: [item] });
    });
  return lines.map((line) => line.items.sort((a, b) => a.x - b.x));
};

const findMainItem = (items: PageTextItem[]): PageTextItem | undefined =>
  items.reduce<PageTextItem | undefined>((main, item) => (!main || item.fontSize > main.fontSize ? item : main), undefined);

const isSuperscript = (item: PageTextItem, main: PageTextItem | undefined): boolean =>
  main !== undefined && item.fontSize < main.fontSize && item.y - main.y > main.fontSize * SUPERSCRIPT_RISE_RATIO;

const joinLine = (items: PageTextItem[]): string => {
  const main = findMainItem(items.filter((item) => item.text.trim().length > 0));
  return items
    .reduce<{ text: string; previous: PageTextItem | null }>(
      ({ text, previous }, item) => {
        const gap = previous ? item.x - (previous.x + previous.width) : 0;
        const needsSpace =
          previous !== null && gap > item.fontSize * WORD_GAP_RATIO && !isWhitespace(previous.text) && !isWhitespace(item.text);
        const itemText = isSuperscript(item, main) && item.text.trim().length > 0 ? `^${item.text.trim()}` : item.text;
        return { text: `${text}${needsSpace ? ' ' : ''}${itemText}`, previous: item };
      },
      { text: '', previous: null },
    )
    .text.replace(/\s+/g, ' ')
    .trim();
};

const isInside = (item: PageTextItem, box: Box): boolean => {
  const along = Math.min(item.width, item.fontSize) / 2;
  const lift = item.fontSize * BASELINE_LIFT_RATIO;
  const x = item.x + item.directionX * along - item.directionY * lift;
  const y = item.y + item.directionY * along + item.directionX * lift;
  return (
    x >= box.left - CELL_TOLERANCE &&
    x <= box.right + CELL_TOLERANCE &&
    y >= box.bottom - CELL_TOLERANCE &&
    y <= box.top + CELL_TOLERANCE
  );
};

const crossesColumnBorder = (item: PageTextItem, cell: TableCell, table: TableGrid): boolean =>
  isHorizontal(item) &&
  item.text.trim().length > 0 &&
  cell.right < table.right - CROSSING_TOLERANCE &&
  item.x + item.width > cell.right + CROSSING_TOLERANCE;

const escapeCell = (text: string): string => text.replaceAll('|', '\\|');

const renderTable = (
  table: TableGrid,
  itemsByCell: Map<TableCell | undefined, PageTextItem[]>,
): { markdown: string; warnings: string[] } => {
  const grid = Array.from({ length: table.rowCount }, () => Array.from({ length: table.columnCount }, () => ''));
  const warnings: string[] = [];
  table.cells.forEach((cell) => {
    const cellItems = itemsByCell.get(cell) ?? [];
    cellItems
      .filter((item) => crossesColumnBorder(item, cell, table))
      .forEach((item) =>
        warnings.push(
          `text run crosses a column border in row ${cell.row + 1}, column ${cell.column + 1}; columns may be merged: "${item.text.slice(0, WARNING_SAMPLE_LENGTH)}"`,
        ),
      );
    const text = groupLines(cellItems)
      .map(joinLine)
      .filter((line) => line.length > 0)
      .join(' ');
    const row = grid[cell.row];
    if (row) row[cell.column] = escapeCell(text);
  });
  const [header = [], ...body] = grid;
  const markdown = [header, header.map(() => '---'), ...body].map((cells) => `| ${cells.join(' | ')} |`).join('\n');
  return { markdown, warnings };
};

type PositionedBlock = { top: number; block: PageBlock };

const boxArea = ({ left, right, bottom, top }: Box): number => (right - left) * (top - bottom);

const innermostBox = <T extends Box>(item: PageTextItem, boxes: T[]): T | undefined =>
  boxes.filter((box) => isInside(item, box)).sort((a, b) => boxArea(a) - boxArea(b))[0];

const groupByInnermostBox = <T extends Box>(items: PageTextItem[], boxes: T[]): Map<T | undefined, PageTextItem[]> => {
  const itemsByBox = new Map<T | undefined, PageTextItem[]>();
  items.forEach((item) => {
    const box = innermostBox(item, boxes);
    itemsByBox.set(box, [...(itemsByBox.get(box) ?? []), item]);
  });
  return itemsByBox;
};

const toTextBlock = (top: number, items: PageTextItem[]): PositionedBlock => ({
  top,
  block: { type: 'text', lines: groupLines(items).map(joinLine).filter((line) => line.length > 0) },
});

const buildTextBlocks = (items: PageTextItem[], boxes: Box[]): PositionedBlock[] =>
  [...groupByInnermostBox(items, boxes)].flatMap(([box, boxItems]) =>
    box ? [toTextBlock(box.top, boxItems)] : groupLines(boxItems).map((line) => toTextBlock(line[0]?.y ?? 0, line)),
  );

const hasText = (items: PageTextItem[] | undefined): boolean => (items ?? []).some((item) => item.text.trim().length > 0);

export const buildPageBlocks = (page: PageContent): PageBlock[] => {
  const tables = detectTables(page.segments);
  const itemsByCell = groupByInnermostBox(page.items, tables.flatMap(({ cells }) => cells));
  const textBlocks = buildTextBlocks(itemsByCell.get(undefined) ?? [], page.boxes).filter(
    ({ block }) => block.type === 'text' && block.lines.length > 0,
  );
  const tableBlocks: PositionedBlock[] = tables
    .filter((table) => table.cells.some((cell) => hasText(itemsByCell.get(cell))))
    .map((table) => ({ top: table.top, block: { type: 'table', ...renderTable(table, itemsByCell) } }));
  const positioned = [...textBlocks, ...tableBlocks].sort((a, b) => b.top - a.top);

  return positioned.reduce<PageBlock[]>((blocks, { block }) => {
    const last = blocks.at(-1);
    if (last?.type === 'text' && block.type === 'text') {
      return [...blocks.slice(0, -1), { type: 'text', lines: [...last.lines, ...block.lines] }];
    }
    return [...blocks, block];
  }, []);
};
