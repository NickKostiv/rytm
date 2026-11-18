import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createLazyLoader } from '../lazyLoader.js';
import type { SourceChunk } from '../sources/sourceChunks.js';
import { isRetrievable, readRegistry, SOURCE_REGISTRY_PATH, type SourceRow } from '../sources/sourceRegistry.js';
import { resolveOrderDates } from './resolveOrderDates.js';
import { toQueryTerms, toSearchTerms } from './searchTerms.js';

export type RetrievedFragment = { chunk: SourceChunk; row: SourceRow; score: number };

export type SourceIndex = { search: (query: string) => RetrievedFragment[] };

type IndexedChunk = { chunk: SourceChunk; row: SourceRow; termCounts: Map<string, number>; length: number };

const BM25_K1 = 1.2;
const BM25_B = 0.75;
const MIN_QUERY_COVERAGE = 0.6;
const MIN_DOCUMENT_SCORE_RATIO = 0.5;
const MAX_FRAGMENTS_PER_DOCUMENT = 3;
export const MAX_FRAGMENTS_TOTAL = 16;
const UNSEEN_TERM_DOCUMENT_FREQUENCY = 0.5;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isSourceChunk = (value: unknown): value is SourceChunk =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.documentId === 'string' &&
  typeof value.sourceSha256 === 'string' &&
  typeof value.pageStart === 'number' &&
  typeof value.pageEnd === 'number' &&
  isStringArray(value.headingPath) &&
  (value.type === 'text' || value.type === 'table') &&
  typeof value.content === 'string' &&
  isStringArray(value.warnings);

const parseChunks = (text: string): SourceChunk[] =>
  text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const parsed: unknown = JSON.parse(line);
      if (!isSourceChunk(parsed)) throw new Error('Source chunk file is malformed');
      return parsed;
    });

const countTerms = (terms: string[]): Map<string, number> =>
  terms.reduce((counts, term) => counts.set(term, (counts.get(term) ?? 0) + 1), new Map<string, number>());

export const isChunkRetrievable = (chunk: SourceChunk, row: SourceRow | undefined): row is SourceRow =>
  row !== undefined && isRetrievable(row) && chunk.warnings.length === 0 && chunk.sourceSha256 === row.sha256;

export const buildSourceIndex = (chunks: SourceChunk[], rows: SourceRow[]): SourceIndex => {
  const rowsById = new Map(resolveOrderDates(rows).map((row) => [row.id, row]));
  const indexed: IndexedChunk[] = chunks.flatMap((chunk) => {
    const row = rowsById.get(chunk.documentId);
    if (!isChunkRetrievable(chunk, row)) return [];
    const terms = toSearchTerms([...chunk.headingPath, chunk.content].join('\n'));
    return [{ chunk, row, termCounts: countTerms(terms), length: terms.length }];
  });
  const averageLength = indexed.reduce((sum, { length }) => sum + length, 0) / Math.max(indexed.length, 1);
  const documentFrequency = new Map<string, number>();
  indexed.forEach(({ termCounts }) =>
    termCounts.forEach((_, term) => documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)),
  );
  const inverseFrequency = (term: string): number => {
    const frequency = documentFrequency.get(term) ?? UNSEEN_TERM_DOCUMENT_FREQUENCY;
    return Math.log(1 + (indexed.length - frequency + 0.5) / (frequency + 0.5));
  };

  const scoreChunk = (entry: IndexedChunk, terms: string[]): { score: number; matchedWeight: number } =>
    terms.reduce(
      (total, term) => {
        const count = entry.termCounts.get(term) ?? 0;
        if (count === 0) return total;
        const weight = inverseFrequency(term);
        const saturation = (count * (BM25_K1 + 1)) / (count + BM25_K1 * (1 - BM25_B + (BM25_B * entry.length) / averageLength));
        return { score: total.score + weight * saturation, matchedWeight: total.matchedWeight + weight };
      },
      { score: 0, matchedWeight: 0 },
    );

  const search = (query: string): RetrievedFragment[] => {
    const terms = [...new Set(toQueryTerms(query))];
    const queryWeight = terms.reduce((sum, term) => sum + inverseFrequency(term), 0);
    if (queryWeight === 0) return [];
    const scored = indexed
      .map((entry) => ({ entry, ...scoreChunk(entry, terms) }))
      .filter(({ matchedWeight }) => matchedWeight / queryWeight >= MIN_QUERY_COVERAGE)
      .sort((a, b) => b.score - a.score || a.entry.chunk.id.localeCompare(b.entry.chunk.id));
    const topScore = scored[0]?.score ?? 0;
    const perDocument = new Map<string, number>();
    return scored
      .filter(({ score }) => score >= topScore * MIN_DOCUMENT_SCORE_RATIO)
      .filter(({ entry }) => {
        const taken = perDocument.get(entry.row.id) ?? 0;
        perDocument.set(entry.row.id, taken + 1);
        return taken < MAX_FRAGMENTS_PER_DOCUMENT;
      })
      .slice(0, MAX_FRAGMENTS_TOTAL)
      .map(({ entry, score }) => ({ chunk: entry.chunk, row: entry.row, score }));
  };

  return { search };
};

export const loadSourceIndex = async (chunksPath: string, registryPath: string): Promise<SourceIndex> => {
  const [chunksText, rows] = await Promise.all([readFile(chunksPath, 'utf8'), readRegistry(registryPath)]);
  return buildSourceIndex(parseChunks(chunksText), rows);
};

const CHUNKS_PATH = fileURLToPath(new URL('../../data/sources/chunks.jsonl', import.meta.url));

export const createLazySourceIndex = (): (() => Promise<SourceIndex>) =>
  createLazyLoader(() => loadSourceIndex(CHUNKS_PATH, SOURCE_REGISTRY_PATH));
