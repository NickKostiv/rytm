import { MAX_WEIGHT_KG, toDisplayDecimal } from '@rytm/dosing';

import { DOSE_COPY } from '@/features/chat/constants';
import type { DoseRejectionReason } from '@/features/dosing/types';

const NBSP = ' ';

export const WEIGHT_PRESETS_KG = [
  3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100,
] as const;
export const RECENT_RULES_LIMIT = 5;
export const RECENT_RULES_STORAGE_KEY = 'calculator.recentRuleIds';
export const WEIGHT_CHIP_MIN_WIDTH = 56;
export const WEIGHT_CHIP_PADDING_HORIZONTAL = 12;
export const WEIGHT_PRESETS_OFFSET = 12;
export const CHOICE_ROW_GAP = 4;
export const SCROLL_TARGET_MARGIN = 16;
export const ROUTE_PREFILL_PICK = '1';

export const CALCULATOR_COPY = {
  screenTitle: 'Калькулятор доз',
  info: 'Розрахунок за правилами, перенесеними з протоколів МОЗ. Працює без інтернету. Не замінює клінічного рішення.',
  prefillApplied: 'Параметри підставлено з посилання — перевірте перед розрахунком.',
  prefillUnknownRule:
    'Цього правила немає в калькуляторі на пристрої — виберіть показання і препарат.',
  recentTitle: 'Нещодавні',
  recentA11y: (drug: string, indication: string, route: string) =>
    `${drug}, ${indication}, ${route}`,
  indicationTitle: 'Показання',
  drugTitle: 'Препарат',
  routeTitle: 'Шлях введення',
  weightTitle: 'Вага пацієнта, кг',
  presetsTitle: 'Швидкий вибір',
  presetsA11y: 'Швидкий вибір ваги',
  presetA11y: (weight: string) => `Вага ${weight}${NBSP}кг`,
  change: 'Змінити',
  collapsedA11y: (title: string, value: string) => `${title}: ${value}. Змінити`,
  singleOption: 'Єдиний варіант у правилах калькулятора',
  calculate: 'Розрахувати',
  indicationMissing: 'Виберіть показання',
  drugMissing: 'Виберіть препарат',
  routeMissing: 'Виберіть шлях введення',
  weightTooHeavy: `Вага понад ${toDisplayDecimal(String(MAX_WEIGHT_KG))}${NBSP}кг — перевірте значення`,
  rejection: {
    no_rule: 'Для цього вибору немає правила калькулятора.',
    below_rounding_step: DOSE_COPY.rejection.below_rounding_step,
    source_not_in_force: DOSE_COPY.rejection.source_not_in_force,
  } satisfies Record<Exclude<DoseRejectionReason, 'invalid_weight'>, string>,
  calculationFailed: 'Не вдалося розрахувати дозу за цим правилом — дозу не показано.',
  rulesFailed: 'Правила калькулятора не завантажились. Розрахунок недоступний.',
  rulesEmpty: 'У калькуляторі немає жодного правила.',
} as const;
