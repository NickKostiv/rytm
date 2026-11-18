import { type ComponentRef, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { DoseParametersCard } from '@/features/chat/components/dose-parameters-card';
import { RetryButton } from '@/features/chat/components/retry-button';
import { BORDER_WIDTH, DOSE_COPY, TOUCH_TARGET_SIZE } from '@/features/chat/constants';
import type { DoseParameters, DoseParametersPrompt } from '@/features/chat/types';
import { createDoseCard } from '@/features/chat/use-dose-cards';
import { DoseResult } from '@/features/dosing/components/dose-result';
import { DOSE_CARD_RADIUS } from '@/features/dosing/constants';
import { focusAccessibilityNode } from '@/features/dosing/focus-accessibility-node';
import { useChatSession } from '@/features/history/chat-session-provider';
import { useTheme } from '@/hooks/use-theme';

type DoseSectionProps = {
  assistantId: string;
  parameters: DoseParameters;
};

export function DoseSection({ assistantId, parameters }: DoseSectionProps) {
  if (parameters.status === 'no_rule') {
    return (
      <ThemedText type="caption" themeColor="textSecondary">
        {DOSE_COPY.noRule[parameters.reason]}
      </ThemedText>
    );
  }
  return <DoseCalculation assistantId={assistantId} prompt={parameters} />;
}

type DoseCalculationProps = {
  assistantId: string;
  prompt: DoseParametersPrompt;
};

function DoseCalculation({ assistantId, prompt }: DoseCalculationProps) {
  const theme = useTheme();
  const { doseCards, changeDoseDraft, confirmDose, retryDose, editDose } = useChatSession();
  const card = doseCards[assistantId] ?? createDoseCard(prompt);
  const headerRef = useRef<ComponentRef<typeof View>>(null);
  const isShowingDose = card.request.status === 'dose';
  const wasShowingDoseRef = useRef(isShowingDose);

  useEffect(() => {
    if (wasShowingDoseRef.current === isShowingDose) return;
    wasShowingDoseRef.current = isShowingDose;
    focusAccessibilityNode(headerRef.current);
  }, [isShowingDose]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      {card.request.status === 'dose' ? (
        <>
          <DoseResult result={card.request.result} headerRef={headerRef} />
          <RetryButton
            label={DOSE_COPY.edit}
            accessibilityLabel={DOSE_COPY.edit}
            onPress={() => editDose(assistantId)}
            style={styles.editButton}
          />
        </>
      ) : (
        <DoseParametersCard
          prompt={prompt}
          card={card}
          headerRef={headerRef}
          onChangeDraft={(draft) => changeDoseDraft(assistantId, card, draft)}
          onConfirm={() => confirmDose(assistantId, card)}
          onRetry={() => retryDose(assistantId)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    padding: Spacing.three,
    gap: Spacing.three,
    borderRadius: DOSE_CARD_RADIUS,
    borderWidth: BORDER_WIDTH,
  },
  editButton: {
    minWidth: TOUCH_TARGET_SIZE,
    maxWidth: '100%',
  },
});
