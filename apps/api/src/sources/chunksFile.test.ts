import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readRegistry } from './sourceRegistry.js';

const SOURCES_DIR = fileURLToPath(new URL('../../data/sources/', import.meta.url));
const SUSPICIOUS_CHARACTERS = /[�-\u0000-\u0008\u000B-\u001F]/u;

const readChunkLines = async (): Promise<unknown[]> => {
  const text = await readFile(join(SOURCES_DIR, 'chunks.jsonl'), 'utf8');
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line): unknown => JSON.parse(line));
};

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

test('generated chunks contain no U+FFFD, private-use or control characters', async () => {
  const offending = (await readChunkLines()).filter((chunk) => {
    const content = field(chunk, 'content');
    return typeof content !== 'string' || SUSPICIOUS_CHARACTERS.test(content);
  });
  assert.deepEqual(offending.map((chunk) => field(chunk, 'id')), []);
});

test('every chunk belongs to a registry document, matches its sha256 and page range, and ids are unique', async () => {
  const chunks = await readChunkLines();
  const rows = new Map((await readRegistry(join(SOURCES_DIR, 'registry.json'))).map((row) => [row.id, row]));
  const ids = chunks.map((chunk) => field(chunk, 'id'));
  assert.equal(new Set(ids).size, ids.length);
  const invalid = chunks.filter((chunk) => {
    const row = rows.get(String(field(chunk, 'documentId')));
    const page = field(chunk, 'pageStart');
    const pageCount = row?.documentCheck?.pageCount ?? 0;
    return !row || field(chunk, 'sourceSha256') !== row.sha256 || typeof page !== 'number' || page < 1 || page > pageCount;
  });
  assert.deepEqual(invalid.map((chunk) => field(chunk, 'id')), []);
});
