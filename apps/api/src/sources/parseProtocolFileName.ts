export type ProtocolFileInfo = {
  orderNumber: string;
  orderDate: string;
  annex: string | null;
  warnings: string[];
};

const FILE_NAME_PATTERNS = [
  /dn_(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})_(?<order>\d+)_dod(?:_?(?<annex>\d+))?(?<trailing>-?)\.pdf$/i,
  /dn_(?<order>\d+)_(?<day>\d{2})_?(?<month>\d{2})_?(?<year>\d{4})_dod(?:_?(?<annex>\d+))?(?<trailing>-?)\.pdf$/i,
];

const toIsoDate = (year: string, month: string, day: string): string | null => {
  const iso = `${year}-${month}-${day}`;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.toISOString().slice(0, iso.length) === iso ? iso : null;
};

export const parseProtocolFileName = (url: string): ProtocolFileInfo => {
  const fileName = new URL(url).pathname.split('/').at(-1) ?? '';
  const groups = FILE_NAME_PATTERNS.map((pattern) => pattern.exec(fileName)?.groups).find(
    (match) => match !== undefined,
  );
  const { order, year, month, day, annex, trailing } = groups ?? {};
  const orderDate = year && month && day ? toIsoDate(year, month, day) : null;
  if (!order || !orderDate) throw new Error(`Unrecognised protocol file name: ${fileName}`);

  const warnings =
    trailing === '-'
      ? [`file name "${fileName}" has a trailing "-" after the annex number; annex ${annex ?? '?'} needs confirming from the document`]
      : [];
  return { orderNumber: order, orderDate, annex: annex ?? null, warnings };
};
