const NO_BREAK_SPACE = '\u00A0';
const WORD_JOINER = '\u2060';
const LETTER = 'A-Za-zА-Яа-яЁёҐґЄєІіЇї';
const NUMBER = String.raw`\d{1,3}(?: \d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?`;
const UNIT_WORD = `[${LETTER}]{1,8}`;
const UNIT = String.raw`%|‰|${UNIT_WORD}(?:\/${UNIT_WORD})*`;

const QUANTITY_PATTERN = new RegExp(`(^|[^\\d.,])(${NUMBER}) (${UNIT})(?![${LETTER}])`, 'g');
const RANGE_PATTERN = new RegExp(`(^|[\\s(«])(${NUMBER})([–-])(?=(?:${NUMBER})(?![\\d–-]))`, 'g');
const ROUTE_PATTERN = new RegExp(`(^|[^${LETTER}])в/([мвк])(?![${LETTER}])`, 'g');

function joinDigitGroups(number: string): string {
  return number.replace(/ /g, NO_BREAK_SPACE);
}

function joinQuantity(_match: string, prefix: string, number: string, unit: string): string {
  const joinedUnit = unit.replace(/\//g, `/${WORD_JOINER}`);
  return `${prefix}${joinDigitGroups(number)}${NO_BREAK_SPACE}${joinedUnit}`;
}

function joinRangeStart(_match: string, prefix: string, number: string, dash: string): string {
  return `${prefix}${joinDigitGroups(number)}${WORD_JOINER}${dash}${WORD_JOINER}`;
}

export function keepQuantitiesTogether(text: string): string {
  return text
    .replace(QUANTITY_PATTERN, joinQuantity)
    .replace(RANGE_PATTERN, joinRangeStart)
    .replace(ROUTE_PATTERN, `$1в/${WORD_JOINER}$2`);
}

export function stripLayoutCharacters(text: string): string {
  return text.replace(/\u2060/g, '').replace(/\u00A0/g, ' ');
}
