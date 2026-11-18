import { ROUTE_LABELS, type Route } from '@rytm/dosing';

import { isNullableString, isFiniteNumber, isRecord } from '@/lib/type-guards';
import type { DoseCandidate, DoseParameters, MissingDoseParameter } from '@/features/chat/types';

const ROUTES: string[] = Object.keys(ROUTE_LABELS);

export function isRoute(value: unknown): value is Route {
  return typeof value === 'string' && ROUTES.includes(value);
}

function isMissingParameter(value: unknown): value is MissingDoseParameter {
  return value === 'rule' || value === 'weight';
}

function parseCandidate(value: unknown): DoseCandidate | null {
  if (!isRecord(value)) return null;
  const { ruleId, drug, indication, route, population } = value;
  if (
    typeof ruleId !== 'string' ||
    typeof drug !== 'string' ||
    typeof indication !== 'string' ||
    !isRoute(route) ||
    !isNullableString(population)
  ) {
    return null;
  }
  return { ruleId, drug, indication, route, population };
}

function parseCandidates(value: unknown): DoseCandidate[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const candidates = value.map(parseCandidate);
  return candidates.every((candidate) => candidate !== null) ? candidates : null;
}

function parseMissing(value: unknown): MissingDoseParameter[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.every(isMissingParameter) ? value : null;
}

export function parseDoseParameters(payload: unknown): DoseParameters | null {
  if (!isRecord(payload)) return null;
  const { status, reason, ruleId, weightKg } = payload;
  if (status === 'no_rule') {
    return reason === 'no_rule' || reason === 'source_not_in_force' ? { status, reason } : null;
  }
  const candidates = parseCandidates(payload.candidates);
  if (candidates === null) return null;
  const isKnownRuleId = candidates.some((candidate) => candidate.ruleId === ruleId);
  if (status === 'confirm') {
    if (typeof ruleId !== 'string' || !isKnownRuleId || !isFiniteNumber(weightKg)) return null;
    return { status, ruleId, weightKg, candidates };
  }
  const missing = parseMissing(payload.missing);
  if (status !== 'incomplete' || missing === null) return null;
  if (!isNullableString(ruleId) || (ruleId !== null && !isKnownRuleId)) return null;
  if (weightKg !== null && !isFiniteNumber(weightKg)) return null;
  return { status, ruleId, weightKg, missing, candidates };
}
