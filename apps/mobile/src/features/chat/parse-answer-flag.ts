export type AnswerFlagLevel = 'GREEN' | 'YELLOW' | 'RED';

export type AnswerFlag = {
  level: AnswerFlagLevel;
  explanation: string;
};

export type ParsedAnswerFlag =
  | { status: 'pending' }
  | { status: 'parsed'; flag: AnswerFlag; body: string }
  | { status: 'absent'; body: string };

const FLAG_LEVELS: AnswerFlagLevel[] = ['GREEN', 'YELLOW', 'RED'];
const FLAG_LINE_PATTERN = /^\s*(?:🟢|🟡|🔴)?\s*(GREEN|YELLOW|RED)\b\s*[—–:-]?\s*(.*)$/u;
const FLAG_EMOJI_PREFIX = /^(?:🟢|🟡|🔴)/u;

export function toFlagLevel(value: string): AnswerFlagLevel | null {
  return FLAG_LEVELS.find((level) => level === value) ?? null;
}

function couldBecomeFlagLine(partialLine: string): boolean {
  const levelPrefix = partialLine.trimStart().replace(FLAG_EMOJI_PREFIX, '').trimStart();
  return FLAG_LEVELS.some((level) => level.startsWith(levelPrefix));
}

export function parseAnswerFlag(content: string): ParsedAnswerFlag {
  const newlineIndex = content.indexOf('\n');
  const isFlagLineComplete = newlineIndex !== -1;
  const firstLine = isFlagLineComplete ? content.slice(0, newlineIndex) : content;
  const match = FLAG_LINE_PATTERN.exec(firstLine);
  const level = match ? toFlagLevel(match[1]) : null;

  if (match && level) {
    return {
      status: 'parsed',
      flag: { level, explanation: match[2].trim() },
      body: isFlagLineComplete ? content.slice(newlineIndex + 1) : '',
    };
  }
  if (!isFlagLineComplete && couldBecomeFlagLine(firstLine)) return { status: 'pending' };
  return { status: 'absent', body: content };
}
