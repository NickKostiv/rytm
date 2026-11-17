import { Lexer, lexer, type MarkedToken, type Token, type Tokens } from 'marked';

const MARKED_TOKEN_TYPES = new Set<string>([
  'blockquote',
  'br',
  'checkbox',
  'code',
  'codespan',
  'def',
  'del',
  'em',
  'escape',
  'heading',
  'hr',
  'html',
  'image',
  'link',
  'list',
  'list_item',
  'paragraph',
  'space',
  'strong',
  'table',
  'text',
]);

export function isMarkedToken(token: Token): token is MarkedToken {
  return MARKED_TOKEN_TYPES.has(token.type);
}

function toPlainParagraph(markdown: string): Token[] {
  return [{ type: 'paragraph', raw: markdown, text: markdown, tokens: [{ type: 'text', raw: markdown, text: markdown }] }];
}

export function lexMarkdownBlocks(markdown: string): Token[] {
  try {
    return lexer(markdown);
  } catch {
    return toPlainParagraph(markdown);
  }
}

export function lexMarkdownInline(markdown: string): Token[] {
  try {
    return Lexer.lexInline(markdown);
  } catch {
    return [{ type: 'text', raw: markdown, text: markdown }];
  }
}

const TABLE_DELIMITER_ROW_INDEX = 1;

function countRawTableCells(line: string): number {
  const trimmed = line.trim();
  let separatorCount = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed[index] === '\\') index += 1;
    else if (trimmed[index] === '|') separatorCount += 1;
  }
  const hasLeadingPipe = trimmed.startsWith('|');
  const hasTrailingPipe = trimmed.length > 1 && trimmed.endsWith('|') && !trimmed.endsWith('\\|');
  return separatorCount + 1 - Number(hasLeadingPipe) - Number(hasTrailingPipe);
}

export function hasRowsWiderThanHeader(table: Tokens.Table): boolean {
  return table.raw
    .split('\n')
    .filter((line, index) => index !== TABLE_DELIMITER_ROW_INDEX && line.trim() !== '')
    .some((line) => countRawTableCells(line) > table.header.length);
}
