import { toQueryTerms, toSearchTerms } from '../retrieval/searchTerms.js';
import type { RetrievedFragment } from '../retrieval/sourceIndex.js';
import { findNumbersWithUnits } from './answerNumbers.js';
import { fragmentTitle } from './groundingFragments.js';
import { splitSourceUnits } from './verifiedAnswer.js';

export type WithheldQuote = { fragment: RetrievedFragment; units: string[] };

export type QuoteFragments = { contradicting: RetrievedFragment[]; others: RetrievedFragment[] };

type QuoteContext = { answerText: string; questionText: string };

type QuotedUnit = { fragment: RetrievedFragment; unit: string; isReserved: boolean };

type PickedQuote = WithheldQuote & { isContradicting: boolean };

type ScoredUnit = { unit: string; anchors: number; isRelevant: boolean; hasDose: boolean };

type Relevance = { answerNumbers: Set<string>; topicTerms: Set<string> };

export const MAX_WITHHELD_QUOTES = 3;
export const MAX_WITHHELD_QUOTE_LENGTH = 1500;
const STRONG_ANCHOR_COUNT = 2;
const NESTED_ITEM = /^\s*\d+\.\d+\.?\s/;
const LOWERCASE_LETTER = /\p{Ll}/u;

const splitNestedItems = (unit: string): string[] =>
  unit.split('\n').reduce<string[]>((parts, line) => {
    const last = parts.at(-1);
    if (last === undefined || NESTED_ITEM.test(line)) return [...parts, line];
    return [...parts.slice(0, -1), `${last}\n${line}`];
  }, []);

const isHeadingOnly = (unit: string): boolean => !LOWERCASE_LETTER.test(unit) && findNumbersWithUnits(unit).length === 0;

const toQuoteUnits = (fragment: RetrievedFragment): string[] =>
  splitSourceUnits(fragment.chunk.content)
    .flatMap(splitNestedItems)
    .filter((unit) => unit.trim().length > 0 && !isHeadingOnly(unit));

const toTopicTerms = ({ answerText, questionText }: QuoteContext): Set<string> => {
  const questionTerms = new Set(toQueryTerms(questionText));
  const sharedTerms = toSearchTerms(answerText).filter((term) => questionTerms.has(term));
  return sharedTerms.length > 0 ? new Set(sharedTerms) : questionTerms;
};

const isRelevantUnit = (unit: string, { answerNumbers, topicTerms }: Relevance): boolean => {
  const hasTopicTerm = toSearchTerms(unit).some((term) => topicTerms.has(term));
  return answerNumbers.size === 0 ? hasTopicTerm : hasTopicTerm && findNumbersWithUnits(unit).length > 0;
};

const scoreUnit = (unit: string, relevance: Relevance): ScoredUnit => {
  const numbers = findNumbersWithUnits(unit);
  return {
    unit,
    anchors: new Set(numbers.filter((number) => relevance.answerNumbers.has(number))).size,
    isRelevant: isRelevantUnit(unit, relevance),
    hasDose: numbers.length > 0,
  };
};

const unitsOrFirst = (picked: ScoredUnit[], units: ScoredUnit[]): string[] => (picked.length > 0 ? picked : units.slice(0, 1)).map(({ unit }) => unit);

const contradictingUnits = (units: ScoredUnit[]): string[] =>
  unitsOrFirst(units.filter(({ isRelevant, anchors, hasDose }) => isRelevant || anchors > 0 || hasDose), units);

const fallbackUnits = (units: ScoredUnit[]): string[] => unitsOrFirst(units.filter(({ hasDose }) => hasDose), units);

const sectionOf = ({ row, chunk }: RetrievedFragment): string => `${row.id}\n${chunk.headingPath[0] ?? ''}`;

const uniqueFragments = (fragments: RetrievedFragment[]): RetrievedFragment[] =>
  [...new Map(fragments.map((fragment) => [fragment.chunk.id, fragment])).values()];

const takeWithinLength = (units: QuotedUnit[]): QuotedUnit[] => {
  const reservedLength = units.reduce((total, { unit, isReserved }) => total + (isReserved ? unit.length : 0), 0);
  const taken: QuotedUnit[] = [];
  let length = reservedLength;
  let isFull = false;
  for (const quoted of units) {
    if (quoted.isReserved) {
      taken.push(quoted);
      continue;
    }
    isFull ||= taken.length > 0 && length + quoted.unit.length > MAX_WITHHELD_QUOTE_LENGTH;
    if (isFull) continue;
    taken.push(quoted);
    length += quoted.unit.length;
  }
  return taken;
};

const pickQuotes = ({ contradicting, others }: QuoteFragments, context: QuoteContext): PickedQuote[] => {
  const relevance = { answerNumbers: new Set(findNumbersWithUnits(context.answerText)), topicTerms: toTopicTerms(context) };
  const contradictingIds = new Set(contradicting.map(({ chunk }) => chunk.id));
  const scored = uniqueFragments([...contradicting, ...others]).map((fragment) => ({
    fragment,
    units: toQuoteUnits(fragment).map((unit) => scoreUnit(unit, relevance)),
  }));
  const scope = others[0] ? sectionOf(others[0]) : null;
  const inScope = scored.filter(({ fragment }) => !contradictingIds.has(fragment.chunk.id) && sectionOf(fragment) === scope);
  const maxAnchors = Math.max(0, ...inScope.flatMap(({ units }) => units.map(({ anchors }) => anchors)));
  const minAnchors = Math.min(STRONG_ANCHOR_COUNT, maxAnchors);
  const isPicked = ({ anchors, isRelevant }: ScoredUnit): boolean => (maxAnchors > 0 ? anchors >= minAnchors : isRelevant);
  const quotes = scored.flatMap(({ fragment, units }) => {
    if (contradictingIds.has(fragment.chunk.id)) return [{ fragment, units: contradictingUnits(units), isContradicting: true }];
    const picked = inScope.some((entry) => entry.fragment === fragment) ? units.filter(isPicked).map(({ unit }) => unit) : [];
    return [{ fragment, units: picked, isContradicting: false }];
  }).filter(({ units }) => units.length > 0);
  const fallback = scored.find(({ units }) => units.length > 0);
  return quotes.length > 0 || !fallback ? quotes : [{ fragment: fallback.fragment, units: fallbackUnits(fallback.units), isContradicting: false }];
};

export const selectWithheldQuotes = (fragments: QuoteFragments, context: QuoteContext): WithheldQuote[] => {
  const quotes = pickQuotes(fragments, context).slice(0, MAX_WITHHELD_QUOTES);
  const taken = takeWithinLength(
    quotes.flatMap(({ fragment, units, isContradicting }) =>
      units.map((unit) => ({ fragment, unit, isReserved: isContradicting && findNumbersWithUnits(unit).length > 0 })),
    ),
  );
  return quotes
    .map(({ fragment }) => ({ fragment, units: taken.flatMap((quoted) => (quoted.fragment === fragment ? [quoted.unit] : [])) }))
    .filter(({ units }) => units.length > 0);
};

export const formatWithheldQuote = ({ fragment, units }: WithheldQuote): string => [`${fragmentTitle(fragment)}:`, ...units].join('\n');
