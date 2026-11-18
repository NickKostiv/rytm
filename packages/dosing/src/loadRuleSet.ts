import {
  ROUTES,
  type BandDose,
  type Concentration,
  type DosingRule,
  type PerKgDose,
  type RepeatInterval,
  type Rounding,
  type Route,
  type RuleSource,
  type SourceValidity,
  type UsableSourceValidity,
  type WeightBand,
} from '#dosingRule';

const RULE_SET_BRAND: unique symbol = Symbol('RuleSet');

export type LoadedRule = { rule: DosingRule; sourceValidity: UsableSourceValidity };

export type RuleSet = {
  readonly rules: readonly LoadedRule[];
  readonly rulesWithUnusableSource: readonly DosingRule[];
  readonly [RULE_SET_BRAND]: true;
};

const ORDER_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isNullablePositiveNumber = (value: unknown): value is number | null => value === null || isPositiveNumber(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const isWeightBand = (value: unknown): value is WeightBand =>
  isRecord(value) &&
  hasOnlyKeys(value, ['minKg', 'maxKgExclusive', 'doseMg', 'label']) &&
  isNullablePositiveNumber(value.minKg) &&
  isNullablePositiveNumber(value.maxKgExclusive) &&
  isPositiveNumber(value.doseMg) &&
  isNonEmptyString(value.label);

const isRoute = (value: unknown): value is Route => ROUTES.some((route) => route === value);

const isConcentration = (value: unknown): value is Concentration | null =>
  value === null ||
  (isRecord(value) &&
    hasOnlyKeys(value, ['amountMg', 'volumeMl']) &&
    isPositiveNumber(value.amountMg) &&
    isPositiveNumber(value.volumeMl));

const isDose = (value: unknown): value is PerKgDose | BandDose =>
  isRecord(value) &&
  ((value.kind === 'per_kg' && hasOnlyKeys(value, ['kind', 'mgPerKg']) && isPositiveNumber(value.mgPerKg)) ||
    (value.kind === 'band' &&
      hasOnlyKeys(value, ['kind', 'bands']) &&
      Array.isArray(value.bands) &&
      value.bands.length > 0 &&
      value.bands.every(isWeightBand)));

const isRepeatInterval = (value: unknown): value is RepeatInterval | null =>
  value === null ||
  (isRecord(value) &&
    hasOnlyKeys(value, ['minMinutes', 'maxMinutes']) &&
    isPositiveNumber(value.minMinutes) &&
    isPositiveNumber(value.maxMinutes) &&
    value.maxMinutes >= value.minMinutes);

const isRounding = (value: unknown): value is Rounding =>
  value === 'none' ||
  (isRecord(value) &&
    hasOnlyKeys(value, ['stepMg', 'direction']) &&
    isPositiveNumber(value.stepMg) &&
    (value.direction === 'down' || value.direction === 'nearest'));

const isRuleSource = (value: unknown): value is RuleSource =>
  isRecord(value) &&
  hasOnlyKeys(value, ['registryId', 'orderNumber', 'orderDate', 'annex', 'page', 'quote']) &&
  isNonEmptyString(value.registryId) &&
  isNonEmptyString(value.orderNumber) &&
  typeof value.orderDate === 'string' &&
  ORDER_DATE_PATTERN.test(value.orderDate) &&
  isNullableString(value.annex) &&
  isPositiveNumber(value.page) &&
  Number.isInteger(value.page) &&
  isNonEmptyString(value.quote);

const RULE_FIELD_CHECKS: { [Field in keyof DosingRule]: (value: unknown) => value is DosingRule[Field] } = {
  id: isNonEmptyString,
  drug: isNonEmptyString,
  indication: isNonEmptyString,
  route: isRoute,
  concentration: isConcentration,
  concentrationText: isNullableString,
  dose: isDose,
  maxSingleDoseMg: isNullablePositiveNumber,
  repeat: isRepeatInterval,
  rounding: isRounding,
  source: isRuleSource,
};

const RULE_FIELDS = Object.keys(RULE_FIELD_CHECKS);

const ruleShapeProblems = (value: unknown): string[] => {
  if (!isRecord(value)) {
    return ['not an object'];
  }
  const invalidFields = Object.entries(RULE_FIELD_CHECKS)
    .filter(([field, isValid]) => !isValid(value[field]))
    .map(([field]) => field);
  const unknownFields = Object.keys(value).filter((field) => !RULE_FIELDS.includes(field));
  return [
    ...(invalidFields.length > 0 ? [`missing or invalid ${invalidFields.join(', ')}`] : []),
    ...(unknownFields.length > 0 ? [`unknown fields ${unknownFields.join(', ')}`] : []),
  ];
};

const isDosingRule = (value: unknown): value is DosingRule => ruleShapeProblems(value).length === 0;

const lowerBoundOrder = (band: WeightBand): number => band.minKg ?? Number.NEGATIVE_INFINITY;

const bandCoverageProblems = (bands: readonly WeightBand[]): string[] => {
  const sorted = [...bands].sort((left, right) => lowerBoundOrder(left) - lowerBoundOrder(right));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const problems: string[] = [];
  if (first?.minKg !== null) {
    problems.push('the lowest weight band must start open (minKg null)');
  }
  if (last?.maxKgExclusive !== null) {
    problems.push('the highest weight band must end open (maxKgExclusive null)');
  }
  sorted.forEach((band, index) => {
    if (band.minKg !== null && band.maxKgExclusive !== null && band.minKg >= band.maxKgExclusive) {
      problems.push(`band "${band.label}" has minKg not below maxKgExclusive`);
    }
    const next = sorted[index + 1];
    if (next && (band.maxKgExclusive === null || band.maxKgExclusive !== next.minKg)) {
      problems.push(`gap or overlap between bands "${band.label}" and "${next.label}"`);
    }
  });
  return problems;
};

const isUsableValidity = (validity: SourceValidity | undefined): validity is UsableSourceValidity =>
  validity === 'unknown' || validity === 'in_force';

const ruleProblems = (rule: DosingRule, sourceValidity: SourceValidity | undefined): string[] => {
  const problems = rule.dose.kind === 'band' ? bandCoverageProblems(rule.dose.bands) : [];
  if ((rule.concentration === null) !== (rule.concentrationText === null)) {
    problems.push('concentration and concentrationText must both be set or both be null');
  }
  if (sourceValidity === undefined) {
    problems.push(`source ${rule.source.registryId} is not in the source registry`);
  }
  return problems;
};

const duplicateProblems = (rules: readonly DosingRule[]): string[] => {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  return rules.flatMap((rule) => {
    const key = JSON.stringify([rule.drug, rule.indication, rule.route]);
    const problems = [
      ...(seenIds.has(rule.id) ? [`duplicate rule id ${rule.id}`] : []),
      ...(seenKeys.has(key) ? [`rule ${rule.id} repeats drug, indication and route of another rule`] : []),
    ];
    seenIds.add(rule.id);
    seenKeys.add(key);
    return problems;
  });
};

export const loadRuleSet = (rules: unknown, sourceValidities: ReadonlyMap<string, SourceValidity>): RuleSet => {
  if (!Array.isArray(rules)) {
    throw new Error('Invalid dosing rule set: expected an array of rules');
  }
  const loaded: LoadedRule[] = [];
  const rulesWithUnusableSource: DosingRule[] = [];
  const problems: string[] = [];
  rules.forEach((value: unknown, index) => {
    if (!isDosingRule(value)) {
      problems.push(...ruleShapeProblems(value).map((problem) => `rule[${index}]: ${problem}`));
      return;
    }
    const sourceValidity = sourceValidities.get(value.source.registryId);
    const found = ruleProblems(value, sourceValidity);
    problems.push(...found.map((problem) => `rule[${index}] ${value.id}: ${problem}`));
    if (found.length > 0) {
      return;
    }
    if (isUsableValidity(sourceValidity)) {
      loaded.push({ rule: value, sourceValidity });
    } else {
      rulesWithUnusableSource.push(value);
    }
  });
  problems.push(...duplicateProblems([...loaded.map(({ rule }) => rule), ...rulesWithUnusableSource]));
  if (problems.length > 0) {
    throw new Error(`Invalid dosing rule set:\n${problems.join('\n')}`);
  }
  return { rules: loaded, rulesWithUnusableSource, [RULE_SET_BRAND]: true };
};
