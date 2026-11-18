import { maskStatedVolumes, normalizeNumberText } from '@rytm/dosing';

export type AnswerSegment = { text: string; sourceTexts: string[] };

type TokenSpan = { token: string; start: number; end: number };

const ORDERED_LIST_MARKER = /^\s*\d+[.)]\s/gm;
const NUMBER = /\d+(?:[.:]\d+)*/g;
const NON_ASCII_NUMERAL = /(?![0-9])\p{N}/gu;
const SIMPLE_DECIMAL = /^\d+\.\d+$/;
const RATIO_SEPARATOR = ':';
const UNIT_AFTER_NUMBER =
  /^\s*(?:-\s*\d+(?:\.\d+)?\s*)?(мкг|mcg|µg|μg|мг|mg|нг|ng|гр|г|g|од|мо|ме|iu|ммоль|mmol|%)((?:\s*\/\s*(?:1\s*)?(?:кг|kg|хв|min|год|hour|hr|h|добу|day|мл|ml)|\s+(?:на\s+(?:кожний|кожен)|на|per|for\s+each|each|a|за|кожний|кожен)\s+(?:1\s+)?(?:кілограм(?:и|ів)?|kilograms?|кг|kg|добу|day|хв|min|год|hour|h))*)(?![\p{L}\d])/iu;
const UNIT_QUALIFIER = /(?<!\p{L})(?:кілограм(?:и|ів)?|kilograms?|кг|kg|хв|min|год|hour|hr|h|добу|day|мл|ml)(?!\p{L})/giu;
const UNIT_SPELLINGS: ReadonlyMap<string, string> = new Map([
  ['mcg', 'мкг'],
  ['µg', 'мкг'],
  ['μg', 'мкг'],
  ['mg', 'мг'],
  ['ng', 'нг'],
  ['гр', 'г'],
  ['g', 'г'],
  ['ме', 'мо'],
  ['iu', 'мо'],
  ['mmol', 'ммоль'],
  ['kg', 'кг'],
  ['kilogram', 'кг'],
  ['kilograms', 'кг'],
  ['кілограм', 'кг'],
  ['кілограми', 'кг'],
  ['кілограмів', 'кг'],
  ['min', 'хв'],
  ['hr', 'год'],
  ['hour', 'год'],
  ['h', 'год'],
  ['day', 'добу'],
  ['ml', 'мл'],
]);

type NumberKeys = { answerKey: (text: string, span: TokenSpan) => string; sourceKeys: (sourceText: string) => string[] };

const canonicalNumber = (token: string): string =>
  SIMPLE_DECIMAL.test(token) ? token.replace(/0+$/, '').replace(/\.$/, '') : token;

const sourceNumbers = (sourceText: string): string[] =>
  (normalizeNumberText(sourceText).match(NUMBER) ?? []).flatMap((token) =>
    token.includes(RATIO_SEPARATOR) ? [token, ...token.split(RATIO_SEPARATOR)] : [token],
  ).map(canonicalNumber);

const tokenSpans = (text: string, pattern: RegExp): TokenSpan[] =>
  [...text.matchAll(pattern)].map((match) => ({ token: match[0], start: match.index, end: match.index + match[0].length }));

const canonicalUnit = (unit: string): string => unit.toLowerCase().split('/').map((part) => UNIT_SPELLINGS.get(part) ?? part).join('/');

const unitAfterNumber = (text: string, span: TokenSpan): string | null => {
  const match = UNIT_AFTER_NUMBER.exec(text.slice(span.end));
  return match ? canonicalUnit([match[1] ?? '', ...((match[2] ?? '').match(UNIT_QUALIFIER) ?? [])].join('/')) : null;
};

const numberWithUnit = (text: string, span: TokenSpan): string => {
  const unit = unitAfterNumber(text, span);
  const number = canonicalNumber(span.token);
  return unit ? `${number} ${unit}` : number;
};

const sourceNumbersWithUnits = (sourceText: string): string[] => {
  const normalized = normalizeNumberText(sourceText);
  return [...sourceNumbers(sourceText), ...tokenSpans(normalized, NUMBER).map((span) => numberWithUnit(normalized, span))];
};

const PLAIN_NUMBER_KEYS: NumberKeys = { answerKey: (_text, span) => canonicalNumber(span.token), sourceKeys: sourceNumbers };

const UNIT_NUMBER_KEYS: NumberKeys = { answerKey: numberWithUnit, sourceKeys: sourceNumbersWithUnits };

const segmentBounds = (segments: AnswerSegment[]): { start: number; end: number; sourceTexts: string[] }[] =>
  segments.reduce<{ start: number; end: number; sourceTexts: string[] }[]>((bounds, { text, sourceTexts }) => {
    const start = bounds.at(-1)?.end ?? 0;
    return [...bounds, { start, end: start + text.length, sourceTexts }];
  }, []);

type SegmentBound = ReturnType<typeof segmentBounds>[number];

export type UnverifiedNumberReason = 'uncited' | 'unit_mismatch' | 'absent';

export type UnverifiedNumber = { token: string; reason: UnverifiedNumberReason };

const overlappingBounds = (span: TokenSpan, bounds: SegmentBound[]): SegmentBound[] =>
  bounds.filter(({ start, end }) => span.start < end && span.end > start);

const isTokenVerified = (span: TokenSpan, bounds: SegmentBound[], isFoundIn: (sourceTexts: string[]) => boolean): boolean => {
  const overlapping = overlappingBounds(span, bounds);
  if (overlapping.some(({ sourceTexts }) => sourceTexts.length === 0)) return false;
  return isFoundIn(overlapping.flatMap(({ sourceTexts }) => sourceTexts));
};

const normalizeSegments = (segments: AnswerSegment[]): AnswerSegment[] =>
  segments.map(({ text, sourceTexts }) => ({ text: normalizeNumberText(text), sourceTexts }));

const maskOrderedListMarkers = (text: string): string => text.replace(ORDERED_LIST_MARKER, (marker) => ' '.repeat(marker.length));

const findUnverifiedSpans = (
  segments: AnswerSegment[],
  { mask, keys }: { mask: (text: string) => string; keys: NumberKeys },
): { spans: TokenSpan[]; bounds: SegmentBound[] } => {
  const normalized = normalizeSegments(segments);
  const bounds = segmentBounds(normalized);
  const masked = mask(normalized.map(({ text }) => text).join(''));
  const unverifiedNumbers = tokenSpans(masked, NUMBER).filter(
    (span) => !isTokenVerified(span, bounds, (texts) => texts.flatMap(keys.sourceKeys).includes(keys.answerKey(masked, span))),
  );
  const unverifiedNumerals = tokenSpans(masked, NON_ASCII_NUMERAL).filter(
    (span) => !isTokenVerified(span, bounds, (texts) => texts.some((text) => text.includes(span.token))),
  );
  return { spans: [...unverifiedNumbers, ...unverifiedNumerals], bounds };
};

const unverifiedReason = (span: TokenSpan, bounds: SegmentBound[]): UnverifiedNumberReason => {
  const overlapping = overlappingBounds(span, bounds);
  if (overlapping.some(({ sourceTexts }) => sourceTexts.length === 0)) return 'uncited';
  const sourceTexts = overlapping.flatMap(({ sourceTexts: texts }) => texts);
  return sourceTexts.flatMap(sourceNumbers).includes(canonicalNumber(span.token)) ? 'unit_mismatch' : 'absent';
};

export const findUnverifiedNumbers = (segments: AnswerSegment[]): string[] =>
  findUnverifiedSpans(segments, { mask: maskOrderedListMarkers, keys: PLAIN_NUMBER_KEYS }).spans.map(({ token }) => canonicalNumber(token));

export const findUnverifiedNumbersByUnit = (segments: AnswerSegment[]): UnverifiedNumber[] => {
  const { spans, bounds } = findUnverifiedSpans(segments, {
    mask: (text) => maskStatedVolumes(maskOrderedListMarkers(text)),
    keys: UNIT_NUMBER_KEYS,
  });
  return spans.map((span) => ({ token: canonicalNumber(span.token), reason: unverifiedReason(span, bounds) }));
};

export const findNumbersWithUnits = (text: string): string[] => {
  const normalized = normalizeNumberText(text);
  return tokenSpans(normalized, NUMBER).flatMap((span) => {
    const unit = unitAfterNumber(normalized, span);
    return unit ? [`${canonicalNumber(span.token)} ${unit}`] : [];
  });
};
