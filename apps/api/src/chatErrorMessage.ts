import Anthropic from '@anthropic-ai/sdk';

export const REFUSAL_MESSAGE =
  'Не вдалося відповісти на це питання: модель відхилила запит. Переформулюйте питання або зверніться до чинного протоколу МОЗ.';

const AUTH_MESSAGE = 'Сервіс тимчасово недоступний: помилка налаштування доступу до AI.';
const RATE_LIMIT_MESSAGE = 'Забагато запитів. Спробуйте ще раз за хвилину.';
const UPSTREAM_MESSAGE = 'AI-сервіс тимчасово недоступний. Спробуйте ще раз.';
const CONNECTION_MESSAGE = 'Немає зʼєднання з AI-сервісом. Спробуйте ще раз.';
const UNKNOWN_MESSAGE = 'Сталася непередбачена помилка. Спробуйте ще раз.';

const logChatError = (error: unknown): void => {
  if (error instanceof Anthropic.APIError) {
    console.error(`Claude request failed: ${error.name} status=${error.status ?? 'none'} type=${error.type ?? 'none'}`);
    return;
  }
  console.error(`Chat stream failed: ${error instanceof Error ? error.name : typeof error}`);
};

const resolveChatErrorMessage = (error: unknown): string => {
  if (error instanceof Anthropic.AuthenticationError) return AUTH_MESSAGE;
  if (error instanceof Anthropic.RateLimitError) return RATE_LIMIT_MESSAGE;
  if (error instanceof Anthropic.APIConnectionError) return CONNECTION_MESSAGE;
  if (error instanceof Anthropic.APIError) return UPSTREAM_MESSAGE;
  return UNKNOWN_MESSAGE;
};

export const toUserSafeChatError = (error: unknown): string => {
  logChatError(error);
  return resolveChatErrorMessage(error);
};
