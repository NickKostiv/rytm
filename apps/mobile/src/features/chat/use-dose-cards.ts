import { toDisplayDecimal } from '@rytm/dosing';
import { useEffect, useRef, useState } from 'react';

import { DOSE_COPY, DOSE_REQUEST_TIMEOUT_MS } from '@/features/chat/constants';
import { parseWeightInput } from '@/features/dosing/parse-weight-input';
import { type DoseRequestOutcome, requestDose } from '@/features/chat/request-dose';
import type { DoseParametersPrompt, DoseRequest } from '@/features/chat/types';
import type { DoseResult } from '@/features/dosing/types';

type DoseCardRequest =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'dose'; result: DoseResult }
  | { status: 'rejected'; message: string }
  | { status: 'failed'; message: string; request: DoseRequest };

export type DoseDraft = { ruleId: string | null; weightText: string };

export type DoseCard = {
  draft: DoseDraft;
  routeError: string | null;
  weightError: string | null;
  request: DoseCardRequest;
};

type PendingDoseRequest = { controller: AbortController; timeout: ReturnType<typeof setTimeout> };

export type DoseCards = {
  doseCards: Record<string, DoseCard>;
  changeDoseDraft: (assistantId: string, card: DoseCard, draft: DoseDraft) => void;
  confirmDose: (assistantId: string, card: DoseCard) => void;
  retryDose: (assistantId: string) => void;
  editDose: (assistantId: string) => void;
  discardDoseCard: (assistantId: string) => void;
  discardDoseCards: () => void;
};

export function createDoseCard({ ruleId, weightKg }: DoseParametersPrompt): DoseCard {
  return {
    draft: { ruleId, weightText: weightKg === null ? '' : toDisplayDecimal(String(weightKg)) },
    routeError: null,
    weightError: null,
    request: { status: 'idle' },
  };
}

function applyDoseOutcome(
  card: DoseCard,
  outcome: DoseRequestOutcome,
  request: DoseRequest,
): DoseCard {
  switch (outcome.kind) {
    case 'dose':
      return { ...card, request: { status: 'dose', result: outcome.result } };
    case 'rejected':
      return outcome.reason === 'invalid_weight'
        ? { ...card, weightError: DOSE_COPY.rejection.invalid_weight, request: { status: 'idle' } }
        : {
            ...card,
            request: { status: 'rejected', message: DOSE_COPY.rejection[outcome.reason] },
          };
    case 'failed':
      return { ...card, request: { status: 'failed', message: outcome.message, request } };
  }
}

export function useDoseCards(): DoseCards {
  const [doseCards, setDoseCards] = useState<Record<string, DoseCard>>({});
  const cardsRef = useRef(doseCards);
  const pendingRef = useRef(new Map<string, PendingDoseRequest>());
  const isMountedRef = useRef(false);

  const commitCards = (next: Record<string, DoseCard>) => {
    cardsRef.current = next;
    if (isMountedRef.current) setDoseCards(next);
  };

  const setCard = (assistantId: string, card: DoseCard) => {
    commitCards({ ...cardsRef.current, [assistantId]: card });
  };

  const cancelRequest = (assistantId: string) => {
    const pending = pendingRef.current.get(assistantId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pending.controller.abort();
    pendingRef.current.delete(assistantId);
  };

  const submit = async (assistantId: string, card: DoseCard, request: DoseRequest) => {
    if (pendingRef.current.has(assistantId)) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOSE_REQUEST_TIMEOUT_MS);
    pendingRef.current.set(assistantId, { controller, timeout });
    setCard(assistantId, {
      ...card,
      routeError: null,
      weightError: null,
      request: { status: 'submitting' },
    });
    const outcome = await requestDose(request, controller.signal);
    if (pendingRef.current.get(assistantId)?.controller !== controller) return;
    clearTimeout(timeout);
    pendingRef.current.delete(assistantId);
    const current = cardsRef.current[assistantId];
    if (current) setCard(assistantId, applyDoseOutcome(current, outcome, request));
  };

  const confirmDose = (assistantId: string, card: DoseCard) => {
    if (pendingRef.current.has(assistantId)) return;
    const { ruleId, weightText } = card.draft;
    const { weightKg, error } = parseWeightInput(weightText);
    if (ruleId === null || weightKg === null) {
      setCard(assistantId, {
        ...card,
        routeError: ruleId === null ? DOSE_COPY.routeMissing : null,
        weightError: error,
        request: { status: 'idle' },
      });
      return;
    }
    void submit(assistantId, card, { ruleId, weightKg });
  };

  const retryDose = (assistantId: string) => {
    const card = cardsRef.current[assistantId];
    if (card?.request.status !== 'failed') return;
    void submit(assistantId, card, card.request.request);
  };

  const changeDoseDraft = (assistantId: string, card: DoseCard, draft: DoseDraft) => {
    if (pendingRef.current.has(assistantId)) return;
    setCard(assistantId, {
      draft,
      routeError: draft.ruleId === card.draft.ruleId ? card.routeError : null,
      weightError: draft.weightText === card.draft.weightText ? card.weightError : null,
      request: { status: 'idle' },
    });
  };

  const editDose = (assistantId: string) => {
    const card = cardsRef.current[assistantId];
    if (card?.request.status !== 'dose') return;
    setCard(assistantId, { ...card, request: { status: 'idle' } });
  };

  const discardDoseCard = (assistantId: string) => {
    cancelRequest(assistantId);
    const { [assistantId]: discarded, ...rest } = cardsRef.current;
    if (discarded) commitCards(rest);
  };

  const discardDoseCards = () => {
    [...pendingRef.current.keys()].forEach(cancelRequest);
    commitCards({});
  };

  useEffect(() => {
    const pending = pendingRef.current;
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      pending.forEach(({ controller, timeout }) => {
        clearTimeout(timeout);
        controller.abort();
      });
      pending.clear();
    };
  }, []);

  return {
    doseCards,
    changeDoseDraft,
    confirmDose,
    retryDose,
    editDose,
    discardDoseCard,
    discardDoseCards,
  };
}
