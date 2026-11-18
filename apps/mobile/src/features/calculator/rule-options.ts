import { type DosingRule, ROUTE_LABELS } from '@rytm/dosing';

const ROUTE_ORDER = Object.keys(ROUTE_LABELS);

export type DrugOption = { drug: string; population: string | null };

export function listIndications(rules: readonly DosingRule[]): string[] {
  const indications = new Set(rules.map(({ indication }) => indication));
  return [...indications].sort((left, right) => left.localeCompare(right, 'uk'));
}

export function listDrugs(rules: readonly DosingRule[], indication: string): DrugOption[] {
  const options = new Map<string, DrugOption>();
  rules
    .filter((rule) => rule.indication === indication)
    .forEach(({ drug, population }) => {
      if (!options.has(drug)) options.set(drug, { drug, population });
    });
  return [...options.values()];
}

export function listRouteRules(
  rules: readonly DosingRule[],
  indication: string,
  drug: string,
): DosingRule[] {
  return rules
    .filter((rule) => rule.indication === indication && rule.drug === drug)
    .sort((left, right) => ROUTE_ORDER.indexOf(left.route) - ROUTE_ORDER.indexOf(right.route));
}
