import type { DoseRejectionReason } from '@/features/dosing/types';
import { SOURCE_COPY } from '@/features/sources/constants';
import type {
  AnswerSource,
  MissingDoseParameter,
  ProgressStage,
  WebSource,
} from '@/features/chat/types';

export { BORDER_WIDTH, PILL_RADIUS, TOUCH_TARGET_SIZE } from '@/constants/theme';
export {
  SOURCE_CHIP_PADDING_HORIZONTAL,
  SOURCE_CHIP_RADIUS,
  SOURCE_ITEM_PADDING_VERTICAL,
} from '@/features/sources/constants';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export const NARROW_GUTTER = 16;
export const WIDE_GUTTER = 24;
export const WIDE_LAYOUT_MIN_WIDTH = 600;

export const USER_MESSAGE_MAX_WIDTH_RATIO = '85%';
export const USER_MESSAGE_RADIUS = 20;
export const USER_MESSAGE_PADDING_VERTICAL = 10;
export const ASSISTANT_SECTION_GAP = 12;

export const COMPOSER_LINE_HEIGHT = 24;
export const COMPOSER_MAX_LINES = 5;
export const COMPOSER_FIELD_MIN_HEIGHT = 56;
export const COMPOSER_FIELD_RADIUS = 28;
export const COMPOSER_INPUT_PADDING_VERTICAL = 14;
export const COMPOSER_ACTION_SIZE = 40;
export const EXAMPLE_ROW_RADIUS = 12;
export const EXAMPLE_ROW_PADDING_VERTICAL = 12;
export const RETRY_MIN_WIDTH = 120;
export const HEADER_ICON_SIZE = 24;
export const HEADER_TITLE_RESERVED_WIDTH = 216;
export const HEADER_TITLE_MIN_WIDTH = 140;
export const HEADER_MAX_FONT_SCALE = 1.6;

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

export const WAITING_NOTE_INDENT = 28;

export const WEIGHT_INPUT_WIDTH = 140;
export const ROUTE_OPTION_MIN_WIDTH = 64;
export const CONFIRM_MIN_WIDTH_WIDE = 200;
export const DOSE_REQUEST_TIMEOUT_MS = 15000;

export const PROGRESS_STAGES = ['retrieving', 'answering', 'searching_web', 'verifying'] as const;

export const EXAMPLE_QUESTIONS = [
  'Анафілаксія: алгоритм допомоги',
  'Гіпоглікемія: алгоритм допомоги',
] as const;

export const COPY = {
  ...SOURCE_COPY,
  appTitle: 'Rytm',
  historyA11y: 'Історія розмов',
  newChatA11y: 'Новий чат',
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
  progressStage: {
    retrieving: 'Шукаю в протоколах МОЗ…',
    answering: 'Складаю відповідь…',
    searching_web: 'Шукаю додаткові джерела…',
    verifying: 'Звіряю відповідь із протоколами МОЗ…',
  } satisfies Record<ProgressStage, string>,
  verifyingNote: 'Перевірка може тривати кілька десятків секунд.',
  stopped: 'Відповідь зупинено — вона може бути неповною.',
  stoppedEmpty: 'Відповідь зупинено',
  noAnswer: 'Не отримано відповіді',
  retry: 'Повторити',
  retryA11y: 'Повторити запит',
  tableScrollHint: 'Гортайте таблицю вбік →',
  sourcesTitle: 'Джерела',
  sourceA11yLabel: (position: number, { title, orderNumber, orderDate, page }: AnswerSource) =>
    `Джерело ${position}: ${title}, наказ № ${orderNumber} від ${orderDate}, ${page ? `сторінка ${page}, ` : ''}moz.gov.ua, чинність не перевірено`,
  webSourceLabel: 'Не документ МОЗ (довідково)',
  webSourceHost: (domain: string) => `${domain} ↗`,
  webSourceBlocked: 'Посилання не відкрито: адреса не https',
  webSourceA11yLabel: (position: number, { title, domain }: WebSource) =>
    `Джерело ${position}: ${title}, ${domain}, не документ МОЗ, довідково`,
  webSourceA11yHint: 'Відкриває сторінку в браузері',
  networkError: 'Не вдалося отримати відповідь. Перевірте зʼєднання.',
  interruptedStream: 'Відповідь обірвалася. Спробуйте ще раз.',
  serverError: (status: number) => `Помилка сервера (${status})`,
} as const;

export const DOSE_COPY = {
  cardTitle: 'Розрахунок дози',
  confirmHint: 'Перевірте параметри з вашого повідомлення.',
  missingHint: (missing: MissingDoseParameter[]) => {
    if (missing.includes('rule') && missing.includes('weight')) {
      return 'Виберіть шлях введення і вкажіть вагу.';
    }
    return missing.includes('rule') ? 'Виберіть шлях введення.' : 'Вкажіть вагу пацієнта.';
  },
  routeLabel: 'Шлях введення',
  routeMissing: 'Виберіть шлях введення',
  weightLabel: 'Вага пацієнта',
  weightUnit: 'кг',
  weightA11y: 'Вага пацієнта в кілограмах',
  emptyWeightHint: 'Вагу не вказано в повідомленні — введіть у кілограмах.',
  confirm: 'Підтвердити',
  submitting: 'Розраховую…',
  rejection: {
    invalid_weight: 'Перевірте вагу: більше 0 і не більше 300 кг, до двох знаків після коми',
    no_rule: 'Правило для цього шляху більше недоступне. Напишіть запит ще раз.',
    source_not_in_force: 'Документ-джерело правила не чинний — дозу не розраховано.',
    below_rounding_step:
      'Для цієї ваги доза менша за найменший крок у протоколі — дозу не розраховано.',
  } satisfies Record<DoseRejectionReason, string>,
  networkError: 'Не вдалося розрахувати дозу. Перевірте зʼєднання.',
  incompleteReply: 'Відповідь калькулятора неповна — дозу не показано.',
  retryA11y: 'Повторити розрахунок дози',
  edit: 'Змінити параметри',
  noRule: {
    no_rule:
      'Для цього препарату, показання й шляху введення немає правила калькулятора. Дивіться цитату з протоколу нижче.',
    source_not_in_force:
      'Документ, з якого взято правило, не чинний — калькулятор дозу не розраховує. Дивіться цитату з протоколу нижче.',
  },
} as const;
