const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatOrderDate(isoDate: string): string {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : isoDate;
}
