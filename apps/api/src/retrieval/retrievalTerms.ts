const ROUTE_TOKENS: ReadonlySet<string> = new Set(['в/м', 'в/в', 'в/к', 'п/ш']);
const NUMBER_OR_NUMBER_WITH_UNIT = /^\d[\d.,:]*(?:%|\p{L}+(?:\/\p{L}+)*)?$/u;
const EDGE_PUNCTUATION = /^\p{P}+|\p{P}+$/gu;
const WHITESPACE = /\s+/;

const isClinicalToken = (token: string): boolean =>
  token.length > 0 && !NUMBER_OR_NUMBER_WITH_UNIT.test(token) && !ROUTE_TOKENS.has(token.toLowerCase());

export const toRetrievalQuery = (retrievalTerms: string[]): string =>
  retrievalTerms
    .flatMap((term) => term.split(WHITESPACE))
    .map((token) => token.replace(EDGE_PUNCTUATION, ''))
    .filter(isClinicalToken)
    .join(' ');
