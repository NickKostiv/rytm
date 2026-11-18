import type { ComponentRef, Ref } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { DoseCardHeader } from '@/features/dosing/components/dose-card-header';
import { DoseErrorText } from '@/features/chat/components/dose-error-text';
import { PopulationNotice } from '@/features/dosing/components/population-notice';
import { RetryButton } from '@/features/chat/components/retry-button';
import { RouteOptions } from '@/features/chat/components/route-options';
import { WeightField } from '@/features/chat/components/weight-field';
import {
  CONFIRM_MIN_WIDTH_WIDE,
  COPY,
  DOSE_COPY,
  PILL_RADIUS,
  TOUCH_TARGET_SIZE,
  WIDE_LAYOUT_MIN_WIDTH,
} from '@/features/chat/constants';
import type { DoseParametersPrompt } from '@/features/chat/types';
import type { DoseCard, DoseDraft } from '@/features/chat/use-dose-cards';
import { useTheme } from '@/hooks/use-theme';

type DoseParametersCardProps = {
  prompt: DoseParametersPrompt;
  card: DoseCard;
  headerRef: Ref<ComponentRef<typeof View>>;
  onChangeDraft: (draft: DoseDraft) => void;
  onConfirm: () => void;
  onRetry: () => void;
};

export function DoseParametersCard({
  prompt,
  card,
  headerRef,
  onChangeDraft,
  onConfirm,
  onRetry,
}: DoseParametersCardProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { candidates } = prompt;
  const { draft, request } = card;
  const isSubmitting = request.status === 'submitting';
  const [firstCandidate] = candidates;
  const hasSingleIndication = candidates.every(
    ({ indication }) => indication === firstCandidate.indication,
  );
  const selected = candidates.find(({ ruleId }) => ruleId === draft.ruleId);

  return (
    <>
      <DoseCardHeader ref={headerRef} title={DOSE_COPY.cardTitle} />
      <ThemedText type="caption" themeColor="textSecondary">
        {prompt.status === 'confirm'
          ? DOSE_COPY.confirmHint
          : DOSE_COPY.missingHint(prompt.missing)}
      </ThemedText>
      <ThemedText type="answerSubheading">
        {hasSingleIndication
          ? `${firstCandidate.drug} · ${firstCandidate.indication}`
          : firstCandidate.drug}
      </ThemedText>
      <RouteOptions
        label={
          <ThemedText type="caption" themeColor="textSecondary">
            {DOSE_COPY.routeLabel}
          </ThemedText>
        }
        candidates={candidates}
        selectedRuleId={draft.ruleId}
        hasSingleIndication={hasSingleIndication}
        isDisabled={isSubmitting}
        error={card.routeError}
        onSelect={(ruleId) => onChangeDraft({ ...draft, ruleId })}
      />
      {selected?.population != null && <PopulationNotice population={selected.population} />}
      <WeightField
        label={
          <ThemedText type="caption" themeColor="textSecondary">
            {DOSE_COPY.weightLabel}
          </ThemedText>
        }
        value={draft.weightText}
        error={card.weightError}
        hint={draft.weightText.trim() === '' ? DOSE_COPY.emptyWeightHint : null}
        isEditable={!isSubmitting}
        onChange={(weightText) => onChangeDraft({ ...draft, weightText })}
      />
      {(request.status === 'rejected' || request.status === 'failed') && (
        <View>
          <DoseErrorText message={request.message} />
          {request.status === 'failed' && (
            <RetryButton
              label={COPY.retry}
              accessibilityLabel={DOSE_COPY.retryA11y}
              onPress={onRetry}
              style={styles.cardButton}
            />
          )}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isSubmitting ? DOSE_COPY.submitting : DOSE_COPY.confirm}
        aria-disabled={isSubmitting}
        aria-busy={isSubmitting}
        disabled={isSubmitting}
        onPress={onConfirm}
        style={[
          styles.confirmButton,
          width >= WIDE_LAYOUT_MIN_WIDTH && styles.confirmButtonWide,
          { backgroundColor: theme.accent },
        ]}>
        {isSubmitting && <ActivityIndicator size="small" color={theme.onAccent} />}
        <ThemedText themeColor="onAccent" style={styles.confirmLabel}>
          {isSubmitting ? DOSE_COPY.submitting : DOSE_COPY.confirm}
        </ThemedText>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: TOUCH_TARGET_SIZE,
    paddingHorizontal: Spacing.three,
    borderRadius: PILL_RADIUS,
  },
  confirmButtonWide: {
    alignSelf: 'flex-start',
    minWidth: CONFIRM_MIN_WIDTH_WIDE,
  },
  confirmLabel: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 600,
    textAlign: 'center',
  },
  cardButton: {
    minWidth: TOUCH_TARGET_SIZE,
    maxWidth: '100%',
  },
});
