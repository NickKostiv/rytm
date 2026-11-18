import type { Route } from '@rytm/dosing';

import type { PROGRESS_STAGES } from '@/features/chat/constants';

export type ChatRole = 'user' | 'assistant';

export type ApiMessage = {
  role: ChatRole;
  content: string;
};

export type UserMessage = {
  id: string;
  role: 'user';
  content: string;
};

export type AnswerSource = {
  id: string;
  title: string;
  orderNumber: string;
  orderDate: string;
  page?: string;
  url: string;
  isValidityVerified: boolean;
};

export type WebSource = {
  id: string;
  url: string;
  title: string;
  domain: string;
};

export type ProgressStage = (typeof PROGRESS_STAGES)[number];

export type DoseCandidate = {
  ruleId: string;
  drug: string;
  indication: string;
  route: Route;
  population: string | null;
};

export type MissingDoseParameter = 'rule' | 'weight';

export type DoseParametersPrompt =
  | { status: 'confirm'; ruleId: string; weightKg: number; candidates: DoseCandidate[] }
  | {
      status: 'incomplete';
      ruleId: string | null;
      weightKg: number | null;
      missing: MissingDoseParameter[];
      candidates: DoseCandidate[];
    };

export type DoseParameters =
  | DoseParametersPrompt
  | { status: 'no_rule'; reason: 'no_rule' | 'source_not_in_force' };

export type DoseRequest = { ruleId: string; weightKg: number };

export type AssistantMessage = {
  id: string;
  role: 'assistant';
  content: string;
  sources: AnswerSource[];
  webSources: WebSource[];
  progressStage?: ProgressStage;
  doseParameters?: DoseParameters;
} & (
  | { status: 'streaming' }
  | { status: 'done' }
  | { status: 'stopped' }
  | { status: 'error'; error: string }
);

export type ChatMessage = UserMessage | AssistantMessage;

export type ChatCitation = {
  id: string;
  orderNumber: string;
  orderDate: string;
  title: string;
  page: number;
  url: string;
  validity: string;
};

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'citations'; items: ChatCitation[] }
  | { type: 'web_sources'; items: WebSource[] }
  | { type: 'progress'; stage: ProgressStage }
  | { type: 'dose_parameters'; parameters: DoseParameters }
  | { type: 'done'; stopReason: string }
  | { type: 'error'; message: string };
