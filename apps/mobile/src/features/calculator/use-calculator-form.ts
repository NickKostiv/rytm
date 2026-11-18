import {
  type DoseParameter,
  type DosingRule,
  type Route,
  type RuleSet,
  toDisplayDecimal,
} from '@rytm/dosing';
import { useState } from 'react';
import { Keyboard } from 'react-native';

import { calculateOfflineDose } from '@/features/calculator/calculate-offline-dose';
import { CALCULATOR_COPY, ROUTE_PREFILL_PICK } from '@/features/calculator/constants';
import { parseCalculatorWeight } from '@/features/calculator/parse-calculator-weight';
import { listDrugs, listIndications, listRouteRules } from '@/features/calculator/rule-options';
import { useRecentRules } from '@/features/calculator/use-recent-rules';
import { DOSE_COPY } from '@/features/chat/constants';
import { WEIGHT_INPUT_COPY } from '@/features/dosing/constants';
import type { DoseResult } from '@/features/dosing/types';

export type CalculatorParams = { ruleId?: string; weightKg?: string; pickRoute?: string };

export type FormSection = DoseParameter;

export type CalculatorFocusTarget = FormSection | 'result';

type Selection = { indication: string | null; drug: string | null; route: Route | null };

type SectionErrors = Record<FormSection, string | null>;

type ExpandedList = 'indication' | 'drug' | null;

export type CalculatorResult =
  | { kind: 'dose'; result: DoseResult }
  | { kind: 'refused'; message: string }
  | null;

const NO_ERRORS: SectionErrors = { indication: null, drug: null, route: null, weight: null };
const EMPTY_SELECTION: Selection = { indication: null, drug: null, route: null };
const SECTION_ORDER: FormSection[] = ['indication', 'drug', 'route', 'weight'];
const MISSING_SECTION_COPY: SectionErrors = {
  indication: CALCULATOR_COPY.indicationMissing,
  drug: CALCULATOR_COPY.drugMissing,
  route: CALCULATOR_COPY.routeMissing,
  weight: WEIGHT_INPUT_COPY.weightEmpty,
};

function readPrefillWeight(weightParam: string | undefined): string {
  if (weightParam === undefined) return '';
  const { weightKg } = parseCalculatorWeight(weightParam);
  return weightKg === null ? '' : toDisplayDecimal(String(weightKg));
}

function readPrefillSelection(rule: DosingRule | undefined, pickRoute: string | undefined) {
  if (rule === undefined) return EMPTY_SELECTION;
  const route = pickRoute === ROUTE_PREFILL_PICK ? null : rule.route;
  return { indication: rule.indication, drug: rule.drug, route };
}

function firstErrorSection(errors: SectionErrors): FormSection | null {
  return SECTION_ORDER.find((section) => errors[section] !== null) ?? null;
}

export function useCalculatorForm(ruleSet: RuleSet, params: CalculatorParams) {
  const rules = ruleSet.rules.map(({ rule }) => rule);
  const [prefillRule] = useState(() => rules.find(({ id }) => id === params.ruleId));
  const [selection, setSelection] = useState<Selection>(() =>
    readPrefillSelection(prefillRule, params.pickRoute),
  );
  const [prefillWeightText] = useState(() => readPrefillWeight(params.weightKg));
  const [weightText, setWeightText] = useState(prefillWeightText);
  const [expandedList, setExpandedList] = useState<ExpandedList>(null);
  const [errors, setErrors] = useState<SectionErrors>(NO_ERRORS);
  const [result, setResult] = useState<CalculatorResult>(null);
  const { recentRuleIds, addRecentRule } = useRecentRules();

  const indications = listIndications(rules);
  const drugOptions = selection.indication === null ? [] : listDrugs(rules, selection.indication);
  const drug = drugOptions.length === 1 ? drugOptions[0].drug : selection.drug;
  const routeRules =
    selection.indication === null || drug === null
      ? []
      : listRouteRules(rules, selection.indication, drug);
  const route = routeRules.length === 1 ? routeRules[0].route : selection.route;
  const selectedRule = routeRules.find((rule) => rule.route === route) ?? null;
  const recentRules = recentRuleIds.flatMap((ruleId) => rules.filter(({ id }) => id === ruleId));

  const applySelection = (next: Selection, clearedErrors: Partial<SectionErrors>) => {
    setSelection(next);
    setExpandedList(null);
    setErrors((current) => ({ ...current, ...clearedErrors }));
    setResult(null);
  };

  const selectIndication = (indication: string) => {
    if (indication === selection.indication) {
      setExpandedList(null);
      return;
    }
    applySelection(
      { indication, drug: null, route: null },
      { indication: null, drug: null, route: null },
    );
  };

  const selectDrug = (nextDrug: string) => {
    if (nextDrug === drug) {
      setExpandedList(null);
      return;
    }
    applySelection({ ...selection, drug: nextDrug, route: null }, { drug: null, route: null });
  };

  const selectRoute = (ruleId: string) => {
    const rule = routeRules.find(({ id }) => id === ruleId);
    if (rule) applySelection({ ...selection, drug, route: rule.route }, { route: null });
  };

  const selectRecentRule = (rule: DosingRule) => {
    applySelection(
      { indication: rule.indication, drug: rule.drug, route: rule.route },
      { indication: null, drug: null, route: null },
    );
  };

  const changeWeight = (text: string) => {
    setWeightText(text);
    setErrors((current) => ({ ...current, weight: null }));
    setResult(null);
  };

  const pickWeightPreset = (weightKg: number) => {
    changeWeight(toDisplayDecimal(String(weightKg)));
    Keyboard.dismiss();
  };

  const validate = (): { errors: SectionErrors; weightKg: number | null } => {
    const weight = parseCalculatorWeight(weightText);
    return {
      weightKg: weight.weightKg,
      errors: {
        indication: selection.indication === null ? CALCULATOR_COPY.indicationMissing : null,
        drug: selection.indication !== null && drug === null ? CALCULATOR_COPY.drugMissing : null,
        route: drug !== null && route === null ? CALCULATOR_COPY.routeMissing : null,
        weight: weight.error,
      },
    };
  };

  const calculate = (): CalculatorFocusTarget | null => {
    Keyboard.dismiss();
    const validation = validate();
    const firstError = firstErrorSection(validation.errors);
    if (firstError !== null || selectedRule === null || validation.weightKg === null) {
      setErrors(validation.errors);
      setResult(null);
      return firstError;
    }
    const outcome = calculateOfflineDose(
      ruleSet,
      { indication: selectedRule.indication, drug: selectedRule.drug, route: selectedRule.route },
      validation.weightKg,
    );
    switch (outcome.kind) {
      case 'dose':
        setErrors(NO_ERRORS);
        setResult(outcome);
        addRecentRule(selectedRule.id);
        return 'result';
      case 'missing':
        setErrors({ ...NO_ERRORS, [outcome.parameter]: MISSING_SECTION_COPY[outcome.parameter] });
        setResult(null);
        return outcome.parameter;
      case 'invalid_weight':
        setErrors({ ...NO_ERRORS, weight: DOSE_COPY.rejection.invalid_weight });
        setResult(null);
        return 'weight';
      case 'refused':
        setErrors(NO_ERRORS);
        setResult(outcome);
        return 'result';
    }
  };

  return {
    isPrefillApplied: prefillRule !== undefined || prefillWeightText !== '',
    isPrefillRuleUnknown: params.ruleId !== undefined && prefillRule === undefined,
    indications,
    drugOptions,
    routeRules,
    selection: { indication: selection.indication, drug, route },
    selectedRule,
    expandedList,
    weightText,
    errors,
    result,
    recentRules,
    selectIndication,
    selectDrug,
    selectRoute,
    selectRecentRule,
    expandList: setExpandedList,
    changeWeight,
    pickWeightPreset,
    calculate,
  };
}
