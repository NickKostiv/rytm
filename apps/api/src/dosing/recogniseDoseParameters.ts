import Anthropic from '@anthropic-ai/sdk';
import type { RuleSet } from '@rytm/dosing';
import type { ChatMessage } from '../chatRequest.js';
import { parseDoseExtraction } from './doseExtraction.js';
import type { StructuredOutput } from './doseExtraction.js';
import { matchDoseParameters } from './doseParameters.js';
import type { DoseParametersEvent } from './doseParameters.js';

export type DoseParameterDependencies = {
  extractDoseParameters: (messages: ChatMessage[], signal: AbortSignal) => Promise<StructuredOutput>;
  getRuleSet: () => Promise<RuleSet>;
};

type DoseParametersRequest = { requestId: string; messages: ChatMessage[] };

export type DoseRecognition = { status: 'failed' } | { status: 'recognised'; event: DoseParametersEvent | null };

export type PendingDoseParameters = { requestId: string; result: Promise<DoseRecognition>; abort: () => void };

export const DOSE_PARAMETERS_GRACE_MS = 5000;

const TIMED_OUT = 'timed_out';
const FAILED: DoseRecognition = { status: 'failed' };

const logFailure = (requestId: string, error: string): void => {
  console.warn(`Grounded request ${requestId}: dose_parameters=failed error=${error}`);
};

const recogniseDoseParameters = async (
  { requestId, messages }: DoseParametersRequest,
  dependencies: DoseParameterDependencies,
  signal: AbortSignal,
): Promise<DoseRecognition> => {
  try {
    const [output, ruleSet] = await Promise.all([dependencies.extractDoseParameters(messages, signal), dependencies.getRuleSet()]);
    const userTexts = messages.filter(({ role }) => role === 'user').map(({ content }) => content);
    const extraction = parseDoseExtraction(output, userTexts);
    if (extraction) return { status: 'recognised', event: matchDoseParameters(ruleSet, extraction) };
    logFailure(requestId, 'invalid_output');
    return FAILED;
  } catch (error) {
    if (signal.aborted || error instanceof Anthropic.APIUserAbortError) return FAILED;
    logFailure(requestId, error instanceof Error ? error.name : typeof error);
    return FAILED;
  }
};

export const startDoseParameters = (request: DoseParametersRequest, dependencies: DoseParameterDependencies): PendingDoseParameters => {
  const controller = new AbortController();
  const result = recogniseDoseParameters(request, dependencies, controller.signal);
  return { requestId: request.requestId, result, abort: () => controller.abort() };
};

const settleWithin = async <T>(pending: Promise<T>, milliseconds: number): Promise<T | typeof TIMED_OUT> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), milliseconds);
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

export const awaitDoseRecognition = async (pending: PendingDoseParameters): Promise<DoseRecognition> => {
  const settled = await settleWithin(pending.result, DOSE_PARAMETERS_GRACE_MS);
  if (settled !== TIMED_OUT) return settled;
  pending.abort();
  logFailure(pending.requestId, 'timeout');
  return FAILED;
};

export const awaitDoseParameters = async (pending: PendingDoseParameters): Promise<DoseParametersEvent | null> => {
  const recognition = await awaitDoseRecognition(pending);
  return recognition.status === 'recognised' ? recognition.event : null;
};

export const describeDoseParameters = (event: DoseParametersEvent): string => {
  if (event.status === 'no_rule') return `status=no_rule reason=${event.reason}`;
  const rule = `rule=${event.ruleId ?? 'none'}`;
  return event.status === 'confirm' ? `status=confirm ${rule}` : `status=incomplete ${rule} missing=${event.missing.join(',')}`;
};
