import { HISTORY_COPY, MONTHS_GENITIVE } from '@/features/history/constants';

function padTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function isSameDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

export function formatConversationDate(timestamp: number, now: number): string {
  const date = new Date(timestamp);
  const today = new Date(now);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const time = `${padTwoDigits(date.getHours())}:${padTwoDigits(date.getMinutes())}`;
  if (isSameDay(date, today)) return HISTORY_COPY.today(time);
  if (isSameDay(date, yesterday)) return HISTORY_COPY.yesterday(time);
  return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}, ${time}`;
}
