import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateDose, type DoseInput, type DoseOutcome } from '#calculateDose';
import type { Concentration, DosingRule, Rounding } from '#dosingRule';
import { loadRuleSet } from '#loadRuleSet';
import {
  SYNTHETIC_BAND_RULE,
  SYNTHETIC_PER_KG_RULE,
  SYNTHETIC_SOURCE_NEEDS_REVIEW,
  SYNTHETIC_SOURCE_SUPERSEDED,
  SYNTHETIC_SOURCE_VALIDITIES,
  syntheticRuleWithSource,
} from '#syntheticRules';

const SYNTHETIC_RULE_SET = loadRuleSet([SYNTHETIC_PER_KG_RULE, SYNTHETIC_BAND_RULE], SYNTHETIC_SOURCE_VALIDITIES);

const inputFor = (rule: DosingRule, weightKg: number | null): DoseInput => ({
  drug: rule.drug,
  indication: rule.indication,
  route: rule.route,
  weightKg,
});

const calculateWith = (rule: DosingRule, weightKg: number | null): DoseOutcome =>
  calculateDose(loadRuleSet([rule], SYNTHETIC_SOURCE_VALIDITIES), inputFor(rule, weightKg));

const expectDose = (outcome: DoseOutcome): Extract<DoseOutcome, { kind: 'dose' }> => {
  assert.ok(outcome.kind === 'dose', `expected a dose, got ${JSON.stringify(outcome)}`);
  return outcome;
};

const SYNTHETIC_POINT_ONE_PER_KG: DosingRule = {
  ...SYNTHETIC_PER_KG_RULE,
  concentration: null,
  concentrationText: null,
  dose: { kind: 'per_kg', mgPerKg: 0.1 },
  maxSingleDoseMg: null,
};

const withRounding = (rounding: Rounding): DosingRule => ({ ...SYNTHETIC_POINT_ONE_PER_KG, rounding });

const withConcentration = (concentration: Concentration): DosingRule => ({
  ...SYNTHETIC_POINT_ONE_PER_KG,
  concentration,
  concentrationText: 'синтетична концентрація',
});

test('per-kg rule: dose, volume and formula are exact decimals with the rule numbers and the weight', () => {
  const result = expectDose(calculateDose(SYNTHETIC_RULE_SET, inputFor(SYNTHETIC_PER_KG_RULE, 12)));
  assert.equal(result.doseMg, '8.4');
  assert.deepEqual(result.volume, { kind: 'calculated', volumeMl: '3.36' });
  assert.equal(result.isCappedAtMaximum, false);
  assert.equal(result.formula, '0,7 мг/кг × 12 кг = 8,4 мг; 8,4 мг × 2 мл / 5 мг = 3,36 мл');
  assert.equal(result.rule.id, SYNTHETIC_PER_KG_RULE.id);
  assert.equal(result.rule.maxSingleDoseMg, 13);
  assert.equal(result.rule.source.orderDate, '2000-01-01');
});

test('no floating-point artefacts in a shown number', () => {
  assert.equal(expectDose(calculateWith(SYNTHETIC_POINT_ONE_PER_KG, 3)).doseMg, '0.3');
  assert.equal(expectDose(calculateDose(SYNTHETIC_RULE_SET, inputFor(SYNTHETIC_PER_KG_RULE, 12.3))).doseMg, '8.61');
});

test('a dose above the maximum single dose is capped and marked', () => {
  const result = expectDose(calculateDose(SYNTHETIC_RULE_SET, inputFor(SYNTHETIC_PER_KG_RULE, 30)));
  assert.equal(result.doseMg, '13');
  assert.equal(result.isCappedAtMaximum, true);
  assert.equal(
    result.formula,
    '0,7 мг/кг × 30 кг = 21 мг; більше за максимальну разову дозу 13 мг → 13 мг; 13 мг × 2 мл / 5 мг = 5,2 мл',
  );
});

test('a dose equal to the maximum is not marked as capped', () => {
  const result = expectDose(calculateWith({ ...SYNTHETIC_PER_KG_RULE, maxSingleDoseMg: 8.4 }, 12));
  assert.equal(result.doseMg, '8.4');
  assert.equal(result.isCappedAtMaximum, false);
});

test('band rule: below, exactly on and above the band boundary', () => {
  const doseAt = (weightKg: number): string =>
    expectDose(calculateDose(SYNTHETIC_RULE_SET, inputFor(SYNTHETIC_BAND_RULE, weightKg))).doseMg;
  assert.equal(doseAt(16.9), '2.5');
  assert.equal(doseAt(17), '7.5');
  assert.equal(doseAt(17.1), '7.5');
  const onBoundary = expectDose(calculateDose(SYNTHETIC_RULE_SET, inputFor(SYNTHETIC_BAND_RULE, 17)));
  assert.equal(onBoundary.formula, '17 кг → синтетична група від 17 кг: 7,5 мг');
  assert.deepEqual(onBoundary.volume, { kind: 'no_concentration' });
  assert.equal(onBoundary.sourceValidity, 'in_force');
});

test('a source with unknown validity is accepted and its validity is returned', () => {
  const result = expectDose(calculateDose(SYNTHETIC_RULE_SET, inputFor(SYNTHETIC_PER_KG_RULE, 12)));
  assert.equal(result.sourceValidity, 'unknown');
});

test('a missing weight asks for the weight and returns no number', () => {
  const outcome = calculateDose(SYNTHETIC_RULE_SET, inputFor(SYNTHETIC_PER_KG_RULE, null));
  assert.deepEqual(outcome, { kind: 'missing_parameter', parameter: 'weight' });
});

test('a missing drug, indication or route is asked for, never assumed', () => {
  const complete = inputFor(SYNTHETIC_PER_KG_RULE, 12);
  assert.deepEqual(calculateDose(SYNTHETIC_RULE_SET, { ...complete, drug: null }), {
    kind: 'missing_parameter',
    parameter: 'drug',
  });
  assert.deepEqual(calculateDose(SYNTHETIC_RULE_SET, { ...complete, indication: '  ' }), {
    kind: 'missing_parameter',
    parameter: 'indication',
  });
  assert.deepEqual(calculateDose(SYNTHETIC_RULE_SET, { ...complete, route: null }), {
    kind: 'missing_parameter',
    parameter: 'route',
  });
});

test('a weight with more than two decimal places is rejected, so caller float artefacts never reach a dose', () => {
  for (const weightKg of [0.1 + 0.2, 23.456, 1e-7]) {
    assert.deepEqual(calculateDose(SYNTHETIC_RULE_SET, inputFor(SYNTHETIC_PER_KG_RULE, weightKg)), {
      kind: 'rejected',
      reason: 'invalid_weight',
    });
  }
  assert.equal(expectDose(calculateDose(SYNTHETIC_RULE_SET, inputFor(SYNTHETIC_PER_KG_RULE, 12.35))).doseMg, '8.645');
});

test('a rule whose source is superseded or needs review gives source_not_in_force; other rules still calculate', () => {
  const superseded = syntheticRuleWithSource(SYNTHETIC_PER_KG_RULE, SYNTHETIC_SOURCE_SUPERSEDED);
  const changedPdf = syntheticRuleWithSource(
    { ...SYNTHETIC_PER_KG_RULE, id: 'synthetic-a-condition-po', route: 'po' },
    SYNTHETIC_SOURCE_NEEDS_REVIEW,
  );
  const ruleSet = loadRuleSet([superseded, changedPdf, SYNTHETIC_BAND_RULE], SYNTHETIC_SOURCE_VALIDITIES);
  for (const rule of [superseded, changedPdf]) {
    assert.deepEqual(calculateDose(ruleSet, inputFor(rule, 12)), { kind: 'rejected', reason: 'source_not_in_force' });
  }
  assert.equal(expectDose(calculateDose(ruleSet, inputFor(SYNTHETIC_BAND_RULE, 17))).doseMg, '7.5');
});

test('a dose that rounds to zero is rejected with no number, for both rounding directions', () => {
  const down = { ...SYNTHETIC_PER_KG_RULE, rounding: { stepMg: 5, direction: 'down' } } satisfies DosingRule;
  assert.deepEqual(calculateWith(down, 7), { kind: 'rejected', reason: 'below_rounding_step' });
  assert.equal(expectDose(calculateWith(down, 7.15)).doseMg, '5');
  const nearest = { ...SYNTHETIC_PER_KG_RULE, rounding: { stepMg: 5, direction: 'nearest' } } satisfies DosingRule;
  assert.deepEqual(calculateWith(nearest, 3), { kind: 'rejected', reason: 'below_rounding_step' });
  assert.equal(expectDose(calculateWith(nearest, 4)).doseMg, '5');
});

test('a weight that is not a positive number is rejected', () => {
  for (const weightKg of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(calculateDose(SYNTHETIC_RULE_SET, inputFor(SYNTHETIC_PER_KG_RULE, weightKg)), {
      kind: 'rejected',
      reason: 'invalid_weight',
    });
  }
});

test('no rule for the drug, indication and route gives no number', () => {
  const otherRoute: DoseInput = { ...inputFor(SYNTHETIC_PER_KG_RULE, 12), route: 'po' };
  assert.deepEqual(calculateDose(SYNTHETIC_RULE_SET, otherRoute), { kind: 'rejected', reason: 'no_rule' });
  const otherDrug = { ...inputFor(SYNTHETIC_PER_KG_RULE, 12), drug: 'синтетичний препарат Z' };
  assert.deepEqual(calculateDose(SYNTHETIC_RULE_SET, otherDrug), { kind: 'rejected', reason: 'no_rule' });
});

test('rounding down to a step, on both sides of the step and exactly on it', () => {
  const rule = withRounding({ stepMg: 0.25, direction: 'down' });
  assert.equal(expectDose(calculateWith(rule, 27.4)).doseMg, '2.5');
  assert.equal(expectDose(calculateWith(rule, 27.5)).doseMg, '2.75');
  assert.equal(expectDose(calculateWith(rule, 27.6)).doseMg, '2.75');
  assert.equal(
    expectDose(calculateWith(rule, 26)).formula,
    '0,1 мг/кг × 26 кг = 2,6 мг; округлення вниз з кроком 0,25 мг: 2,5 мг',
  );
});

test('rounding to the nearest step, on both sides of the midpoint and exactly on it', () => {
  const rule = withRounding({ stepMg: 0.25, direction: 'nearest' });
  assert.equal(expectDose(calculateWith(rule, 26.2)).doseMg, '2.5');
  assert.equal(expectDose(calculateWith(rule, 26.25)).doseMg, '2.75');
  assert.equal(expectDose(calculateWith(rule, 26.3)).doseMg, '2.75');
});

test('rounding never lifts a dose above the maximum: the cap applies after rounding', () => {
  const rule = { ...withRounding({ stepMg: 0.25, direction: 'nearest' }), maxSingleDoseMg: 2.7 };
  const result = expectDose(calculateWith(rule, 27));
  assert.equal(result.doseMg, '2.7');
  assert.equal(result.isCappedAtMaximum, true);
});

test('no rounding when the rule defines none', () => {
  assert.equal(expectDose(calculateWith(SYNTHETIC_POINT_ONE_PER_KG, 26.37)).doseMg, '2.637');
});

test('mg to ml for each concentration form, with no tenfold slip', () => {
  const volumeAt = (concentration: Concentration): unknown => expectDose(calculateWith(withConcentration(concentration), 3)).volume;
  assert.deepEqual(volumeAt({ amountMg: 1, volumeMl: 1 }), { kind: 'calculated', volumeMl: '0.3' });
  assert.deepEqual(volumeAt({ amountMg: 1, volumeMl: 10 }), { kind: 'calculated', volumeMl: '3' });
  assert.deepEqual(volumeAt({ amountMg: 10, volumeMl: 1 }), { kind: 'calculated', volumeMl: '0.03' });
  assert.deepEqual(volumeAt({ amountMg: 50, volumeMl: 1 }), { kind: 'calculated', volumeMl: '0.006' });
  assert.deepEqual(volumeAt({ amountMg: 0.5, volumeMl: 1 }), { kind: 'calculated', volumeMl: '0.6' });
});

test('a volume that is not a finite decimal is not shown rounded', () => {
  const result = expectDose(calculateWith(withConcentration({ amountMg: 3, volumeMl: 1 }), 10));
  assert.equal(result.doseMg, '1');
  assert.deepEqual(result.volume, { kind: 'not_exact_decimal' });
  assert.equal(result.formula, '0,1 мг/кг × 10 кг = 1 мг');
});
