import type { StructuredOutput } from '../dosing/doseExtraction.js';

export type SentenceVerdict = 'supported' | 'contradicted' | 'not_covered';

export type JudgedSentence = { verdict: SentenceVerdict; fragmentIndexes: number[] };

export type JudgeFragment = { title: string; content: string };

export type JudgeInput = { userTexts: string[]; sentences: string[]; fragments: JudgeFragment[] };

export const VERDICTS: readonly SentenceVerdict[] = ['supported', 'contradicted', 'not_covered'];

export const JUDGE_VERDICT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: VERDICTS },
          fragmentIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'verdict', 'fragmentIds'],
        additionalProperties: false,
      },
    },
  },
  required: ['sentences'],
  additionalProperties: false,
};

const END_TURN = 'end_turn';
const SENTENCE_PREFIX = 'S';
const FRAGMENT_PREFIX = 'F';
const USER_PREFIX = 'U';

const escapeText = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const escapeAttribute = (text: string): string => escapeText(text).replaceAll('"', '&quot;');

const tagged = (tag: string, items: string[]): string => [`<${tag}>`, ...items, `</${tag}>`].join('\n');

export const buildJudgeInput = ({ userTexts, sentences, fragments }: JudgeInput): string =>
  [
    tagged(
      'user_messages',
      userTexts.map((text, index) => `<message id="${USER_PREFIX}${index + 1}">${escapeText(text)}</message>`),
    ),
    tagged(
      'answer_sentences',
      sentences.map((text, index) => `<sentence id="${SENTENCE_PREFIX}${index + 1}">${escapeText(text)}</sentence>`),
    ),
    tagged(
      'fragments',
      fragments.map(
        ({ title, content }, index) =>
          `<fragment id="${FRAGMENT_PREFIX}${index + 1}" title="${escapeAttribute(title)}">\n${escapeText(content)}\n</fragment>`,
      ),
    ),
  ].join('\n');

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isVerdict = (value: unknown): value is SentenceVerdict => VERDICTS.some((verdict) => verdict === value);

const toIndex = (id: unknown, prefix: string, count: number): number | null => {
  if (typeof id !== 'string' || !id.startsWith(prefix)) return null;
  const position = Number(id.slice(prefix.length));
  return Number.isInteger(position) && position >= 1 && position <= count && id === `${prefix}${position}` ? position - 1 : null;
};

type ParsedEntry = { sentenceIndex: number; judged: JudgedSentence };

const parseEntry = (entry: unknown, counts: { sentences: number; fragments: number }): ParsedEntry | null => {
  if (!isRecord(entry) || !isVerdict(entry.verdict) || !Array.isArray(entry.fragmentIds)) return null;
  const sentenceIndex = toIndex(entry.id, SENTENCE_PREFIX, counts.sentences);
  const fragmentIndexes = entry.fragmentIds.map((id) => toIndex(id, FRAGMENT_PREFIX, counts.fragments));
  if (sentenceIndex === null || fragmentIndexes.some((index) => index === null)) return null;
  const known = fragmentIndexes.flatMap((index) => (index === null ? [] : [index]));
  if (entry.verdict !== 'not_covered' && known.length === 0) return null;
  return { sentenceIndex, judged: { verdict: entry.verdict, fragmentIndexes: known } };
};

export const parseJudgeVerdict = (output: StructuredOutput, counts: { sentences: number; fragments: number }): JudgedSentence[] | null => {
  if (output.stopReason !== END_TURN) return null;
  const parsed = parseJson(output.text);
  if (!isRecord(parsed) || !Array.isArray(parsed.sentences) || parsed.sentences.length !== counts.sentences) return null;
  const entries = parsed.sentences.map((entry) => parseEntry(entry, counts));
  const bySentence = new Map(entries.flatMap((entry): [number, JudgedSentence][] => (entry ? [[entry.sentenceIndex, entry.judged]] : [])));
  if (entries.some((entry) => entry === null) || bySentence.size !== counts.sentences) return null;
  return Array.from({ length: counts.sentences }, (_, index) => bySentence.get(index)).flatMap((judged) => (judged ? [judged] : []));
};
