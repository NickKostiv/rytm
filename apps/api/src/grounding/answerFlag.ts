export type FlagLevel = 'GREEN' | 'YELLOW' | 'RED';

export type ParsedAnswer = { level: FlagLevel; explanation: string; body: string };

export const UNKNOWN_FLAG_EXPLANATION = 'Рівень не визначено моделлю';

const FLAG_LINE = /^(🟢|🟡|🔴)\s*(GREEN|YELLOW|RED)\s*[—–-]\s*(.+)$/u;
const LOOKS_LIKE_FLAG_LINE = /\b(GREEN|YELLOW|RED)\b|🟢|🟡|🔴/u;
const EMOJI_BY_LEVEL: Readonly<Record<FlagLevel, string>> = { GREEN: '🟢', YELLOW: '🟡', RED: '🔴' };

const isFlagLevel = (value: string | undefined): value is FlagLevel =>
  value === 'GREEN' || value === 'YELLOW' || value === 'RED';

export const parseAnswerFlag = (text: string): ParsedAnswer => {
  const [firstLine = '', ...rest] = text.trim().split('\n');
  const body = rest.join('\n').trim();
  const [, emoji, level, explanation] = FLAG_LINE.exec(firstLine.trim()) ?? [];
  if (isFlagLevel(level) && explanation && EMOJI_BY_LEVEL[level] === emoji) {
    return { level, explanation: explanation.trim(), body };
  }
  return {
    level: 'RED',
    explanation: UNKNOWN_FLAG_EXPLANATION,
    body: LOOKS_LIKE_FLAG_LINE.test(firstLine) ? body : text.trim(),
  };
};
