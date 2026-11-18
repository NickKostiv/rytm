const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_STORED_CONVERSATIONS = 20;
export const CONVERSATION_TTL_MS = 7 * DAY_MS;
export const CONVERSATION_TITLE_MAX_LENGTH = 80;
export const DIALOG_TITLE_MAX_LENGTH = 60;
export const STREAM_SAVE_INTERVAL_MS = 1000;
export const SLOW_LOAD_DELAY_MS = 500;

export const HISTORY_INDEX_KEY = 'rytm.history.index';
export const CONVERSATION_KEY_PREFIX = 'rytm.history.conversation.';

export const CONVERSATION_ROW_MIN_HEIGHT = 64;
export const CONVERSATION_ROW_RADIUS = 12;
export const CONVERSATION_ROW_PADDING_HORIZONTAL = 12;
export const DELETE_ICON_SIZE = 22;

export const MONTHS_GENITIVE = [
  'січня',
  'лютого',
  'березня',
  'квітня',
  'травня',
  'червня',
  'липня',
  'серпня',
  'вересня',
  'жовтня',
  'листопада',
  'грудня',
] as const;

export const HISTORY_COPY = {
  screenTitle: 'Історія',
  backToChat: 'Чат',
  loading: 'Завантажую історію…',
  note: 'Зберігається лише на цьому пристрої: останні 20 розмов, кожна — 7 днів після останнього повідомлення.',
  today: (time: string) => `Сьогодні, ${time}`,
  yesterday: (time: string) => `Учора, ${time}`,
  currentSuffix: ' · Поточна',
  rowA11yLabel: (title: string, date: string, isActive: boolean) =>
    `${title}. ${date}${isActive ? ', поточна' : ''}`,
  rowA11yHint: 'Відкриває розмову',
  deleteOneA11y: (title: string) => `Видалити розмову: ${title}`,
  deleteAll: 'Видалити всю історію',
  emptyTitle: 'Історія порожня',
  emptyBody:
    'Тут зʼявляться ваші розмови. Вони зберігаються лише на цьому пристрої, до 20 розмов, і видаляються через 7 днів після останнього повідомлення.',
  newChat: 'Новий чат',
  loadFailedTitle: 'Не вдалося завантажити історію.',
  deleteOneTitle: 'Видалити розмову?',
  deleteOneBody: (title: string) =>
    `Розмову «${title}» буде видалено з цього пристрою. Відновити її не можна.`,
  deleteOneConfirm: 'Видалити',
  deleteAllTitle: 'Видалити всю історію?',
  deleteAllBody: (count: number) =>
    `Усі розмови (${count}) буде видалено з цього пристрою. Відновити їх не можна.`,
  deleteAllConfirm: 'Видалити все',
  readFailedBanner: 'Не вдалося відкрити історію. Нові повідомлення можуть не зберегтися.',
  writeFailedBanner: 'Розмову не збережено на пристрої. Вона зникне після закриття застосунку.',
  writeRetry: 'Спробувати ще раз',
  deleteFailed: 'Не вдалося видалити. Спробуйте ще раз.',
  unreadableBanner: (count: number) =>
    `Деякі збережені розмови пошкоджені й не відкриваються: ${count}.`,
  deleteUnreadable: 'Видалити пошкоджені',
  deleteUnreadableTitle: 'Видалити пошкоджені розмови?',
  deleteUnreadableBody: (count: number) =>
    `Розмови, які не вдалося прочитати (${count}), буде видалено з цього пристрою. Відновити їх не можна.`,
  historyUnavailable: 'Збережені розмови зараз недоступні. Нові розмови теж можуть не зберегтися.',
} as const;
