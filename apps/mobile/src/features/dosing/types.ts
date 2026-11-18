import type { DoseOutcome, DosingRule, RuleSource } from '@rytm/dosing';

type CalculatedDose = Extract<DoseOutcome, { kind: 'dose' }>;

export type DoseRejectionReason = Extract<DoseOutcome, { kind: 'rejected' }>['reason'];

export type DoseResult = Pick<
  CalculatedDose,
  'sourceValidity' | 'doseMg' | 'volume' | 'isCappedAtMaximum' | 'formulaSteps'
> & {
  rule: Pick<
    DosingRule,
    | 'drug'
    | 'indication'
    | 'population'
    | 'route'
    | 'concentrationText'
    | 'maxSingleDoseMg'
    | 'repeat'
  > & { source: Pick<RuleSource, 'orderNumber' | 'orderDate' | 'section' | 'page'> };
  weightKg: number;
  sourceUrl: string;
  sourceTitle: string;
  ruleSetDate: string;
};
