const NBSP = '\u00A0';
const UNVERIFIED_SUFFIX = ', чинність не перевірено';

type SourceA11yParts = { title: string; orderLine: string; section: string; isUnverified: boolean };

export const DOSE_CARD_RADIUS = 12;
export const CAPPED_NOTE_BAR_WIDTH = 3;
export const CAPPED_NOTE_PADDING = 12;

export const WEIGHT_INPUT_COPY = {
  weightEmpty: 'Вкажіть вагу в кілограмах',
  weightTooPrecise: 'Не більше двох знаків після коми',
  weightNotNumber: 'Введіть вагу числом, наприклад 12,5',
  weightZero: 'Вага має бути більша за 0',
} as const;

export const DOSE_RESULT_COPY = {
  populationLabel: 'Група пацієнтів за протоколом:',
  resultTitle: 'Доза за калькулятором',
  summary: (parts: string[], weight: string) => `${parts.join(' · ')} · ${weight}${NBSP}кг`,
  doseLabel: 'Доза',
  volumeLabel: 'Об’єм',
  milligrams: (value: string) => `${value}${NBSP}мг`,
  millilitres: (value: string) => `${value}${NBSP}мл`,
  concentration: (text: string) => `Концентрація: ${text}`,
  notCalculated: 'не розраховано',
  noConcentration: 'Концентрацію в правилі не вказано',
  notExactVolume: 'Об’єм не ділиться точно — не показано',
  doseA11y: (dose: string, volume: string | null) =>
    volume === null
      ? `Доза ${dose} міліграма, об’єм не розраховано`
      : `Доза ${dose} міліграма, об’єм ${volume} мілілітра`,
  cappedAt: (max: string) => `Обмежено максимальною разовою дозою: ${max}${NBSP}мг`,
  maxDose: (max: string) => `Максимальна разова доза: ${max}${NBSP}мг`,
  noMaxDose: 'Максимальна доза в протоколі не вказана',
  repeat: (min: string, max: string) =>
    min === max ? `Повтор: через ${min}${NBSP}хв` : `Повтор: через ${min}–${max}${NBSP}хв`,
  formulaLabel: 'Розрахунок',
  sourceA11y: ({ title, orderLine, section, isUnverified }: SourceA11yParts) => {
    const validity = isUnverified ? UNVERIFIED_SUFFIX : '';
    return `Джерело: ${title}, ${orderLine}, ${section}, moz.gov.ua${validity}`;
  },
  ruleSetDate: (date: string) => `Правила калькулятора від ${date}`,
} as const;
