export type DocumentOrderReference = { orderNumber: string; orderDate: string };

const MONTHS: Readonly<Record<string, string>> = {
  січня: '01',
  лютого: '02',
  березня: '03',
  квітня: '04',
  травня: '05',
  червня: '06',
  липня: '07',
  серпня: '08',
  вересня: '09',
  жовтня: '10',
  листопада: '11',
  грудня: '12',
};

const WORD_DATE_PATTERN = /(?<day>\d{1,2})\s+(?<month>[а-яіїєґ]+)\s+(?<year>\d{4})\s*(?:року|р\.)?\s*№\s*(?<order>\d+)/iu;
const NUMERIC_DATE_PATTERN = /(?<day>\d{2})\.(?<month>\d{2})\.(?<year>\d{4})\s*(?:року|р\.)?\s*№\s*(?<order>\d+)/u;

export const findDocumentOrderReference = (text: string): DocumentOrderReference | null => {
  const worded = WORD_DATE_PATTERN.exec(text)?.groups;
  const wordedMonth = worded?.month ? MONTHS[worded.month.toLowerCase()] : undefined;
  const numeric = NUMERIC_DATE_PATTERN.exec(text)?.groups;
  const match = wordedMonth ? { ...worded, month: wordedMonth } : numeric;
  const { day, month, year, order } = match ?? {};
  if (!day || !month || !year || !order) return null;
  return { orderNumber: order, orderDate: `${year}-${month}-${day.padStart(2, '0')}` };
};
