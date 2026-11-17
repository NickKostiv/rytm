export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export const USER_BUBBLE_COLOR = '#3c87f7';
export const USER_BUBBLE_TEXT_COLOR = '#ffffff';
export const ERROR_TEXT_COLOR = '#d92d20';
export const MESSAGE_MAX_WIDTH_RATIO = '85%';
export const COMPOSER_MAX_HEIGHT = 120;

export const COPY = {
  emptyHint: 'Запитайте про протокол, препарат або дозування',
  inputPlaceholder: 'Ваше запитання',
  send: 'Надіслати',
  stop: 'Зупинити',
  retry: 'Повторити',
  stopped: 'Відповідь зупинено',
  networkError: 'Не вдалося отримати відповідь. Перевірте зʼєднання.',
  interruptedStream: 'Відповідь обірвалася. Спробуйте ще раз.',
  serverError: (status: number) => `Помилка сервера (${status})`,
} as const;
