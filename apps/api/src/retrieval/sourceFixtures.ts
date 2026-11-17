import type { SourceChunk } from '../sources/sourceChunks.js';
import type { SourceRow, SourceValidity } from '../sources/sourceRegistry.js';

export const row = (id: string, validity: SourceValidity = 'unknown'): SourceRow => ({
  id,
  url: `https://moz.gov.ua/storage/uploads/fixture/${id}.pdf`,
  protocolLines: [1],
  orderNumber: '1000',
  orderDate: '2025-01-01',
  dateSource: 'filename',
  annex: null,
  validity,
  sha256: `sha-${id}`,
  previousSha256: null,
  bytes: 1,
  fetchedAt: '2026-01-01T00:00:00.000Z',
  checkedAt: '2026-01-01T00:00:00.000Z',
  pdfFile: `pdf/${id}.pdf`,
  attribution: { publisher: 'moz.gov.ua', sourceUrl: '' },
  warnings: [],
  documentCheck: null,
});

export const chunk = (documentId: string, page: number, content: string, overrides: Partial<SourceChunk> = {}): SourceChunk => ({
  id: `${documentId}:p${page}:0`,
  documentId,
  sourceSha256: `sha-${documentId}`,
  pageStart: page,
  pageEnd: page,
  headingPath: [],
  type: 'text',
  content,
  warnings: [],
  ...overrides,
});
