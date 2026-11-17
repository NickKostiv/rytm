import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseProtocolList } from './protocolList.js';
import { type SyncOutcome, syncSources } from './syncSources.js';

const PROTOCOL_LIST_PATH = fileURLToPath(new URL('../../../../protocols.md', import.meta.url));
const SOURCES_DIR = fileURLToPath(new URL('../../data/sources/', import.meta.url));
const SHA_PREFIX_LENGTH = 12;

const formatOutcome = (outcome: SyncOutcome): string => {
  if (outcome.kind === 'failed') {
    const kept = outcome.keptPrevious ? 'previous version kept' : 'no previous version';
    return `FAILED     lines ${outcome.source.lines.join(',')}  ${outcome.source.id}  ${outcome.reason}; ${kept}`;
  }
  const { row } = outcome;
  return [
    outcome.kind.toUpperCase().padEnd(10),
    `lines ${row.protocolLines.join(',')}`,
    row.id,
    `${row.bytes} bytes`,
    `sha256 ${row.sha256.slice(0, SHA_PREFIX_LENGTH)}`,
    `validity ${row.validity}`,
  ].join('  ');
};

const countOutcomes = (outcomes: SyncOutcome[], kind: SyncOutcome['kind']): number =>
  outcomes.filter((outcome) => outcome.kind === kind).length;

const list = parseProtocolList(await readFile(PROTOCOL_LIST_PATH, 'utf8'));
const duplicates = list.sources.filter(({ lines }) => lines.length > 1);
console.log(`protocols.md: ${list.lineCount} lines, ${list.sources.length + list.skippedScanned.length} unique URLs`);
duplicates.forEach(({ lines, id }) => console.log(`duplicate: lines ${lines.join(', ')} are the same URL (${id}); ingested once`));
list.skippedScanned.forEach(({ lines, url }) => console.log(`skipped (scanned, needs OCR): line ${lines.join(', ')} ${url}`));
list.sources.forEach(({ lines, warnings }) =>
  warnings.forEach((warning) => console.log(`warning line ${lines.join(', ')}: ${warning}`)),
);

const { rows, outcomes } = await syncSources({ sources: list.sources, sourcesDir: SOURCES_DIR });
outcomes.forEach((outcome) => console.log(formatOutcome(outcome)));

const failed = countOutcomes(outcomes, 'failed');
console.log(
  [
    `added ${countOutcomes(outcomes, 'added')}`,
    `${countOutcomes(outcomes, 'changed')} changed`,
    `unchanged ${countOutcomes(outcomes, 'unchanged')}`,
    `failed ${failed}`,
    `duplicate ${duplicates.length}`,
    `skipped scanned ${list.skippedScanned.length}`,
    `registry rows ${rows.length}`,
  ].join(', '),
);
if (failed > 0) process.exitCode = 1;
