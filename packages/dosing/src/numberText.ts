const SPACE_VARIANTS = /[\u00A0\u2007\u202F\u2009]/g;
const DASH_VARIANTS = /[\u2012\u2013\u2014\u2212]/g;
const DECIMAL_COMMA = /(\d),(\d)/g;
const DIGIT_GROUPS = /(?<!\d)\d{1,3}(?: \d{3})+(?!\d)/g;

export const normalizeNumberText = (text: string): string =>
  text
    .replace(SPACE_VARIANTS, ' ')
    .replace(DASH_VARIANTS, '-')
    .replace(DECIMAL_COMMA, '$1.$2')
    .replace(DIGIT_GROUPS, (group) => group.replaceAll(' ', ''));
