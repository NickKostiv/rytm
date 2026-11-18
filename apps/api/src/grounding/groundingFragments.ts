import type Anthropic from '@anthropic-ai/sdk';
import type { RetrievedFragment } from '../retrieval/sourceIndex.js';

export type CitationItem = {
  id: string;
  orderNumber: string;
  orderDate: string;
  annex: string | null;
  title: string;
  page: number;
  url: string;
  attribution: 'moz.gov.ua';
  validity: string;
};

const VALIDITY_NOT_VERIFIED = 'чинність не перевірено';

const formatOrderDate = (isoDate: string): string => isoDate.split('-').reverse().join('.');

export const fragmentTitle = ({ row, chunk }: RetrievedFragment): string => {
  const annex = row.annex ? `, додаток ${row.annex}` : ', додаток';
  const section = chunk.headingPath[0] ? ` — ${chunk.headingPath[0]}` : '';
  const validity = row.validity === 'in_force' ? '' : ` (${VALIDITY_NOT_VERIFIED})`;
  return `Наказ МОЗ № ${row.orderNumber} від ${formatOrderDate(row.orderDate)}${annex}${section}, с. ${chunk.pageStart}${validity}`;
};

const fragmentUrl = ({ row, chunk }: RetrievedFragment): string => `${row.url}#page=${chunk.pageStart}`;

export const toSearchResultBlock = (fragment: RetrievedFragment): Anthropic.Beta.BetaSearchResultBlockParam => ({
  type: 'search_result',
  source: fragmentUrl(fragment),
  title: fragmentTitle(fragment),
  content: [{ type: 'text', text: fragment.chunk.content }],
  citations: { enabled: true },
});

export const toCitationItem = (fragment: RetrievedFragment): CitationItem => ({
  id: fragment.chunk.id,
  orderNumber: fragment.row.orderNumber,
  orderDate: fragment.row.orderDate,
  annex: fragment.row.annex,
  title: fragment.chunk.headingPath.join(' — '),
  page: fragment.chunk.pageStart,
  url: fragmentUrl(fragment),
  attribution: 'moz.gov.ua',
  validity: fragment.row.validity,
});
