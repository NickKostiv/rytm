import type { DosingRule, Route, RuleSet } from '@rytm/dosing';
import { NOT_IN_LIST } from './doseExtraction.js';
import type { DoseExtraction } from './doseExtraction.js';

export type DoseCandidate = {
  ruleId: string;
  drug: string;
  indication: string;
  route: Route;
  population: string | null;
};

type MissingDoseParameter = 'rule' | 'weight';

export type DoseParametersEvent =
  | { status: 'confirm'; ruleId: string; weightKg: number; candidates: DoseCandidate[] }
  | {
      status: 'incomplete';
      ruleId: string | null;
      weightKg: number | null;
      missing: MissingDoseParameter[];
      candidates: DoseCandidate[];
    }
  | { status: 'no_rule'; reason: 'no_rule' | 'source_not_in_force' };

const NO_RULE: DoseParametersEvent = { status: 'no_rule', reason: 'no_rule' };

const toDoseCandidate = (rule: DosingRule): DoseCandidate => ({
  ruleId: rule.id,
  drug: rule.drug,
  indication: rule.indication,
  route: rule.route,
  population: rule.population,
});

const missingParameters = (ruleId: string | null, weightKg: number | null): MissingDoseParameter[] => {
  const rule: MissingDoseParameter[] = ruleId === null ? ['rule'] : [];
  const weight: MissingDoseParameter[] = weightKg === null ? ['weight'] : [];
  return [...rule, ...weight];
};

export const matchDoseParameters = (ruleSet: RuleSet, extraction: DoseExtraction): DoseParametersEvent | null => {
  const { isDoseRequest, drug, indication, route, weightKg } = extraction;
  if (!isDoseRequest || drug === null) return null;
  if (drug === NOT_IN_LIST || indication === NOT_IN_LIST || route === NOT_IN_LIST) return NO_RULE;
  const isRequested = (rule: DosingRule): boolean => rule.drug === drug && (indication === null || rule.indication === indication);
  const candidates = ruleSet.rules.map(({ rule }) => rule).filter(isRequested);
  if (candidates.length === 0) {
    return { status: 'no_rule', reason: ruleSet.rulesWithUnusableSource.some(isRequested) ? 'source_not_in_force' : 'no_rule' };
  }
  const ruleWithRoute = candidates.find((rule) => rule.route === route);
  if (route !== null && !ruleWithRoute) return NO_RULE;
  const ruleId = indication !== null && ruleWithRoute ? ruleWithRoute.id : null;
  const items = candidates.map(toDoseCandidate);
  if (ruleId !== null && weightKg !== null) return { status: 'confirm', ruleId, weightKg, candidates: items };
  return { status: 'incomplete', ruleId, weightKg, missing: missingParameters(ruleId, weightKg), candidates: items };
};
