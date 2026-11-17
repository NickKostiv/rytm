import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { parseProtocolList } from './protocolList.js';
import { isRetrievable, readRegistry, SOURCE_VALIDITIES, type SourceRow } from './sourceRegistry.js';
import { type FetchPdf, REGISTRY_FILE_NAME, syncSources } from './syncSources.js';

const URL_A = 'https://moz.gov.ua/storage/uploads/fixture/dn_1000_01012025_dod.pdf';
const URL_B = 'https://moz.gov.ua/storage/uploads/fixture/dn_1000_01012025_dod_2.pdf';
const SOURCES = parseProtocolList([URL_A, URL_B, URL_B].join('\n')).sources;

const SYNTHETIC_PDF_A = '%PDF-1.4 synthetic fixture A';
const SYNTHETIC_PDF_B = '%PDF-1.4 synthetic fixture B';
const SYNTHETIC_PDF_A_MODIFIED = '%PDF-1.4 synthetic fixture A, revised';
const HTML_PAGE = '<!doctype html><html><body>not found</body></html>';

type ServedFile = { status: number; body: string };

let sourcesDir = '';
let served = new Map<string, ServedFile>();

const fakeFetch: FetchPdf = async (url) => {
  const file = served.get(url) ?? { status: 404, body: '' };
  return new Response(file.body, { status: file.status });
};

const sync = (): ReturnType<typeof syncSources> => syncSources({ sources: SOURCES, sourcesDir, fetchPdf: fakeFetch });

const rowFor = (rows: SourceRow[], url: string): SourceRow => {
  const row = rows.find((candidate) => candidate.url === url);
  assert.ok(row, `no registry row for ${url}`);
  return row;
};

beforeEach(async () => {
  sourcesDir = await mkdtemp(join(tmpdir(), 'rytm-sources-'));
  served = new Map([
    [URL_A, { status: 200, body: SYNTHETIC_PDF_A }],
    [URL_B, { status: 200, body: SYNTHETIC_PDF_B }],
  ]);
});

afterEach(async () => {
  await rm(sourcesDir, { recursive: true, force: true });
});

test('first run downloads every source with sha256, fetched-at, unknown validity and attribution', async () => {
  const { outcomes } = await sync();
  const rows = await readRegistry(join(sourcesDir, REGISTRY_FILE_NAME));
  assert.deepEqual(outcomes.map(({ kind }) => kind), ['added', 'added']);
  assert.equal(rows.length, 2);
  rows.forEach((row) => {
    assert.match(row.sha256, /^[0-9a-f]{64}$/);
    assert.ok(!Number.isNaN(Date.parse(row.fetchedAt)));
    assert.equal(row.validity, 'unknown');
    assert.match(row.attribution.publisher, /moz\.gov\.ua/);
    assert.equal(row.attribution.sourceUrl, row.url);
  });
  assert.deepEqual(rowFor(rows, URL_B).protocolLines, [2, 3]);
});

test('second run without changes reports 0 changed and creates no duplicate rows', async () => {
  await sync();
  const { outcomes } = await sync();
  const rows = await readRegistry(join(sourcesDir, REGISTRY_FILE_NAME));
  assert.equal(outcomes.filter(({ kind }) => kind === 'changed').length, 0);
  assert.deepEqual(outcomes.map(({ kind }) => kind), ['unchanged', 'unchanged']);
  assert.equal(rows.length, 2);
});

test('modified file sets needs_review and excludes the document from retrieval', async () => {
  const first = await sync();
  served.set(URL_A, { status: 200, body: SYNTHETIC_PDF_A_MODIFIED });
  const { outcomes } = await sync();
  const rows = await readRegistry(join(sourcesDir, REGISTRY_FILE_NAME));
  const changed = rowFor(rows, URL_A);
  assert.deepEqual(outcomes.map(({ kind }) => kind), ['changed', 'unchanged']);
  assert.equal(changed.validity, 'needs_review');
  assert.equal(changed.previousSha256, rowFor(first.rows, URL_A).sha256);
  assert.equal(isRetrievable(changed), false);
  assert.equal(isRetrievable(rowFor(rows, URL_B)), true);
});

test('needs_review survives a later unchanged run', async () => {
  await sync();
  served.set(URL_A, { status: 200, body: SYNTHETIC_PDF_A_MODIFIED });
  await sync();
  await sync();
  const rows = await readRegistry(join(sourcesDir, REGISTRY_FILE_NAME));
  assert.equal(rowFor(rows, URL_A).validity, 'needs_review');
});

const failureCases: Array<[string, ServedFile, RegExp]> = [
  ['404', { status: 404, body: '' }, /HTTP 404/],
  ['non-PDF response', { status: 200, body: HTML_PAGE }, /not a PDF/],
];

failureCases.forEach(([name, file, reason]) => {
  test(`${name} is reported and the previously indexed version is kept`, async () => {
    const first = await sync();
    const previous = rowFor(first.rows, URL_A);
    served.set(URL_A, file);
    const { outcomes } = await sync();
    const rows = await readRegistry(join(sourcesDir, REGISTRY_FILE_NAME));
    const failure = outcomes[0];
    if (failure?.kind !== 'failed') return assert.fail(`expected a failed outcome, got ${failure?.kind}`);
    assert.match(failure.reason, reason);
    assert.equal(failure.keptPrevious, true);
    assert.deepEqual(rowFor(rows, URL_A), previous);
    assert.equal(await readFile(join(sourcesDir, previous.pdfFile), 'utf8'), SYNTHETIC_PDF_A);
  });
});

test('a source that never downloaded gets no row', async () => {
  served.delete(URL_A);
  const { rows } = await sync();
  assert.equal(rows.some(({ url }) => url === URL_A), false);
  assert.equal(rows.length, 1);
});

test('retrieval keeps unknown and in_force, excludes superseded and needs_review', async () => {
  const { rows } = await sync();
  const base = rowFor(rows, URL_A);
  assert.deepEqual(
    SOURCE_VALIDITIES.map((validity) => isRetrievable({ ...base, validity })),
    [true, true, false, false],
  );
});
