import type Anthropic from '@anthropic-ai/sdk';
import { checkStatedVolumes } from '@rytm/dosing';
import type { VolumeSourceUnit } from '@rytm/dosing';
import type { RetrievedFragment } from '../retrieval/sourceIndex.js';
import { findUnverifiedNumbersByUnit } from './answerNumbers.js';
import type { AnswerSegment } from './answerNumbers.js';
import type { AnswerSentence } from './answerSentences.js';

export type WebSourceItem = { id: string; url: string; title: string; domain: string; pageAge: string | null };

type WebCitation = { url: string; title: string | null; citedText: string; units: string[] };

type FetchedPage = { url: string; title: string | null; text: string };

type MohCitation = { fragment: RetrievedFragment; citedText: string | null };

type AnswerPiece = { text: string; moh: MohCitation[]; web: WebCitation[]; isAssigned: boolean };

type AnswerBlock = AnswerPiece & { start: number; end: number };

export type VerifiedAnswer = {
  text: string;
  blocks: AnswerBlock[];
  citedFragments: RetrievedFragment[];
  webSources: WebSourceItem[];
  hasCitations: boolean;
  assignedCitations: number;
};

export type DeterministicCheck =
  | { status: 'failed'; check: 'numbers' | 'volumes' | 'calculator'; reasons: string[] }
  | { status: 'passed'; webBoundSentences: Set<number> };

const TOP_LEVEL_ITEM = /^\s*\d+\.\s/;
const PARAGRAPH_START = /^\s*\p{Lu}/u;
const SENTENCE_END = /[.!?]\s*$/;
const WEB_SOURCE_ID_PREFIX = 'w';
const QUOTATION = /«[^«»]*»/g;
const WHITESPACE = /\s+/g;
const DIGIT = /\d/;
const DECIMAL_MARK = /[.,]/;
const MIN_ASSIGNED_QUOTATION_LENGTH = 12;

type SearchableFragment = { fragment: RetrievedFragment; collapsedContent: string };

type AnswerSources = { fragments: RetrievedFragment[]; searchable: SearchableFragment[]; pages: FetchedPage[] };

const collapseWhitespace = (text: string): string => text.replace(WHITESPACE, ' ').trim();

const isNumberPart = (character: string | undefined, neighbour: string | undefined): boolean =>
  DIGIT.test(character ?? '') || (DECIMAL_MARK.test(character ?? '') && DIGIT.test(neighbour ?? ''));

const occurrenceStarts = (content: string, quoted: string, from: number): number[] => {
  const start = content.indexOf(quoted, from);
  return start < 0 ? [] : [start, ...occurrenceStarts(content, quoted, start + 1)];
};

const containsOnNumberBoundaries = (content: string, quoted: string): boolean =>
  occurrenceStarts(content, quoted, 0).some((start) => {
    const end = start + quoted.length;
    return !isNumberPart(content[start - 1], content[start - 2]) && !isNumberPart(content[end], content[end + 1]);
  });

const fetchedPages = (content: Anthropic.Beta.BetaContentBlock[]): FetchedPage[] =>
  content.flatMap((block) => {
    if (block.type !== 'web_fetch_tool_result' || block.content.type !== 'web_fetch_result') return [];
    const { url, content: document } = block.content;
    return document.source.type === 'text' ? [{ url, title: document.title, text: document.source.data }] : [];
  });

const toWebCitation = (citation: Anthropic.Beta.BetaTextCitation, pages: FetchedPage[]): WebCitation[] => {
  if (citation.type === 'web_search_result_location') {
    return [{ url: citation.url, title: citation.title, citedText: citation.cited_text, units: [citation.cited_text] }];
  }
  if (citation.type !== 'char_location') return [];
  const page = pages.find(({ text }) => text.slice(citation.start_char_index, citation.end_char_index) === citation.cited_text);
  return page ? [{ url: page.url, title: page.title, citedText: citation.cited_text, units: splitSourceUnits(citation.cited_text) }] : [];
};

const plainPiece = (text: string): AnswerPiece => ({ text, moh: [], web: [], isAssigned: false });

const citedPiece = ({ text, citations }: Anthropic.Beta.BetaTextBlock, { fragments, pages }: AnswerSources): AnswerPiece => ({
  text,
  moh: (citations ?? []).flatMap((citation) => {
    const fragment = citation.type === 'search_result_location' ? fragments[citation.search_result_index] : undefined;
    return fragment ? [{ fragment, citedText: citation.cited_text }] : [];
  }),
  web: (citations ?? []).flatMap((citation) => toWebCitation(citation, pages)),
  isAssigned: false,
});

const quotationPiece = (quotation: string, searchable: SearchableFragment[]): AnswerPiece => {
  const quoted = collapseWhitespace(quotation.slice(1, -1));
  const matches = quoted.length < MIN_ASSIGNED_QUOTATION_LENGTH ? [] : searchable.filter(({ collapsedContent }) => containsOnNumberBoundaries(collapsedContent, quoted));
  const [only] = matches;
  return only && matches.length === 1
    ? { text: quotation, moh: [{ fragment: only.fragment, citedText: null }], web: [], isAssigned: true }
    : plainPiece(quotation);
};

const splitAtQuotations = (text: string, searchable: SearchableFragment[]): AnswerPiece[] => {
  const { pieces, cursor } = [...text.matchAll(QUOTATION)].reduce<{ pieces: AnswerPiece[]; cursor: number }>(
    (split, match) => ({
      pieces: [...split.pieces, ...(match.index > split.cursor ? [plainPiece(text.slice(split.cursor, match.index))] : []), quotationPiece(match[0], searchable)],
      cursor: match.index + match[0].length,
    }),
    { pieces: [], cursor: 0 },
  );
  return cursor < text.length ? [...pieces, plainPiece(text.slice(cursor))] : pieces;
};

const toPieces = (block: Anthropic.Beta.BetaTextBlock, sources: AnswerSources): AnswerPiece[] => {
  if ((block.citations ?? []).length > 0) return [citedPiece(block, sources)];
  const pieces = splitAtQuotations(block.text, sources.searchable);
  return pieces.some(({ isAssigned }) => isAssigned) ? pieces : [plainPiece(block.text)];
};

const searchResultsByUrl = (content: Anthropic.Beta.BetaContentBlock[]): Map<string, Anthropic.Beta.BetaWebSearchResultBlock> =>
  new Map(
    content.flatMap((block): [string, Anthropic.Beta.BetaWebSearchResultBlock][] =>
      block.type === 'web_search_tool_result' && Array.isArray(block.content) ? block.content.map((result) => [result.url, result]) : [],
    ),
  );

const domainOf = (url: string): string => (URL.canParse(url) ? new URL(url).hostname : url);

const toWebSources = (blocks: AnswerBlock[], content: Anthropic.Beta.BetaContentBlock[]): WebSourceItem[] => {
  const results = searchResultsByUrl(content);
  const urls = [...new Set(blocks.flatMap(({ web }) => web.map(({ url }) => url)))];
  return urls.map((url, index) => {
    const citationTitle = blocks.flatMap(({ web }) => web).find((citation) => citation.url === url)?.title;
    const result = results.get(url);
    return {
      id: `${WEB_SOURCE_ID_PREFIX}${index + 1}`,
      url,
      title: citationTitle ?? result?.title ?? domainOf(url),
      domain: domainOf(url),
      pageAge: result?.page_age ?? null,
    };
  });
};

export const collectVerifiedAnswer = (content: Anthropic.Beta.BetaContentBlock[], fragments: RetrievedFragment[]): VerifiedAnswer => {
  const searchable = fragments.map((fragment) => ({ fragment, collapsedContent: collapseWhitespace(fragment.chunk.content) }));
  const sources = { fragments, searchable, pages: fetchedPages(content) };
  const pieces = content.flatMap((block) => (block.type === 'text' ? toPieces(block, sources) : []));
  const blocks = pieces.reduce<AnswerBlock[]>((collected, piece) => {
    const start = collected.at(-1)?.end ?? 0;
    return [...collected, { ...piece, start, end: start + piece.text.length }];
  }, []);
  const citedFragments = [...new Set(blocks.flatMap(({ moh }) => moh.map(({ fragment }) => fragment)))];
  return {
    text: blocks.map(({ text }) => text).join(''),
    blocks,
    citedFragments,
    webSources: toWebSources(blocks, content),
    hasCitations: blocks.some(({ moh, web }) => moh.length > 0 || web.length > 0),
    assignedCitations: blocks.filter(({ isAssigned }) => isAssigned).length,
  };
};

const startsParagraph = (line: string, previous: string | undefined): boolean =>
  PARAGRAPH_START.test(line) && (previous === undefined || SENTENCE_END.test(previous));

export const splitSourceUnits = (content: string): string[] => {
  const lines = content.split('\n');
  if (!lines.some((line) => TOP_LEVEL_ITEM.test(line))) return lines;
  return lines.reduce<{ units: string[]; isInItem: boolean }>(
    ({ units, isInItem }, line, index) => {
      if (line.trim().length === 0) return { units, isInItem: false };
      if (TOP_LEVEL_ITEM.test(line)) return { units: [...units, line], isInItem: true };
      if (!isInItem || startsParagraph(line, lines[index - 1])) return { units: [...units, line], isInItem: false };
      return { units: [...units.slice(0, -1), `${units.at(-1) ?? ''}\n${line}`], isInItem };
    },
    { units: [], isInItem: false },
  ).units;
};

const mohSourceTexts = (moh: MohCitation[]): string[] =>
  moh.flatMap(({ fragment, citedText }) => (citedText === null ? [fragment.chunk.content] : [citedText, fragment.chunk.content]));

const toSegment = ({ text, moh, web }: AnswerBlock): AnswerSegment => ({
  text,
  sourceTexts: [...mohSourceTexts(moh), ...web.map(({ citedText }) => citedText)],
});

const toMohSegment = ({ text, moh }: AnswerBlock): AnswerSegment => ({ text, sourceTexts: mohSourceTexts(moh) });

const sentenceSourceUnits = (sentence: AnswerSentence, blocks: AnswerBlock[]): VolumeSourceUnit[] => {
  const overlapping = blocks.filter(({ start, end }) => sentence.start < end && sentence.end > start);
  const fragments = [...new Set(overlapping.flatMap(({ moh }) => moh.map(({ fragment }) => fragment)))];
  const webUnits = [...new Set(overlapping.flatMap(({ web }) => web.flatMap(({ units }) => units)))];
  return [
    ...fragments.flatMap(({ chunk }) => splitSourceUnits(chunk.content).map((text) => ({ text, isWeb: false }))),
    ...webUnits.map((text) => ({ text, isWeb: true })),
  ];
};

const failed = (check: 'numbers' | 'volumes' | 'calculator', reasons: string[]): DeterministicCheck => ({
  status: 'failed',
  check,
  reasons: [...new Set(reasons)].sort(),
});

export const runDeterministicChecks = (
  answer: VerifiedAnswer,
  sentences: AnswerSentence[],
  { hasCalculatorRule }: { hasCalculatorRule: boolean },
): DeterministicCheck => {
  const unverifiedNumbers = findUnverifiedNumbersByUnit(answer.blocks.map(toSegment));
  if (unverifiedNumbers.length > 0) return failed('numbers', unverifiedNumbers.map(({ reason }) => reason));
  const volumeChecks = sentences.map((sentence) => checkStatedVolumes(sentence.text, sentenceSourceUnits(sentence, answer.blocks)));
  const volumeReasons = volumeChecks.flat().flatMap((check) => (check.status === 'unverified' ? [check.reason] : []));
  if (volumeReasons.length > 0) return failed('volumes', volumeReasons);
  if (hasCalculatorRule) {
    const hasVolume = volumeChecks.some((checks) => checks.length > 0);
    const outsideMoh = findUnverifiedNumbersByUnit(answer.blocks.map(toMohSegment)).length > 0;
    if (hasVolume || outsideMoh) return failed('calculator', [...(hasVolume ? ['volume'] : []), ...(outsideMoh ? ['number_outside_moh'] : [])]);
  }
  const webBoundSentences = new Set(
    volumeChecks.flatMap((checks, index) => (checks.some((check) => check.status === 'verified' && check.isWebBound) ? [index] : [])),
  );
  return { status: 'passed', webBoundSentences };
};
