export type AnswerSentence = { text: string; line: number; start: number; end: number };

const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/;
const SENTENCE_END = new Set(['.', '!', '?']);
const OPENING_QUOTE = '«';
const CLOSING_QUOTE = '»';
const HAS_CONTENT = /[\p{L}\p{N}]/u;

const sentenceEnds = (line: string): number[] =>
  line.split('').reduce<{ depth: number; ends: number[] }>(
    ({ depth, ends }, character, index) => {
      if (character === OPENING_QUOTE) return { depth: depth + 1, ends };
      if (character === CLOSING_QUOTE) return { depth: Math.max(depth - 1, 0), ends };
      const isEnd = depth === 0 && SENTENCE_END.has(character) && line[index + 1] === ' ';
      return { depth, ends: isEnd ? [...ends, index + 1] : ends };
    },
    { depth: 0, ends: [] },
  ).ends;

const splitLine = (line: string, lineIndex: number, lineStart: number): AnswerSentence[] => {
  const contentStart = line.match(LIST_MARKER)?.[0].length ?? 0;
  const content = line.slice(contentStart);
  const bounds = [0, ...sentenceEnds(content), content.length];
  return bounds.slice(1).flatMap((end, index) => {
    const start = bounds[index] ?? 0;
    const text = content.slice(start, end).trim();
    if (!HAS_CONTENT.test(text)) return [];
    return [{ text, line: lineIndex, start: lineStart + contentStart + start, end: lineStart + contentStart + end }];
  });
};

export const splitAnswerSentences = (answer: string): AnswerSentence[] =>
  answer.split('\n').reduce<{ offset: number; sentences: AnswerSentence[] }>(
    ({ offset, sentences }, line, lineIndex) => ({
      offset: offset + line.length + 1,
      sentences: [...sentences, ...splitLine(line, lineIndex, offset)],
    }),
    { offset: 0, sentences: [] },
  ).sentences;

export const appendToLines = (answer: string, lineIndexes: ReadonlySet<number>, suffix: string): string =>
  answer
    .split('\n')
    .map((line, index) => (lineIndexes.has(index) && HAS_CONTENT.test(line) ? `${line.trimEnd()}${suffix}` : line))
    .join('\n');
