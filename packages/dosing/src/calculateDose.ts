import {
  decimalFromNumber,
  decimalToText,
  divideExactly,
  isGreaterThan,
  multiplyDecimals,
  roundToStep,
  toDisplayDecimal,
  type Decimal,
} from '#decimal';
import type { Concentration, DosingRule, Route, UsableSourceValidity } from '#dosingRule';
import type { LoadedRule, RuleSet } from '#loadRuleSet';

export type DoseParameter = 'drug' | 'indication' | 'route' | 'weight';

export type DoseInput = {
  drug: string | null;
  indication: string | null;
  route: Route | null;
  weightKg: number | null;
};

export type DoseVolume =
  | { kind: 'calculated'; volumeMl: string }
  | { kind: 'no_concentration' }
  | { kind: 'not_exact_decimal' };

export type DoseOutcome =
  | {
      kind: 'dose';
      rule: DosingRule;
      sourceValidity: UsableSourceValidity;
      doseMg: string;
      volume: DoseVolume;
      isCappedAtMaximum: boolean;
      formulaSteps: string[];
    }
  | { kind: 'missing_parameter'; parameter: DoseParameter }
  | { kind: 'rejected'; reason: 'invalid_weight' | 'no_rule' | 'source_not_in_force' | 'below_rounding_step' };

type DoseStep = { doseMg: Decimal; formulaSteps: string[] };

const MAX_WEIGHT_DECIMAL_PLACES = 2;

const MAX_WEIGHT_KG = 300;

const NO_BREAK_SPACE = '\u00A0';

const formatForFormula = (value: Decimal): string => toDisplayDecimal(decimalToText(value));

const withUnit = (value: Decimal, unit: string): string => `${formatForFormula(value)}${NO_BREAK_SPACE}${unit}`;

const presentText = (value: string | null): string | null => (value === null || value.trim() === '' ? null : value);

const isAcceptedWeight = (weightKg: number): boolean =>
  Number.isFinite(weightKg) &&
  weightKg > 0 &&
  weightKg <= MAX_WEIGHT_KG &&
  decimalFromNumber(weightKg).scale <= MAX_WEIGHT_DECIMAL_PLACES;

type RuleKey = { drug: string; indication: string; route: Route };

const matchesKey = (rule: DosingRule, key: RuleKey): boolean =>
  rule.drug === key.drug && rule.indication === key.indication && rule.route === key.route;

const findRule = (ruleSet: RuleSet, key: RuleKey): LoadedRule | 'source_not_in_force' | 'no_rule' => {
  const loaded = ruleSet.rules.find(({ rule }) => matchesKey(rule, key));
  if (loaded) return loaded;
  return ruleSet.rulesWithUnusableSource.some((rule) => matchesKey(rule, key)) ? 'source_not_in_force' : 'no_rule';
};

const baseDose = (rule: DosingRule, weightKg: number): DoseStep => {
  const weight = decimalFromNumber(weightKg);
  if (rule.dose.kind === 'per_kg') {
    const perKg = decimalFromNumber(rule.dose.mgPerKg);
    const doseMg = multiplyDecimals(perKg, weight);
    const step = `${withUnit(perKg, 'мг/кг')} × ${withUnit(weight, 'кг')} = ${withUnit(doseMg, 'мг')}`;
    return { doseMg, formulaSteps: [step] };
  }
  const band = rule.dose.bands.find(
    ({ minKg, maxKgExclusive }) =>
      (minKg === null || weightKg >= minKg) && (maxKgExclusive === null || weightKg < maxKgExclusive),
  );
  if (!band) {
    throw new Error(`Rule ${rule.id} has no weight band for the given weight`);
  }
  const doseMg = decimalFromNumber(band.doseMg);
  return { doseMg, formulaSteps: [`${withUnit(weight, 'кг')} → ${band.label}: ${withUnit(doseMg, 'мг')}`] };
};

const applyRounding = (rule: DosingRule, current: DoseStep): DoseStep => {
  if (rule.rounding === 'none') {
    return current;
  }
  const step = decimalFromNumber(rule.rounding.stepMg);
  const doseMg = roundToStep(current.doseMg, step, rule.rounding.direction);
  const label = rule.rounding.direction === 'down' ? 'округлення вниз' : 'округлення до найближчого';
  const text = `${label} з кроком ${withUnit(step, 'мг')}: ${withUnit(doseMg, 'мг')}`;
  return { doseMg, formulaSteps: [...current.formulaSteps, text] };
};

const applyMaximum = (rule: DosingRule, current: DoseStep): DoseStep & { isCappedAtMaximum: boolean } => {
  if (rule.maxSingleDoseMg === null) {
    return { ...current, isCappedAtMaximum: false };
  }
  const maximum = decimalFromNumber(rule.maxSingleDoseMg);
  if (!isGreaterThan(current.doseMg, maximum)) {
    return { ...current, isCappedAtMaximum: false };
  }
  const text = `більше за максимальну разову дозу ${withUnit(maximum, 'мг')} → ${withUnit(maximum, 'мг')}`;
  return { doseMg: maximum, formulaSteps: [...current.formulaSteps, text], isCappedAtMaximum: true };
};

const calculateVolume = (
  concentration: Concentration | null,
  doseMg: Decimal,
): { volume: DoseVolume; formulaSteps: string[] } => {
  if (concentration === null) {
    return { volume: { kind: 'no_concentration' }, formulaSteps: [] };
  }
  const amountMg = decimalFromNumber(concentration.amountMg);
  const volumeMl = decimalFromNumber(concentration.volumeMl);
  const result = divideExactly(multiplyDecimals(doseMg, volumeMl), amountMg);
  if (result === null) {
    return { volume: { kind: 'not_exact_decimal' }, formulaSteps: [] };
  }
  const text = `${withUnit(doseMg, 'мг')} × ${withUnit(volumeMl, 'мл')} / ${withUnit(amountMg, 'мг')} = ${withUnit(result, 'мл')}`;
  return { volume: { kind: 'calculated', volumeMl: decimalToText(result) }, formulaSteps: [text] };
};

export const calculateDose = (ruleSet: RuleSet, input: DoseInput): DoseOutcome => {
  const drug = presentText(input.drug);
  const indication = presentText(input.indication);
  if (drug === null) return { kind: 'missing_parameter', parameter: 'drug' };
  if (indication === null) return { kind: 'missing_parameter', parameter: 'indication' };
  if (input.route === null) return { kind: 'missing_parameter', parameter: 'route' };
  const loaded = findRule(ruleSet, { drug, indication, route: input.route });
  if (typeof loaded === 'string') return { kind: 'rejected', reason: loaded };
  if (input.weightKg === null) return { kind: 'missing_parameter', parameter: 'weight' };
  if (!isAcceptedWeight(input.weightKg)) return { kind: 'rejected', reason: 'invalid_weight' };

  const { rule, sourceValidity } = loaded;
  const rounded = applyRounding(rule, baseDose(rule, input.weightKg));
  if (rounded.doseMg.units === 0n) return { kind: 'rejected', reason: 'below_rounding_step' };
  const capped = applyMaximum(rule, rounded);
  const { volume, formulaSteps: volumeSteps } = calculateVolume(rule.concentration, capped.doseMg);
  const formulaSteps = [...capped.formulaSteps, ...volumeSteps];
  return {
    kind: 'dose',
    rule,
    sourceValidity,
    doseMg: decimalToText(capped.doseMg),
    volume,
    isCappedAtMaximum: capped.isCappedAtMaximum,
    formulaSteps,
  };
};
