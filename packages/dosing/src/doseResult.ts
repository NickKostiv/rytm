import type { DoseOutcome } from '#calculateDose';
import { MOH_RULE_SET_DATE, MOH_RULE_SOURCE_DOCUMENTS } from '#mohRuleSet';

export type CalculatedDose = Extract<DoseOutcome, { kind: 'dose' }>;

export type DoseResultBody = CalculatedDose & { weightKg: number; sourceUrl: string; sourceTitle: string; ruleSetDate: string };

export const toDoseResultBody = (outcome: CalculatedDose, weightKg: number): DoseResultBody | null => {
  const document = MOH_RULE_SOURCE_DOCUMENTS.get(outcome.rule.source.registryId);
  if (!document) return null;
  return {
    ...outcome,
    weightKg,
    sourceUrl: `${document.url}#page=${outcome.rule.source.page}`,
    sourceTitle: document.title,
    ruleSetDate: MOH_RULE_SET_DATE,
  };
};
