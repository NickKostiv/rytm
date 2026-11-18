import type { DoseVolume, RepeatInterval } from '@rytm/dosing';

import { isRoute } from '@/features/chat/parse-dose-parameters';
import type { DoseRejectionReason, DoseResult } from '@/features/dosing/types';
import { isFiniteNumber, isNullableString, isRecord } from '@/lib/type-guards';

const DECIMAL_TEXT_PATTERN = /^\d+(\.\d+)?$/;
const REJECTION_REASONS: DoseRejectionReason[] = [
  'invalid_weight',
  'no_rule',
  'source_not_in_force',
  'below_rounding_step',
];

export type DoseReply =
  | { kind: 'dose'; result: DoseResult }
  | { kind: 'rejected'; reason: DoseRejectionReason };

function isDecimalText(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_TEXT_PATTERN.test(value);
}

function isRejectionReason(value: unknown): value is DoseRejectionReason {
  return REJECTION_REASONS.some((reason) => reason === value);
}

function parseVolume(value: unknown): DoseVolume | null {
  if (!isRecord(value)) return null;
  const { kind, volumeMl } = value;
  if (kind === 'calculated') return isDecimalText(volumeMl) ? { kind, volumeMl } : null;
  if (kind === 'no_concentration' || kind === 'not_exact_decimal') return { kind };
  return null;
}

function parseRepeat(value: unknown): RepeatInterval | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { minMinutes, maxMinutes } = value;
  if (!isFiniteNumber(minMinutes) || !isFiniteNumber(maxMinutes)) return undefined;
  return { minMinutes, maxMinutes };
}

function parseSource(value: unknown): DoseResult['rule']['source'] | null {
  if (!isRecord(value)) return null;
  const { orderNumber, orderDate, section, page } = value;
  if (
    typeof orderNumber !== 'string' ||
    typeof orderDate !== 'string' ||
    typeof section !== 'string' ||
    !isFiniteNumber(page)
  ) {
    return null;
  }
  return { orderNumber, orderDate, section, page };
}

function parseRule(value: unknown): DoseResult['rule'] | null {
  if (!isRecord(value)) return null;
  const { drug, indication, population, route, concentrationText, maxSingleDoseMg } = value;
  const repeat = parseRepeat(value.repeat);
  const source = parseSource(value.source);
  if (
    typeof drug !== 'string' ||
    typeof indication !== 'string' ||
    !isNullableString(population) ||
    !isRoute(route) ||
    !isNullableString(concentrationText) ||
    !(maxSingleDoseMg === null || isFiniteNumber(maxSingleDoseMg)) ||
    repeat === undefined ||
    source === null
  ) {
    return null;
  }
  return {
    drug,
    indication,
    population,
    route,
    concentrationText,
    maxSingleDoseMg,
    repeat,
    source,
  };
}

function parseDoseResult(payload: Record<string, unknown>): DoseResult | null {
  const {
    sourceValidity,
    doseMg,
    isCappedAtMaximum,
    formulaSteps,
    weightKg,
    sourceUrl,
    sourceTitle,
    ruleSetDate,
  } = payload;
  const rule = parseRule(payload.rule);
  const volume = parseVolume(payload.volume);
  if (
    rule === null ||
    volume === null ||
    (sourceValidity !== 'unknown' && sourceValidity !== 'in_force') ||
    !isDecimalText(doseMg) ||
    typeof isCappedAtMaximum !== 'boolean' ||
    (isCappedAtMaximum && rule.maxSingleDoseMg === null) ||
    !Array.isArray(formulaSteps) ||
    formulaSteps.length === 0 ||
    !formulaSteps.every((step) => typeof step === 'string') ||
    !isFiniteNumber(weightKg) ||
    typeof sourceUrl !== 'string' ||
    typeof sourceTitle !== 'string' ||
    typeof ruleSetDate !== 'string'
  ) {
    return null;
  }
  return {
    rule,
    sourceValidity,
    doseMg,
    volume,
    isCappedAtMaximum,
    formulaSteps,
    weightKg,
    sourceUrl,
    sourceTitle,
    ruleSetDate,
  };
}

export function parseDoseReply(payload: unknown): DoseReply | null {
  if (!isRecord(payload)) return null;
  if (payload.kind === 'rejected') {
    return isRejectionReason(payload.reason) ? { kind: 'rejected', reason: payload.reason } : null;
  }
  if (payload.kind !== 'dose') return null;
  const result = parseDoseResult(payload);
  return result ? { kind: 'dose', result } : null;
}
