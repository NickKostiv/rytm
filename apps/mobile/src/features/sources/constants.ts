const NBSP = '\u00A0';

export const SOURCE_ITEM_PADDING_VERTICAL = 10;
export const SOURCE_CHIP_RADIUS = 6;
export const SOURCE_CHIP_PADDING_HORIZONTAL = 6;
export const ALLOWED_SOURCE_HOSTS = ['moz.gov.ua', 'www.moz.gov.ua'];

export const SOURCE_COPY = {
  sourceOrder: (orderNumber: string, orderDate: string) =>
    `Наказ МОЗ №${NBSP}${orderNumber} від ${orderDate}`,
  sourcePage: (page: string) => `с.${NBSP}${page}`,
  sourceHost: 'moz.gov.ua ↗',
  sourceUnverified: 'чинність не перевірено',
  sourceBlocked: 'Посилання не відкрито: адреса не з moz.gov.ua',
  sourceOpenFailed: 'Не вдалося відкрити посилання',
  sourceA11yHint: 'Відкриває документ у браузері',
} as const;
