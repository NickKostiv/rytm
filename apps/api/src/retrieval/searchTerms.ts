const LATIN_TO_CYRILLIC: Readonly<Record<string, string>> = {
  a: 'а',
  b: 'в',
  c: 'с',
  e: 'е',
  h: 'н',
  i: 'і',
  k: 'к',
  m: 'м',
  o: 'о',
  p: 'р',
  t: 'т',
  x: 'х',
  y: 'у',
};

const UKRAINIAN_ENDINGS = [
  'ями', 'ами', 'ові', 'еві', 'ого', 'ому', 'ими', 'іми', 'ією', 'ої', 'ою', 'ею', 'ії', 'ія', 'ію',
  'их', 'іх', 'ий', 'ій', 'ів', 'ам', 'ям', 'ах', 'ях', 'ом', 'ем', 'а', 'я', 'у', 'ю', 'і', 'и', 'о', 'е', 'ь', 'ї', 'й',
].sort((a, b) => b.length - a.length);

const STOP_WORDS: ReadonlySet<string> = new Set([
  'і', 'й', 'та', 'в', 'у', 'з', 'із', 'зі', 'на', 'до', 'для', 'при', 'що', 'як', 'або', 'не', 'це', 'чи', 'по', 'від',
  'який', 'яка', 'яке', 'які', 'якій', 'якого', 'скільки', 'коли', 'де', 'чому', 'можна', 'треба', 'потрібно', 'мені',
]);

const STEM_SYNONYMS: Readonly<Record<string, string>> = {
  адреналін: 'епінефрин',
  норадреналін: 'норепінефрин',
};

const PATIENT_PARAMETER =
  /^\d*(?:кг|г|kg|g|кілограм|кілограми|кілограмів|грам|грами|грамів|р|рік|року|роки|років|міс|місяць|місяця|місяці|місяців|тиж|тиждень|тижня|тижні|тижнів|дн|день|дня|дні|днів)?$/u;
const MIN_STEM_LENGTH = 4;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const APOSTROPHES = /['’ʼ`]/g;
const TOKEN = /[\p{L}\p{N}]+/gu;

const foldHomoglyphs = (token: string): string =>
  CYRILLIC.test(token) ? [...token].map((character) => LATIN_TO_CYRILLIC[character] ?? character).join('') : token;

const stem = (token: string): string => {
  const ending = UKRAINIAN_ENDINGS.find((suffix) => token.endsWith(suffix) && token.length - suffix.length >= MIN_STEM_LENGTH);
  return ending ? token.slice(0, -ending.length) : token;
};

const toTokens = (text: string): string[] =>
  (text.toLowerCase().replace(APOSTROPHES, '').match(TOKEN) ?? []).map(foldHomoglyphs);

const toTerms = (tokens: string[]): string[] =>
  tokens
    .filter((token) => !STOP_WORDS.has(token))
    .map(stem)
    .map((term) => STEM_SYNONYMS[term] ?? term);

export const toSearchTerms = (text: string): string[] => toTerms(toTokens(text));

export const toQueryTerms = (query: string): string[] =>
  toTerms(toTokens(query).filter((token) => !PATIENT_PARAMETER.test(token)));
