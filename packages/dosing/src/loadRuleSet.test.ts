import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadRuleSet } from '#loadRuleSet';
import {
  SYNTHETIC_BAND_RULE,
  SYNTHETIC_PER_KG_RULE,
  SYNTHETIC_SOURCE_NEEDS_REVIEW,
  SYNTHETIC_SOURCE_SUPERSEDED,
  SYNTHETIC_SOURCE_VALIDITIES,
  syntheticRuleWithSource,
} from '#syntheticRules';
import type { WeightBand } from '#dosingRule';

const withBands = (bands: WeightBand[]) => ({ ...SYNTHETIC_BAND_RULE, dose: { kind: 'band', bands } });

test('a valid synthetic set loads with each source validity attached', () => {
  const ruleSet = loadRuleSet([SYNTHETIC_PER_KG_RULE, SYNTHETIC_BAND_RULE], SYNTHETIC_SOURCE_VALIDITIES);
  assert.deepEqual(
    ruleSet.rules.map(({ rule, sourceValidity }) => [rule.id, sourceValidity]),
    [
      [SYNTHETIC_PER_KG_RULE.id, 'unknown'],
      [SYNTHETIC_BAND_RULE.id, 'in_force'],
    ],
  );
});

test('a set that is not an array is rejected', () => {
  assert.throws(() => loadRuleSet({ rules: [] }, SYNTHETIC_SOURCE_VALIDITIES), /expected an array/);
});

test('a rule with a missing or invalid required field fails the whole set and names the fields', () => {
  const { maxSingleDoseMg: _omitted, ...withoutMaximum } = SYNTHETIC_PER_KG_RULE;
  assert.throws(
    () => loadRuleSet([SYNTHETIC_BAND_RULE, withoutMaximum], SYNTHETIC_SOURCE_VALIDITIES),
    /rule\[1\]: missing or invalid maxSingleDoseMg/,
  );
  assert.throws(
    () => loadRuleSet([{ ...SYNTHETIC_PER_KG_RULE, route: 'rectal', dose: { kind: 'per_kg', mgPerKg: -1 } }], SYNTHETIC_SOURCE_VALIDITIES),
    /missing or invalid route, dose/,
  );
  assert.throws(() => loadRuleSet(['not a rule'], SYNTHETIC_SOURCE_VALIDITIES), /rule\[0\]: not an object/);
});

test('weight bands with a gap are rejected', () => {
  const gap = withBands([
    { minKg: null, maxKgExclusive: 17, doseMg: 2.5, label: 'low' },
    { minKg: 18, maxKgExclusive: null, doseMg: 7.5, label: 'high' },
  ]);
  assert.throws(() => loadRuleSet([gap], SYNTHETIC_SOURCE_VALIDITIES), /gap or overlap between bands "low" and "high"/);
});

test('weight bands that overlap are rejected', () => {
  const overlap = withBands([
    { minKg: null, maxKgExclusive: 17, doseMg: 2.5, label: 'low' },
    { minKg: 16, maxKgExclusive: null, doseMg: 7.5, label: 'high' },
  ]);
  assert.throws(() => loadRuleSet([overlap], SYNTHETIC_SOURCE_VALIDITIES), /gap or overlap/);
});

test('weight bands that leave the lowest or highest weights uncovered are rejected', () => {
  const closedBottom = withBands([
    { minKg: 3, maxKgExclusive: 17, doseMg: 2.5, label: 'low' },
    { minKg: 17, maxKgExclusive: null, doseMg: 7.5, label: 'high' },
  ]);
  const closedTop = withBands([
    { minKg: null, maxKgExclusive: 17, doseMg: 2.5, label: 'low' },
    { minKg: 17, maxKgExclusive: 90, doseMg: 7.5, label: 'high' },
  ]);
  assert.throws(() => loadRuleSet([closedBottom], SYNTHETIC_SOURCE_VALIDITIES), /lowest weight band must start open/);
  assert.throws(() => loadRuleSet([closedTop], SYNTHETIC_SOURCE_VALIDITIES), /highest weight band must end open/);
});

test('rules whose source is superseded or needs review are kept out of the usable rules, the rest still load', () => {
  const superseded = syntheticRuleWithSource(SYNTHETIC_PER_KG_RULE, SYNTHETIC_SOURCE_SUPERSEDED);
  const changedPdf = syntheticRuleWithSource(
    { ...SYNTHETIC_PER_KG_RULE, id: 'synthetic-a-condition-po', route: 'po' },
    SYNTHETIC_SOURCE_NEEDS_REVIEW,
  );
  const ruleSet = loadRuleSet([superseded, changedPdf, SYNTHETIC_BAND_RULE], SYNTHETIC_SOURCE_VALIDITIES);
  assert.deepEqual(
    ruleSet.rules.map(({ rule }) => rule.id),
    [SYNTHETIC_BAND_RULE.id],
  );
  assert.deepEqual(
    ruleSet.rulesWithUnusableSource.map((rule) => rule.id),
    [superseded.id, changedPdf.id],
  );
});

test('a rule with an unusable source still fails the set on a structural error', () => {
  const broken = { ...syntheticRuleWithSource(SYNTHETIC_PER_KG_RULE, SYNTHETIC_SOURCE_SUPERSEDED), maxSingleDoseMg: 0 };
  assert.throws(() => loadRuleSet([broken], SYNTHETIC_SOURCE_VALIDITIES), /missing or invalid maxSingleDoseMg/);
});

test('unknown fields are rejected at every level', () => {
  const withDailyMaximum = { ...SYNTHETIC_PER_KG_RULE, maxDailyDoseMg: 40 };
  assert.throws(
    () => loadRuleSet([withDailyMaximum], SYNTHETIC_SOURCE_VALIDITIES),
    /rule\[0\]: unknown fields maxDailyDoseMg/,
  );
  const bandWithAge = { minKg: 17, maxKgExclusive: null, doseMg: 7.5, label: 'high', ageYears: 5 };
  const nested: Record<string, unknown>[] = [
    { ...SYNTHETIC_PER_KG_RULE, dose: { kind: 'per_kg', mgPerKg: 0.7, mgPerKgMax: 1 } },
    { ...SYNTHETIC_PER_KG_RULE, concentration: { amountMg: 5, volumeMl: 2, percent: 0.25 } },
    { ...SYNTHETIC_PER_KG_RULE, rounding: { stepMg: 0.25, direction: 'down', minimumMg: 1 } },
    { ...SYNTHETIC_PER_KG_RULE, repeat: { minMinutes: 7, maxMinutes: 11, maxRepeats: 2 } },
    { ...SYNTHETIC_PER_KG_RULE, source: { ...SYNTHETIC_PER_KG_RULE.source, chapter: '0.0' } },
    withBands([
      { minKg: null, maxKgExclusive: 17, doseMg: 2.5, label: 'low' },
      bandWithAge,
    ]),
  ];
  for (const rule of nested) {
    assert.throws(() => loadRuleSet([rule], SYNTHETIC_SOURCE_VALIDITIES), /missing or invalid (dose|concentration|rounding|repeat|source)$/m);
  }
});

test('a rule whose source is not in the registry is rejected', () => {
  const unregistered = syntheticRuleWithSource(SYNTHETIC_PER_KG_RULE, 'synthetic-source-missing');
  assert.throws(() => loadRuleSet([unregistered], SYNTHETIC_SOURCE_VALIDITIES), /not in the source registry/);
});

test('an empty population or section is rejected', () => {
  assert.throws(() => loadRuleSet([{ ...SYNTHETIC_PER_KG_RULE, population: ' ' }], SYNTHETIC_SOURCE_VALIDITIES), /missing or invalid population/);
  const withoutSection = { ...SYNTHETIC_PER_KG_RULE, source: { ...SYNTHETIC_PER_KG_RULE.source, section: '' } };
  assert.throws(() => loadRuleSet([withoutSection], SYNTHETIC_SOURCE_VALIDITIES), /missing or invalid source/);
});

test('a concentration without its verbatim text is rejected', () => {
  const withoutText = { ...SYNTHETIC_PER_KG_RULE, concentrationText: null };
  assert.throws(() => loadRuleSet([withoutText], SYNTHETIC_SOURCE_VALIDITIES), /concentration and concentrationText/);
});

test('two rules for the same drug, indication and route are rejected', () => {
  const duplicate = { ...SYNTHETIC_PER_KG_RULE, id: 'synthetic-a-condition-iv-copy' };
  assert.throws(
    () => loadRuleSet([SYNTHETIC_PER_KG_RULE, duplicate], SYNTHETIC_SOURCE_VALIDITIES),
    /repeats drug, indication and route/,
  );
});
