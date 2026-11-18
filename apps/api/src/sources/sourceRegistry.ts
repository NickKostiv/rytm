import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { writeFileAtomic } from './writeFileAtomic.js';

export const SOURCE_REGISTRY_PATH = fileURLToPath(new URL('../../data/sources/registry.json', import.meta.url));

export const SOURCE_VALIDITIES = ['unknown', 'in_force', 'superseded', 'needs_review'] as const;
export type SourceValidity = (typeof SOURCE_VALIDITIES)[number];

export type SourceAttribution = { publisher: string; sourceUrl: string };

export type DocumentCheck = {
  pageCount: number;
  orderNumber: string | null;
  orderDate: string | null;
  mismatches: string[];
};

export type SourceRow = {
  id: string;
  url: string;
  protocolLines: number[];
  orderNumber: string;
  orderDate: string;
  dateSource: 'filename' | 'document';
  annex: string | null;
  validity: SourceValidity;
  sha256: string;
  previousSha256: string | null;
  bytes: number;
  fetchedAt: string;
  checkedAt: string;
  pdfFile: string;
  attribution: SourceAttribution;
  warnings: string[];
  documentCheck: DocumentCheck | null;
};

export const SOURCE_PUBLISHER = 'Міністерство охорони здоровʼя України (moz.gov.ua)';

const RETRIEVABLE_VALIDITIES: ReadonlySet<SourceValidity> = new Set(['in_force', 'unknown']);

export const isRetrievable = (row: SourceRow): boolean => RETRIEVABLE_VALIDITIES.has(row.validity);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'number');

const isValidity = (value: unknown): value is SourceValidity =>
  SOURCE_VALIDITIES.some((validity) => validity === value);

const isAttribution = (value: unknown): value is SourceAttribution =>
  isRecord(value) && typeof value.publisher === 'string' && typeof value.sourceUrl === 'string';

const isNullableString = (value: unknown): value is string | null => typeof value === 'string' || value === null;

const isDocumentCheck = (value: unknown): value is DocumentCheck =>
  isRecord(value) &&
  typeof value.pageCount === 'number' &&
  isNullableString(value.orderNumber) &&
  isNullableString(value.orderDate) &&
  isStringArray(value.mismatches);

const isSourceRow = (value: unknown): value is SourceRow =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.url === 'string' &&
  isNumberArray(value.protocolLines) &&
  typeof value.orderNumber === 'string' &&
  typeof value.orderDate === 'string' &&
  (value.dateSource === 'filename' || value.dateSource === 'document') &&
  isNullableString(value.annex) &&
  isValidity(value.validity) &&
  typeof value.sha256 === 'string' &&
  isNullableString(value.previousSha256) &&
  typeof value.bytes === 'number' &&
  typeof value.fetchedAt === 'string' &&
  typeof value.checkedAt === 'string' &&
  typeof value.pdfFile === 'string' &&
  isAttribution(value.attribution) &&
  isStringArray(value.warnings) &&
  (value.documentCheck === null || isDocumentCheck(value.documentCheck));

const isMissingFile = (error: unknown): boolean =>
  isRecord(error) && error.code === 'ENOENT';

const readRegistryText = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
};

export const readRegistry = async (path: string): Promise<SourceRow[]> => {
  const text = await readRegistryText(path);
  if (text === null) return [];
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed) || !parsed.every(isSourceRow)) {
    throw new Error(`Source registry at ${path} is malformed`);
  }
  return parsed;
};

export const writeRegistry = async (path: string, rows: SourceRow[]): Promise<void> => {
  await writeFileAtomic(path, `${JSON.stringify(rows, null, 2)}\n`);
};
