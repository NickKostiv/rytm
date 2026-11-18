import { WEIGHT_INPUT_COPY } from '@/features/dosing/constants';

const TOO_PRECISE_WEIGHT = /^\d+[.,]\d{3,}$/;
const WEIGHT_TEXT = /^\d+([.,]\d{1,2})?$/;

export type WeightInput = { weightKg: number; error: null } | { weightKg: null; error: string };

export function parseWeightInput(text: string): WeightInput {
  const compactText = text.trim();
  if (compactText === '') return { weightKg: null, error: WEIGHT_INPUT_COPY.weightEmpty };
  if (TOO_PRECISE_WEIGHT.test(compactText)) {
    return { weightKg: null, error: WEIGHT_INPUT_COPY.weightTooPrecise };
  }
  if (!WEIGHT_TEXT.test(compactText)) {
    return { weightKg: null, error: WEIGHT_INPUT_COPY.weightNotNumber };
  }
  const weightKg = Number(compactText.replace(',', '.'));
  if (weightKg === 0) return { weightKg: null, error: WEIGHT_INPUT_COPY.weightZero };
  return { weightKg, error: null };
}
