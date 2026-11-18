const SPACE_VARIANTS = /[    ]/g;
const DASH_VARIANTS = /[‒–—−]/g;
const DECIMAL_COMMA = /(\d),(\d)/g;
const DIGIT_GROUPS = /(?<!\d)\d{1,3}(?: \d{3})+(?!\d)/g;

export const normalizeNumberText = (text: string): string =>
  text
    .replace(SPACE_VARIANTS, ' ')
    .replace(DASH_VARIANTS, '-')
    .replace(DECIMAL_COMMA, '$1.$2')
    .replace(DIGIT_GROUPS, (group) => group.replaceAll(' ', ''));
