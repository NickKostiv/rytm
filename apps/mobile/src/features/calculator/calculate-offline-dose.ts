import {
  calculateDose,
  type DoseParameter,
  type Route,
  type RuleSet,
  toDoseResultBody,
} from '@rytm/dosing';

import { CALCULATOR_COPY } from '@/features/calculator/constants';
import type { DoseResult } from '@/features/dosing/types';

export type DoseSelection = { drug: string; indication: string; route: Route };

export type OfflineDoseOutcome =
  | { kind: 'dose'; result: DoseResult }
  | { kind: 'missing'; parameter: DoseParameter }
  | { kind: 'invalid_weight' }
  | { kind: 'refused'; message: string };

const CALCULATION_FAILED: OfflineDoseOutcome = {
  kind: 'refused',
  message: CALCULATOR_COPY.calculationFailed,
};

function tryCalculateDose(ruleSet: RuleSet, selection: DoseSelection, weightKg: number) {
  try {
    return calculateDose(ruleSet, { ...selection, weightKg });
  } catch {
    return null;
  }
}

export function calculateOfflineDose(
  ruleSet: RuleSet,
  selection: DoseSelection,
  weightKg: number,
): OfflineDoseOutcome {
  const outcome = tryCalculateDose(ruleSet, selection, weightKg);
  if (outcome === null) return CALCULATION_FAILED;
  if (outcome.kind === 'missing_parameter') return { kind: 'missing', parameter: outcome.parameter };
  if (outcome.kind === 'dose') {
    const result = toDoseResultBody(outcome, weightKg);
    return result === null ? CALCULATION_FAILED : { kind: 'dose', result };
  }
  if (outcome.reason === 'invalid_weight') return { kind: 'invalid_weight' };
  return { kind: 'refused', message: CALCULATOR_COPY.rejection[outcome.reason] };
}
