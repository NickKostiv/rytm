import type { DosingRule, SourceValidity } from '#dosingRule';

export const SYNTHETIC_SOURCE_UNKNOWN = 'synthetic-source-unknown';
export const SYNTHETIC_SOURCE_IN_FORCE = 'synthetic-source-in-force';
export const SYNTHETIC_SOURCE_SUPERSEDED = 'synthetic-source-superseded';
export const SYNTHETIC_SOURCE_NEEDS_REVIEW = 'synthetic-source-needs-review';

export const SYNTHETIC_SOURCE_VALIDITIES: ReadonlyMap<string, SourceValidity> = new Map<string, SourceValidity>([
  [SYNTHETIC_SOURCE_UNKNOWN, 'unknown'],
  [SYNTHETIC_SOURCE_IN_FORCE, 'in_force'],
  [SYNTHETIC_SOURCE_SUPERSEDED, 'superseded'],
  [SYNTHETIC_SOURCE_NEEDS_REVIEW, 'needs_review'],
]);

const syntheticSource = (registryId: string): DosingRule['source'] => ({
  registryId,
  orderNumber: 'SYNTHETIC-0',
  orderDate: '2000-01-01',
  annex: null,
  section: 'SYNTHETIC SECTION',
  page: 1,
  quote: 'SYNTHETIC TEST DATA, NOT A REAL DOSE',
});

export const SYNTHETIC_PER_KG_RULE: DosingRule = {
  id: 'synthetic-a-condition-iv',
  drug: 'синтетичний препарат A',
  indication: 'синтетичний стан',
  population: null,
  route: 'iv',
  concentration: { amountMg: 5, volumeMl: 2 },
  concentrationText: '5 мг/2 мл (синтетично)',
  dose: { kind: 'per_kg', mgPerKg: 0.7 },
  maxSingleDoseMg: 13,
  repeat: null,
  rounding: 'none',
  source: syntheticSource(SYNTHETIC_SOURCE_UNKNOWN),
};

export const SYNTHETIC_BAND_RULE: DosingRule = {
  id: 'synthetic-b-condition-im',
  drug: 'синтетичний препарат B',
  indication: 'синтетичний стан',
  population: 'синтетична група пацієнтів',
  route: 'im',
  concentration: null,
  concentrationText: null,
  dose: {
    kind: 'band',
    bands: [
      { minKg: 17, maxKgExclusive: null, doseMg: 7.5, label: 'синтетична група від 17 кг' },
      { minKg: null, maxKgExclusive: 17, doseMg: 2.5, label: 'синтетична група менше 17 кг' },
    ],
  },
  maxSingleDoseMg: null,
  repeat: { minMinutes: 7, maxMinutes: 11 },
  rounding: 'none',
  source: syntheticSource(SYNTHETIC_SOURCE_IN_FORCE),
};

export const syntheticRuleWithSource = (rule: DosingRule, registryId: string): DosingRule => ({
  ...rule,
  source: syntheticSource(registryId),
});
