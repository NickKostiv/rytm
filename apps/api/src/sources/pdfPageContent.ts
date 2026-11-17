import { getDocument, OPS, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Box, RuleSegment } from './tableCells.js';

export type PageTextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  directionX: number;
  directionY: number;
};

export type PageContent = { pageNumber: number; items: PageTextItem[]; segments: RuleSegment[]; boxes: Box[] };

type Matrix = [number, number, number, number, number, number];

type PaintedBox = { x0: number; y0: number; x1: number; y1: number; isStroke: boolean };

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const MAX_RULE_THICKNESS = 3;
const MIN_RULE_LENGTH = 2;
const MIN_CONTAINER_SIZE = 10;
const PAINT_OPS: ReadonlySet<number> = new Set([
  OPS.stroke,
  OPS.closeStroke,
  OPS.fill,
  OPS.eoFill,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
]);
const DRAW_MOVE_TO = 0;
const DRAW_LINE_TO = 1;
const DRAW_CURVE_TO = 2;
const DRAW_QUADRATIC_CURVE_TO = 3;
const DRAW_CLOSE_PATH = 4;

const SYMBOL_FONT_CHARACTERS: Readonly<Record<string, string>> = {
  '\uF0B0': '°',
  '\uF0B7': '•',
  '\uF0A7': '▪',
  '\uF0D8': '➢',
};

const normalizeSymbolFontText = (text: string): string =>
  text.replace(/[\uF0A7\uF0B0\uF0B7\uF0D8]/gu, (character) => SYMBOL_FONT_CHARACTERS[character] ?? character);

const toNumber = (value: unknown): number => (typeof value === 'number' ? value : Number.NaN);

const toMatrix = (value: unknown): Matrix | null => {
  if (!Array.isArray(value) && !(value instanceof Float32Array)) return null;
  const numbers = Array.from<unknown, number>(value, toNumber);
  const [a, b, c, d, e, f] = numbers;
  if (a === undefined || b === undefined || c === undefined || d === undefined || e === undefined || f === undefined) return null;
  return [a, b, c, d, e, f];
};

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];

const applyMatrix = (m: Matrix, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

const subpathBoxes = (data: Float32Array, ctm: Matrix): Array<Omit<PaintedBox, 'isStroke'>> => {
  const boxes: Array<Omit<PaintedBox, 'isStroke'>> = [];
  const points: Array<[number, number]> = [];
  const flush = (): void => {
    if (points.length > 0) {
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      boxes.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
    }
    points.length = 0;
  };
  const coordinateCount: Record<number, number> = {
    [DRAW_MOVE_TO]: 2,
    [DRAW_LINE_TO]: 2,
    [DRAW_CURVE_TO]: 6,
    [DRAW_QUADRATIC_CURVE_TO]: 4,
    [DRAW_CLOSE_PATH]: 0,
  };
  for (let index = 0; index < data.length; ) {
    const op = data[index] ?? DRAW_CLOSE_PATH;
    if (op === DRAW_MOVE_TO) flush();
    const count = coordinateCount[op] ?? 0;
    for (let offset = 1; offset < count; offset += 2) {
      points.push(applyMatrix(ctm, data[index + offset] ?? 0, data[index + offset + 1] ?? 0));
    }
    index += count + 1;
  }
  flush();
  return boxes;
};

const boxToSegment = ({ x0, y0, x1, y1 }: PaintedBox): RuleSegment | null => {
  const width = x1 - x0;
  const height = y1 - y0;
  if (height <= MAX_RULE_THICKNESS && width >= MIN_RULE_LENGTH) {
    return { orientation: 'horizontal', position: (y0 + y1) / 2, start: x0, end: x1 };
  }
  if (width <= MAX_RULE_THICKNESS && height >= MIN_RULE_LENGTH) {
    return { orientation: 'vertical', position: (x0 + x1) / 2, start: y0, end: y1 };
  }
  return null;
};

const strokedBoxEdges = (box: PaintedBox): RuleSegment[] => [
  { orientation: 'horizontal', position: box.y0, start: box.x0, end: box.x1 },
  { orientation: 'horizontal', position: box.y1, start: box.x0, end: box.x1 },
  { orientation: 'vertical', position: box.x0, start: box.y0, end: box.y1 },
  { orientation: 'vertical', position: box.x1, start: box.y0, end: box.y1 },
];

const toSegments = (box: PaintedBox): RuleSegment[] => {
  const segment = boxToSegment(box);
  if (segment) return [segment];
  return box.isStroke ? strokedBoxEdges(box) : [];
};

const toContainer = ({ x0, y0, x1, y1 }: PaintedBox): Box[] =>
  x1 - x0 >= MIN_CONTAINER_SIZE && y1 - y0 >= MIN_CONTAINER_SIZE ? [{ left: x0, right: x1, bottom: y0, top: y1 }] : [];

const isStrokeOp = (op: number): boolean => op === OPS.stroke || op === OPS.closeStroke;

const pathBoxes = (args: unknown, ctm: Matrix): PaintedBox[] => {
  if (!Array.isArray(args)) return [];
  const [paintOp, pathData] = args;
  const data: unknown = Array.isArray(pathData) ? pathData[0] : undefined;
  if (typeof paintOp !== 'number' || !PAINT_OPS.has(paintOp) || !(data instanceof Float32Array)) return [];
  return subpathBoxes(data, ctm).map((box) => ({ ...box, isStroke: isStrokeOp(paintOp) }));
};

const extractPaintedBoxes = (fnArray: number[], argsArray: unknown[]): PaintedBox[] => {
  const stack: Matrix[] = [];
  let ctm = IDENTITY;
  const boxes: PaintedBox[] = [];
  fnArray.forEach((fn, index) => {
    const args = argsArray[index];
    if (fn === OPS.save) stack.push(ctm);
    if (fn === OPS.restore) ctm = stack.pop() ?? IDENTITY;
    if (fn === OPS.transform) ctm = multiply(toMatrix(args) ?? IDENTITY, ctm);
    if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      ctm = multiply(toMatrix(Array.isArray(args) ? args[0] : null) ?? IDENTITY, ctm);
    }
    if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? IDENTITY;
    if (fn === OPS.constructPath) boxes.push(...pathBoxes(args, ctm));
  });
  return boxes;
};

const readPage = async (document: PDFDocumentProxy, pageNumber: number): Promise<PageContent> => {
  const page = await document.getPage(pageNumber);
  const [textContent, operatorList] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
  const items = textContent.items.flatMap((item): PageTextItem[] => {
    if (!('str' in item) || item.str.length === 0) return [];
    const [a = 0, b = 0, , , x = 0, y = 0] = item.transform.map(toNumber);
    const fontSize = Math.hypot(a, b);
    const text = normalizeSymbolFontText(item.str);
    if (fontSize === 0) return [{ text, x, y, width: item.width, fontSize, directionX: 1, directionY: 0 }];
    return [{ text, x, y, width: item.width, fontSize, directionX: a / fontSize, directionY: b / fontSize }];
  });
  const painted = extractPaintedBoxes(operatorList.fnArray, operatorList.argsArray);
  return { pageNumber, items, segments: painted.flatMap(toSegments), boxes: painted.flatMap(toContainer) };
};

export const readPdfPages = async (data: Uint8Array): Promise<PageContent[]> => {
  const loadingTask = getDocument({ data, verbosity: 0 });
  try {
    const document = await loadingTask.promise;
    const pages: PageContent[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      pages.push(await readPage(document, pageNumber));
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
};
