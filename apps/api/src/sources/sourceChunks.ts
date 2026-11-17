import { buildPageBlocks } from './pageBlocks.js';
import type { PageContent } from './pdfPageContent.js';

export type SourceChunk = {
  id: string;
  documentId: string;
  sourceSha256: string;
  pageStart: number;
  pageEnd: number;
  headingPath: string[];
  type: 'text' | 'table';
  content: string;
  warnings: string[];
};

type ChunkDraft = Pick<SourceChunk, 'headingPath' | 'type' | 'content' | 'warnings'>;

const MAX_TEXT_CHUNK_LENGTH = 1500;
const MIN_HEADING_LETTERS = 6;
const MAX_HEADING_LENGTH = 160;
const MIN_HEADING_UPPERCASE_SHARE = 0.9;

const isHeadingLine = (line: string): boolean => {
  const letters = line.match(/\p{L}/gu)?.length ?? 0;
  const uppercase = line.match(/\p{Lu}/gu)?.length ?? 0;
  return (
    line.length <= MAX_HEADING_LENGTH && letters >= MIN_HEADING_LETTERS && uppercase / letters >= MIN_HEADING_UPPERCASE_SHARE
  );
};

const draftPageChunks = (page: PageContent, initialHeading: string[]): { drafts: ChunkDraft[]; heading: string[] } => {
  const drafts: ChunkDraft[] = [];
  let heading = initialHeading;
  let pending: string[] = [];
  let previousWasHeading = false;
  const flush = (): void => {
    if (pending.length > 0) drafts.push({ headingPath: heading, type: 'text', content: pending.join('\n'), warnings: [] });
    pending = [];
  };

  buildPageBlocks(page).forEach((block) => {
    if (block.type === 'table') {
      flush();
      drafts.push({ headingPath: heading, type: 'table', content: block.markdown, warnings: block.warnings });
      previousWasHeading = false;
      return;
    }
    block.lines.forEach((line) => {
      const isHeading = isHeadingLine(line);
      if (isHeading && !previousWasHeading) flush();
      if (isHeading) heading = previousWasHeading ? [`${heading.join(' ')} ${line}`] : [line];
      if (!isHeading && pending.join('\n').length + line.length > MAX_TEXT_CHUNK_LENGTH) flush();
      pending.push(line);
      previousWasHeading = isHeading;
    });
  });
  flush();
  return { drafts, heading };
};

export const buildDocumentChunks = (documentId: string, sourceSha256: string, pages: PageContent[]): SourceChunk[] => {
  let heading: string[] = [];
  return pages.flatMap((page) => {
    const result = draftPageChunks(page, heading);
    heading = result.heading;
    return result.drafts.map((draft, index) => ({
      id: `${documentId}:p${page.pageNumber}:${index}`,
      documentId,
      sourceSha256,
      pageStart: page.pageNumber,
      pageEnd: page.pageNumber,
      ...draft,
    }));
  });
};
