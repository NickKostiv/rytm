import { parseProtocolFileName } from './parseProtocolFileName.js';

export type ProtocolSource = {
  id: string;
  url: string;
  lines: number[];
  orderNumber: string;
  orderDate: string;
  annex: string | null;
  warnings: string[];
};

export type SkippedProtocol = { url: string; lines: number[] };

export type ProtocolList = {
  lineCount: number;
  sources: ProtocolSource[];
  skippedScanned: SkippedProtocol[];
};

const OFFICIAL_HOST = 'moz.gov.ua';

const SCANNED_URLS: ReadonlySet<string> = new Set([
  'https://moz.gov.ua/uploads/11/55450-dn_714_25042024_dod1.pdf',
  'https://moz.gov.ua/uploads/11/55448-dn_714_25042024_dod2.pdf',
  'https://moz.gov.ua/uploads/11/55452-dn_714_25042024_dod3.pdf',
  'https://moz.gov.ua/uploads/11/55453-dn_714_25042024_dod6.pdf',
]);

const assertOfficialUrl = (url: string, line: number): void => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== OFFICIAL_HOST) {
    throw new Error(`protocols.md line ${line}: expected an https://${OFFICIAL_HOST} URL`);
  }
};

const groupLinesByUrl = (text: string): SkippedProtocol[] => {
  const linesByUrl = new Map<string, number[]>();
  text.split('\n').forEach((raw, index) => {
    const url = raw.trim();
    if (!url) return;
    assertOfficialUrl(url, index + 1);
    linesByUrl.set(url, [...(linesByUrl.get(url) ?? []), index + 1]);
  });
  return [...linesByUrl].map(([url, lines]) => ({ url, lines }));
};

const toProtocolSource = ({ url, lines }: SkippedProtocol): ProtocolSource => {
  const { orderNumber, orderDate, annex, warnings } = parseProtocolFileName(url);
  const duplicateWarnings =
    lines.length > 1 ? [`URL listed on lines ${lines.join(', ')}; ingested once (resolution tracked in A3-05)`] : [];
  return {
    id: `${orderNumber}-${orderDate.replaceAll('-', '')}-dod${annex ?? ''}`,
    url,
    lines,
    orderNumber,
    orderDate,
    annex,
    warnings: [...warnings, ...duplicateWarnings],
  };
};

const mostCommonDate = (sources: ProtocolSource[]): string | undefined => {
  const counts = new Map<string, number>();
  sources.forEach(({ orderDate }) => counts.set(orderDate, (counts.get(orderDate) ?? 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
};

const flagSiblingDateConflicts = (sources: ProtocolSource[]): ProtocolSource[] =>
  sources.map((source) => {
    const siblings = sources.filter(({ orderNumber }) => orderNumber === source.orderNumber);
    const siblingDate = mostCommonDate(siblings);
    if (!siblingDate || siblingDate === source.orderDate) return source;
    const warning = `file-name date ${source.orderDate} differs from sibling annexes of order ${source.orderNumber} (${siblingDate}); order date must come from the document`;
    return { ...source, warnings: [...source.warnings, warning] };
  });

const assertUniqueIds = (sources: ProtocolSource[]): void => {
  const ids = new Set(sources.map(({ id }) => id));
  if (ids.size !== sources.length) throw new Error('Two protocol URLs map to the same source id');
};

export const parseProtocolList = (text: string): ProtocolList => {
  const unique = groupLinesByUrl(text);
  const sources = flagSiblingDateConflicts(
    unique.filter(({ url }) => !SCANNED_URLS.has(url)).map(toProtocolSource),
  );
  assertUniqueIds(sources);
  return {
    lineCount: unique.reduce((count, { lines }) => count + lines.length, 0),
    sources,
    skippedScanned: unique.filter(({ url }) => SCANNED_URLS.has(url)),
  };
};
