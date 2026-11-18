import type { AnswerSource } from '@/features/chat/types';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export const NARROW_GUTTER = 16;
export const WIDE_GUTTER = 24;
export const WIDE_LAYOUT_MIN_WIDTH = 600;

export const USER_MESSAGE_MAX_WIDTH_RATIO = '85%';
export const USER_MESSAGE_RADIUS = 20;
export const USER_MESSAGE_PADDING_VERTICAL = 10;
export const ASSISTANT_SECTION_GAP = 12;

export const BORDER_WIDTH = 1;
export const TOUCH_TARGET_SIZE = 48;
export const COMPOSER_LINE_HEIGHT = 24;
export const COMPOSER_MAX_LINES = 5;
export const PILL_RADIUS = 24;
export const COMPOSER_FIELD_MIN_HEIGHT = 56;
export const COMPOSER_FIELD_RADIUS = 28;
export const COMPOSER_INPUT_PADDING_VERTICAL = 14;
export const COMPOSER_ACTION_SIZE = 40;
export const EXAMPLE_ROW_RADIUS = 12;
export const EXAMPLE_ROW_PADDING_VERTICAL = 12;
export const RETRY_MIN_WIDTH = 120;

export const MARKDOWN_BLOCK_GAP = 12;
export const MARKDOWN_LIST_ITEM_GAP = 6;
export const MARKDOWN_BULLET_INDENT = 20;
export const MARKDOWN_NUMBER_INDENT = 28;
export const MARKDOWN_QUOTE_BAR_WIDTH = 3;
export const MARKDOWN_QUOTE_PADDING = 12;
export const MARKDOWN_CODE_RADIUS = 8;
export const MARKDOWN_CODE_PADDING = 12;

export const TABLE_RADIUS = 8;
export const TABLE_CELL_PADDING_HORIZONTAL = 10;
export const TABLE_TEXT_CELL_MAX_WIDTH = 180;

export const SOURCE_ITEM_PADDING_VERTICAL = 10;
export const SOURCE_CHIP_RADIUS = 6;
export const SOURCE_CHIP_PADDING_HORIZONTAL = 6;
export const ALLOWED_SOURCE_HOSTS = ['moz.gov.ua', 'www.moz.gov.ua'];

export const EXAMPLE_QUESTIONS = [
  'Анафілаксія: алгоритм допомоги',
  'Гіпоглікемія: алгоритм допомоги',
  'Судоми в дитини: що вводити?',
] as const;

const NBSP = '\u00A0';

export const COPY = {
  emptyTitle: 'Довідник протоколів МОЗ для бригад ЕМД',
  emptyDescription:
    'Відповідає лише за протоколами МОЗ і показує джерело. Якщо відповіді в базі немає — так і скаже.',
  examplesLabel: 'Приклади запитань',
  exampleHint: 'Надсилає це запитання',
  inputA11yLabel: 'Запитання до довідника',
  inputPlaceholder: 'Ваше запитання',
  send: 'Надіслати',
  stop: 'Зупинити відповідь',
  waiting: 'Готую відповідь…',
  stopped: 'Відповідь зупинено — вона може бути неповною.',
  stoppedEmpty: 'Відповідь зупинено',
  retry: 'Повторити',
  retryA11y: 'Повторити запит',
  tableScrollHint: 'Гортайте таблицю вбік →',
  sourcesTitle: 'Джерела',
  sourceOrder: (orderNumber: string, orderDate: string) =>
    `Наказ МОЗ №${NBSP}${orderNumber} від ${orderDate}`,
  sourcePage: (page: string) => `с.${NBSP}${page}`,
  sourceHost: 'moz.gov.ua ↗',
  sourceUnverified: 'чинність не перевірено',
  sourceBlocked: 'Посилання не відкрито: адреса не з moz.gov.ua',
  sourceOpenFailed: 'Не вдалося відкрити посилання',
  sourceA11yLabel: (position: number, { title, orderNumber, orderDate, page }: AnswerSource) =>
    `Джерело ${position}: ${title}, наказ № ${orderNumber} від ${orderDate}, ${page ? `сторінка ${page}, ` : ''}moz.gov.ua, чинність не перевірено`,
  sourceA11yHint: 'Відкриває документ у браузері',
  networkError: 'Не вдалося отримати відповідь. Перевірте зʼєднання.',
  interruptedStream: 'Відповідь обірвалася. Спробуйте ще раз.',
  serverError: (status: number) => `Помилка сервера (${status})`,
} as const;
