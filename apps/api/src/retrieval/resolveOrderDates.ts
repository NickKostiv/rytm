import type { SourceRow } from '../sources/sourceRegistry.js';

const isConfirmedBySibling = (row: SourceRow, documentDate: string, rows: SourceRow[]): boolean =>
  rows.some(
    (sibling) =>
      sibling.id !== row.id &&
      sibling.orderNumber === row.orderNumber &&
      sibling.documentCheck?.orderDate === documentDate &&
      sibling.documentCheck.mismatches.length === 0,
  );

export const resolveOrderDates = (rows: SourceRow[]): SourceRow[] =>
  rows.map((row) => {
    const documentDate = row.documentCheck?.orderDate;
    if (!documentDate || documentDate === row.orderDate) return row;
    return isConfirmedBySibling(row, documentDate, rows) ? { ...row, orderDate: documentDate, dateSource: 'document' } : row;
  });
