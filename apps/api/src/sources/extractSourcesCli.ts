import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDocumentOrderReference } from './documentOrderReference.js';
import { readPdfPages } from './pdfPageContent.js';
import { buildDocumentChunks, type SourceChunk } from './sourceChunks.js';
import { type DocumentCheck, readRegistry, type SourceRow, writeRegistry } from './sourceRegistry.js';
import { REGISTRY_FILE_NAME } from './syncSources.js';
import { writeFileAtomic } from './writeFileAtomic.js';

const CHUNKS_FILE_NAME = 'chunks.jsonl';

const SOURCES_DIR = fileURLToPath(new URL('../../data/sources/', import.meta.url));
const FIRST_PAGE = 1;
const PERCENT = 100;

const checkDocument = (row: SourceRow, pageCount: number, chunks: SourceChunk[]): DocumentCheck => {
  const firstPageText = chunks
    .filter(({ pageStart }) => pageStart === FIRST_PAGE)
    .map(({ content }) => content)
    .join(' ');
  const reference = findDocumentOrderReference(firstPageText);
  if (!reference) {
    return { pageCount, orderNumber: null, orderDate: null, mismatches: ['order reference not found on page 1'] };
  }
  const mismatches = [
    reference.orderNumber === row.orderNumber
      ? null
      : `file name order ${row.orderNumber}, document order ${reference.orderNumber}`,
    reference.orderDate === row.orderDate ? null : `file name date ${row.orderDate}, document date ${reference.orderDate}`,
  ].filter((mismatch) => mismatch !== null);
  return { pageCount, ...reference, mismatches };
};

const applyDocumentCheck = (row: SourceRow, documentCheck: DocumentCheck): SourceRow => ({
  ...row,
  dateSource: documentCheck.mismatches.length === 0 ? 'document' : 'filename',
  documentCheck,
});

const describeStats = (row: SourceRow, chunks: SourceChunk[]): string => {
  const text = chunks.map(({ content }) => content).join('\n');
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const cyrillic = text.match(/\p{Script=Cyrillic}/gu)?.length ?? 0;
  const replacement = text.match(/�/gu)?.length ?? 0;
  const tables = chunks.filter(({ type }) => type === 'table').length;
  const cyrillicShare = letters === 0 ? 0 : (PERCENT * cyrillic) / letters;
  return [
    `lines ${row.protocolLines.join(',')}`.padEnd(12),
    row.id.padEnd(20),
    `pages ${row.documentCheck?.pageCount ?? '?'}`,
    `chunks ${chunks.length}`,
    `tables ${tables}`,
    `U+FFFD ${replacement}`,
    `cyrillic ${cyrillicShare.toFixed(1)}%`,
    `order ${row.orderNumber} ${row.orderDate} (${row.dateSource})`,
    ...(row.documentCheck?.mismatches ?? []).map((mismatch) => `MISMATCH ${mismatch}`),
    ...chunks.flatMap(({ id, warnings }) => warnings.map((warning) => `\n    WARNING ${id}: ${warning}`)),
  ].join('  ');
};

const extractRow = async (row: SourceRow): Promise<{ row: SourceRow; chunks: SourceChunk[] }> => {
  const data = await readFile(join(SOURCES_DIR, row.pdfFile));
  const sha256 = createHash('sha256').update(data).digest('hex');
  if (sha256 !== row.sha256) throw new Error(`${row.id}: PDF on disk does not match registry sha256; run sources:fetch`);
  const pages = await readPdfPages(new Uint8Array(data));
  const chunks = buildDocumentChunks(row.id, row.sha256, pages);
  return { row: applyDocumentCheck(row, checkDocument(row, pages.length, chunks)), chunks };
};

const registryPath = join(SOURCES_DIR, REGISTRY_FILE_NAME);
const extracted: Array<{ row: SourceRow; chunks: SourceChunk[] }> = [];
for (const row of await readRegistry(registryPath)) {
  const result = await extractRow(row);
  console.log(describeStats(result.row, result.chunks));
  extracted.push(result);
}

const chunkLines = extracted.flatMap(({ chunks }) => chunks.map((chunk) => JSON.stringify(chunk)));
await writeFileAtomic(join(SOURCES_DIR, CHUNKS_FILE_NAME), `${chunkLines.join('\n')}\n`);
await writeRegistry(registryPath, extracted.map(({ row }) => row));
console.log(`documents ${extracted.length}, chunks ${chunkLines.length}`);
