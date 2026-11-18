import type Anthropic from '@anthropic-ai/sdk';
import { checkStatedVolumes } from '@rytm/dosing';
import type { VolumeSourceUnit } from '@rytm/dosing';
import type { RetrievedFragment } from '../retrieval/sourceIndex.js';
import { findUnverifiedNumbersByUnit } from './answerNumbers.js';
import type { AnswerSegment } from './answerNumbers.js';
import type { AnswerSentence } from './answerSentences.js';

export type WebSourceItem = { id: string; url: string; title: string; domain: string; pageAge: string | null };

type WebCitation = { url: string; title: string | null; citedText: string };

type MohCitation = { fragment: RetrievedFragment; citedText: string };

type AnswerBlock = { text: string; start: number; end: number; moh: MohCitation[]; web: WebCitation[] };

export type VerifiedAnswer = {
  text: string;
  blocks: AnswerBlock[];
  citedFragments: RetrievedFragment[];
  webSources: WebSourceItem[];
  hasCitations: boolean;
};

export type DeterministicCheck = { status: 'failed'; check: 'numbers' | 'volumes' | 'calculator' } | { status: 'passed'; webBoundSentences: Set<number> };

const TOP_LEVEL_ITEM = /^\s*\d+\.\s/;
const PARAGRAPH_START = /^\s*\p{Lu}/u;
const SENTENCE_END = /[.!?]\s*$/;
const WEB_SOURCE_ID_PREFIX = 'w';

const toBlock = (block: Anthropic.Beta.BetaTextBlock, fragments: RetrievedFragment[], start: number): AnswerBlock => {
  const citations = block.citations ?? [];
  return {
    text: block.text,
    start,
    end: start + block.text.length,
    moh: citations.flatMap((citation) => {
      const fragment = citation.type === 'search_result_location' ? fragments[citation.search_result_index] : undefined;
      return fragment ? [{ fragment, citedText: citation.cited_text }] : [];
    }),
    web: citations.flatMap((citation) =>
      citation.type === 'web_search_result_location' ? [{ url: citation.url, title: citation.title, citedText: citation.cited_text }] : [],
    ),
  };
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
  const textBlocks = content.flatMap((block) => (block.type === 'text' ? [block] : []));
  const blocks = textBlocks.reduce<AnswerBlock[]>((collected, block) => [...collected, toBlock(block, fragments, collected.at(-1)?.end ?? 0)], []);
  const citedFragments = [...new Set(blocks.flatMap(({ moh }) => moh.map(({ fragment }) => fragment)))];
  return {
    text: blocks.map(({ text }) => text).join(''),
    blocks,
    citedFragments,
    webSources: toWebSources(blocks, content),
    hasCitations: blocks.some(({ moh, web }) => moh.length > 0 || web.length > 0),
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

const toSegment = ({ text, moh, web }: AnswerBlock): AnswerSegment => ({
  text,
  sourceTexts: [...moh.flatMap(({ fragment, citedText }) => [citedText, fragment.chunk.content]), ...web.map(({ citedText }) => citedText)],
});

const toMohSegment = ({ text, moh }: AnswerBlock): AnswerSegment => ({
  text,
  sourceTexts: moh.flatMap(({ fragment, citedText }) => [citedText, fragment.chunk.content]),
});

const sentenceSourceUnits = (sentence: AnswerSentence, blocks: AnswerBlock[]): VolumeSourceUnit[] => {
  const overlapping = blocks.filter(({ start, end }) => sentence.start < end && sentence.end > start);
  const fragments = [...new Set(overlapping.flatMap(({ moh }) => moh.map(({ fragment }) => fragment)))];
  return [
    ...fragments.flatMap(({ chunk }) => splitSourceUnits(chunk.content).map((text) => ({ text, isWeb: false }))),
    ...overlapping.flatMap(({ web }) => web.map(({ citedText }) => ({ text: citedText, isWeb: true }))),
  ];
};

export const runDeterministicChecks = (
  answer: VerifiedAnswer,
  sentences: AnswerSentence[],
  { hasCalculatorRule }: { hasCalculatorRule: boolean },
): DeterministicCheck => {
  if (findUnverifiedNumbersByUnit(answer.blocks.map(toSegment)).length > 0) return { status: 'failed', check: 'numbers' };
  const volumeChecks = sentences.map((sentence) => checkStatedVolumes(sentence.text, sentenceSourceUnits(sentence, answer.blocks)));
  if (volumeChecks.flat().some(({ status }) => status === 'unverified')) return { status: 'failed', check: 'volumes' };
  if (hasCalculatorRule) {
    const hasVolume = volumeChecks.some((checks) => checks.length > 0);
    if (hasVolume || findUnverifiedNumbersByUnit(answer.blocks.map(toMohSegment)).length > 0) return { status: 'failed', check: 'calculator' };
  }
  const webBoundSentences = new Set(
    volumeChecks.flatMap((checks, index) => (checks.some((check) => check.status === 'verified' && check.isWebBound) ? [index] : [])),
  );
  return { status: 'passed', webBoundSentences };
};
