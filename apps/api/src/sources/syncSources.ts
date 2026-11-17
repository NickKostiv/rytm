import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProtocolSource } from './protocolList.js';
import { readRegistry, SOURCE_PUBLISHER, type SourceRow, writeRegistry } from './sourceRegistry.js';
import { writeFileAtomic } from './writeFileAtomic.js';

export type FetchPdf = (url: string, init: RequestInit) => Promise<Response>;

export type SyncOutcome =
  | { kind: 'added' | 'changed' | 'unchanged'; row: SourceRow }
  | { kind: 'failed'; source: ProtocolSource; reason: string; keptPrevious: boolean };

export type SyncResult = { rows: SourceRow[]; outcomes: SyncOutcome[] };

export type SyncOptions = {
  sources: ProtocolSource[];
  sourcesDir: string;
  fetchPdf?: FetchPdf;
  now?: () => Date;
};

type DownloadResult = { ok: true; bytes: Buffer } | { ok: false; reason: string };

export const REGISTRY_FILE_NAME = 'registry.json';
export const PDF_DIR_NAME = 'pdf';

const USER_AGENT = 'RytmSourceFetcher/0.1 (medical reference prototype; sequential, manual re-check)';
const DOWNLOAD_TIMEOUT_MS = 60_000;
const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');

const describeError = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';

const downloadPdf = async (url: string, fetchPdf: FetchPdf): Promise<DownloadResult> => {
  try {
    const response = await fetchPdf(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
      const contentType = response.headers.get('content-type') ?? 'none';
      return { ok: false, reason: `not a PDF (content-type ${contentType}, ${bytes.length} bytes)` };
    }
    return { ok: true, bytes };
  } catch (error) {
    return { ok: false, reason: describeError(error) };
  }
};

const describeSource = (source: ProtocolSource): Pick<
  SourceRow,
  'id' | 'url' | 'protocolLines' | 'orderNumber' | 'orderDate' | 'dateSource' | 'annex' | 'pdfFile' | 'attribution' | 'warnings'
> => ({
  id: source.id,
  url: source.url,
  protocolLines: source.lines,
  orderNumber: source.orderNumber,
  orderDate: source.orderDate,
  dateSource: 'filename',
  annex: source.annex,
  pdfFile: `${PDF_DIR_NAME}/${source.id}.pdf`,
  attribution: { publisher: SOURCE_PUBLISHER, sourceUrl: source.url },
  warnings: source.warnings,
});

const syncSource = async (
  source: ProtocolSource,
  previous: SourceRow | undefined,
  options: Required<SyncOptions>,
): Promise<SyncOutcome> => {
  const download = await downloadPdf(source.url, options.fetchPdf);
  if (!download.ok) {
    return { kind: 'failed', source, reason: download.reason, keptPrevious: previous !== undefined };
  }

  const sha256 = createHash('sha256').update(download.bytes).digest('hex');
  const checkedAt = options.now().toISOString();
  const metadata = describeSource(source);
  if (previous?.sha256 === sha256) {
    return { kind: 'unchanged', row: { ...previous, ...metadata, dateSource: previous.dateSource, checkedAt } };
  }

  await writeFileAtomic(join(options.sourcesDir, metadata.pdfFile), download.bytes);
  const row: SourceRow = {
    ...metadata,
    validity: previous ? 'needs_review' : 'unknown',
    sha256,
    previousSha256: previous?.sha256 ?? null,
    bytes: download.bytes.length,
    fetchedAt: checkedAt,
    checkedAt,
    documentCheck: null,
  };
  return { kind: previous ? 'changed' : 'added', row };
};

export const syncSources = async (options: SyncOptions): Promise<SyncResult> => {
  const resolved: Required<SyncOptions> = {
    ...options,
    fetchPdf: options.fetchPdf ?? fetch,
    now: options.now ?? ((): Date => new Date()),
  };
  const registryPath = join(resolved.sourcesDir, REGISTRY_FILE_NAME);
  await mkdir(join(resolved.sourcesDir, PDF_DIR_NAME), { recursive: true });

  const rowsByUrl = new Map((await readRegistry(registryPath)).map((row) => [row.url, row]));
  const outcomes: SyncOutcome[] = [];
  // Sequential on purpose: moz.gov.ua may rate-limit bulk downloads.
  for (const source of resolved.sources) {
    const outcome = await syncSource(source, rowsByUrl.get(source.url), resolved);
    outcomes.push(outcome);
    if (outcome.kind !== 'failed') rowsByUrl.set(source.url, outcome.row);
  }

  const rows = [...rowsByUrl.values()];
  await writeRegistry(registryPath, rows);
  return { rows, outcomes };
};
