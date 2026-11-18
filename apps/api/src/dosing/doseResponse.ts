import { calculateDose, MOH_RULE_SET_DATE, MOH_RULE_SOURCE_DOCUMENTS } from '@rytm/dosing';
import type { DoseOutcome, DosingRule, RuleSet } from '@rytm/dosing';

type DoseRequest = { ruleId: string; weightKg: number };

type CalculatedDose = Extract<DoseOutcome, { kind: 'dose' }>;

type RejectedDose = Extract<DoseOutcome, { kind: 'rejected' }>;

type DoseResponseBody =
  | (CalculatedDose & { weightKg: number; sourceUrl: string; sourceTitle: string; ruleSetDate: string })
  | RejectedDose;

type DoseResponse =
  | { status: 200; body: DoseResponseBody }
  | { status: 400 | 503; body: { error: string } };

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVICE_UNAVAILABLE = 503;
const INVALID_BODY_MESSAGE = 'Body must be an object with a string "ruleId" and a number "weightKg"';
const CALCULATOR_UNAVAILABLE_MESSAGE = 'Калькулятор тимчасово недоступний. Спробуйте ще раз.';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseDoseRequest = (body: unknown): DoseRequest | null => {
  if (!isRecord(body) || typeof body.ruleId !== 'string' || body.ruleId.trim() === '' || typeof body.weightKg !== 'number') return null;
  return { ruleId: body.ruleId, weightKg: body.weightKg };
};

const findRuleById = (ruleSet: RuleSet, ruleId: string): DosingRule | undefined =>
  ruleSet.rules.find(({ rule }) => rule.id === ruleId)?.rule ?? ruleSet.rulesWithUnusableSource.find(({ id }) => id === ruleId);

const unavailable = (reason: string): DoseResponse => {
  console.error(`Dose request: calculator unavailable, ${reason}`);
  return { status: HTTP_SERVICE_UNAVAILABLE, body: { error: CALCULATOR_UNAVAILABLE_MESSAGE } };
};

const rejected = (outcome: RejectedDose, ruleId: string): DoseResponse => {
  console.log(`Dose request: outcome=rejected reason=${outcome.reason} rule=${ruleId}`);
  return { status: HTTP_OK, body: outcome };
};

const calculateForRule = (ruleSet: RuleSet, rule: DosingRule, weightKg: number): DoseResponse => {
  const outcome = calculateDose(ruleSet, { drug: rule.drug, indication: rule.indication, route: rule.route, weightKg });
  if (outcome.kind === 'rejected') return rejected(outcome, rule.id);
  if (outcome.kind === 'missing_parameter') return unavailable(`outcome=missing_parameter rule=${rule.id}`);
  const document = MOH_RULE_SOURCE_DOCUMENTS.get(outcome.rule.source.registryId);
  if (!document) return unavailable(`outcome=no_source_document rule=${rule.id}`);
  console.log(`Dose request: outcome=dose rule=${rule.id}`);
  return {
    status: HTTP_OK,
    body: {
      ...outcome,
      weightKg,
      sourceUrl: `${document.url}#page=${outcome.rule.source.page}`,
      sourceTitle: document.title,
      ruleSetDate: MOH_RULE_SET_DATE,
    },
  };
};

const readRuleSet = async (getRuleSet: () => Promise<RuleSet>): Promise<RuleSet | null> => {
  try {
    return await getRuleSet();
  } catch (error) {
    console.error(`Dose rule set unavailable: ${error instanceof Error ? error.name : typeof error}`);
    return null;
  }
};

export const respondToDoseRequest = async (body: unknown, getRuleSet: () => Promise<RuleSet>): Promise<DoseResponse> => {
  const request = parseDoseRequest(body);
  if (!request) return { status: HTTP_BAD_REQUEST, body: { error: INVALID_BODY_MESSAGE } };
  const ruleSet = await readRuleSet(getRuleSet);
  if (!ruleSet) return unavailable('rule set failed to load');
  const rule = findRuleById(ruleSet, request.ruleId);
  if (!rule) return rejected({ kind: 'rejected', reason: 'no_rule' }, 'unknown');
  return calculateForRule(ruleSet, rule, request.weightKg);
};
