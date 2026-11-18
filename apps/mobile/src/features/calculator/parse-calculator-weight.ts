import { MAX_WEIGHT_KG } from '@rytm/dosing';

import { CALCULATOR_COPY } from '@/features/calculator/constants';
import { parseWeightInput, type WeightInput } from '@/features/dosing/parse-weight-input';

export function parseCalculatorWeight(text: string): WeightInput {
  const input = parseWeightInput(text);
  if (input.weightKg !== null && input.weightKg > MAX_WEIGHT_KG) {
    return { weightKg: null, error: CALCULATOR_COPY.weightTooHeavy };
  }
  return input;
}
