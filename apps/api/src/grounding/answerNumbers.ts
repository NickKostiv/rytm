export type AnswerSegment = { text: string; sourceTexts: string[] };

type TokenSpan = { token: string; start: number; end: number };

const SPACE_VARIANTS = /[\u00A0\u2007\u202F\u2009]/g;
const DASH_VARIANTS = /[\u2012\u2013\u2014\u2212]/g;
const DECIMAL_COMMA = /(\d),(\d)/g;
const DIGIT_GROUPS = /(?<!\d)\d{1,3}(?: \d{3})+(?!\d)/g;
const ORDERED_LIST_MARKER = /^\s*\d+[.)]\s/gm;
const NUMBER = /\d+(?:[.:]\d+)*/g;
const NON_ASCII_NUMERAL = /(?![0-9])\p{N}/gu;
const SIMPLE_DECIMAL = /^\d+\.\d+$/;
const RATIO_SEPARATOR = ':';

export const normalizeNumberText = (text: string): string =>
  text
    .replace(SPACE_VARIANTS, ' ')
    .replace(DASH_VARIANTS, '-')
    .replace(DECIMAL_COMMA, '$1.$2')
    .replace(DIGIT_GROUPS, (group) => group.replaceAll(' ', ''));

const canonicalNumber = (token: string): string =>
  SIMPLE_DECIMAL.test(token) ? token.replace(/0+$/, '').replace(/\.$/, '') : token;

const sourceNumbers = (sourceText: string): string[] =>
  (normalizeNumberText(sourceText).match(NUMBER) ?? []).flatMap((token) =>
    token.includes(RATIO_SEPARATOR) ? [token, ...token.split(RATIO_SEPARATOR)] : [token],
  ).map(canonicalNumber);

const tokenSpans = (text: string, pattern: RegExp): TokenSpan[] =>
  [...text.matchAll(pattern)].map((match) => ({ token: match[0], start: match.index, end: match.index + match[0].length }));

const segmentBounds = (segments: AnswerSegment[]): { start: number; end: number; sourceTexts: string[] }[] =>
  segments.reduce<{ start: number; end: number; sourceTexts: string[] }[]>((bounds, { text, sourceTexts }) => {
    const start = bounds.at(-1)?.end ?? 0;
    return [...bounds, { start, end: start + text.length, sourceTexts }];
  }, []);

const isTokenVerified = (
  span: TokenSpan,
  bounds: ReturnType<typeof segmentBounds>,
  isFoundIn: (sourceTexts: string[]) => boolean,
): boolean => {
  const overlapping = bounds.filter(({ start, end }) => span.start < end && span.end > start);
  if (overlapping.some(({ sourceTexts }) => sourceTexts.length === 0)) return false;
  return isFoundIn(overlapping.flatMap(({ sourceTexts }) => sourceTexts));
};

const normalizeSegments = (segments: AnswerSegment[]): AnswerSegment[] =>
  segments.map(({ text, sourceTexts }) => ({ text: normalizeNumberText(text), sourceTexts }));

export const findUnverifiedNumbers = (segments: AnswerSegment[]): string[] => {
  const normalized = normalizeSegments(segments);
  const bounds = segmentBounds(normalized);
  const masked = normalized
    .map(({ text }) => text)
    .join('')
    .replace(ORDERED_LIST_MARKER, (marker) => ' '.repeat(marker.length));
  const unverifiedNumbers = tokenSpans(masked, NUMBER).filter(
    (span) => !isTokenVerified(span, bounds, (texts) => texts.flatMap(sourceNumbers).includes(canonicalNumber(span.token))),
  );
  const unverifiedNumerals = tokenSpans(masked, NON_ASCII_NUMERAL).filter(
    (span) => !isTokenVerified(span, bounds, (texts) => texts.some((text) => text.includes(span.token))),
  );
  return [...unverifiedNumbers, ...unverifiedNumerals].map(({ token }) => canonicalNumber(token));
};
