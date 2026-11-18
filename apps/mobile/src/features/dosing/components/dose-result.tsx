import { toDisplayDecimal } from '@rytm/dosing';
import type { ComponentRef, Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { DoseCardHeader } from '@/features/dosing/components/dose-card-header';
import { DoseSourceLink } from '@/features/dosing/components/dose-source-link';
import { DoseVolumeValue } from '@/features/dosing/components/dose-volume-value';
import { PopulationNotice } from '@/features/dosing/components/population-notice';
import {
  CAPPED_NOTE_BAR_WIDTH,
  CAPPED_NOTE_PADDING,
  DOSE_RESULT_COPY,
} from '@/features/dosing/constants';
import { formatRouteShortLabel } from '@/features/dosing/format-route-label';
import type { DoseResult as DoseResultData } from '@/features/dosing/types';
import { formatOrderDate } from '@/features/sources/format-order-date';
import { useTheme } from '@/hooks/use-theme';

type DoseResultProps = {
  result: DoseResultData;
  headerRef: Ref<ComponentRef<typeof View>>;
};

function toDisplayNumber(value: number): string {
  return toDisplayDecimal(String(value));
}

export function DoseResult({ result, headerRef }: DoseResultProps) {
  const theme = useTheme();
  const { rule, volume } = result;
  const doseText = toDisplayDecimal(result.doseMg);
  const volumeText = volume.kind === 'calculated' ? toDisplayDecimal(volume.volumeMl) : null;
  const maxDoseText = rule.maxSingleDoseMg === null ? null : toDisplayNumber(rule.maxSingleDoseMg);

  return (
    <>
      <DoseCardHeader ref={headerRef} title={DOSE_RESULT_COPY.resultTitle} />
      <ThemedText type="bodyCompact" style={styles.summary}>
        {DOSE_RESULT_COPY.summary(
          [rule.drug, rule.indication, formatRouteShortLabel(rule.route)],
          toDisplayNumber(result.weightKg),
        )}
      </ThemedText>
      <View
        accessible
        accessibilityLabel={DOSE_RESULT_COPY.doseA11y(doseText, volumeText)}
        style={styles.values}>
        <View>
          <ThemedText type="caption" themeColor="textSecondary">
            {DOSE_RESULT_COPY.doseLabel}
          </ThemedText>
          <ThemedText type="doseValue">{DOSE_RESULT_COPY.milligrams(doseText)}</ThemedText>
        </View>
        <DoseVolumeValue volume={volume} concentrationText={rule.concentrationText} />
      </View>
      {result.isCappedAtMaximum && maxDoseText !== null && (
        <View style={[styles.cappedNote, { borderLeftColor: theme.borderStrong }]}>
          <ThemedText type="bodyCompact" style={styles.cappedText}>
            {DOSE_RESULT_COPY.cappedAt(maxDoseText)}
          </ThemedText>
        </View>
      )}
      {!result.isCappedAtMaximum && (
        <ThemedText type="caption" themeColor="textSecondary">
          {maxDoseText === null
            ? DOSE_RESULT_COPY.noMaxDose
            : DOSE_RESULT_COPY.maxDose(maxDoseText)}
        </ThemedText>
      )}
      {rule.repeat !== null && (
        <ThemedText type="caption" themeColor="textSecondary">
          {DOSE_RESULT_COPY.repeat(
            toDisplayNumber(rule.repeat.minMinutes),
            toDisplayNumber(rule.repeat.maxMinutes),
          )}
        </ThemedText>
      )}
      <View>
        <ThemedText type="caption" themeColor="textSecondary">
          {DOSE_RESULT_COPY.formulaLabel}
        </ThemedText>
        {result.formulaSteps.map((step, index) => (
          <ThemedText key={`${index}-${step}`} type="table">
            {step}
          </ThemedText>
        ))}
      </View>
      {rule.population !== null && <PopulationNotice population={rule.population} />}
      <DoseSourceLink
        sourceUrl={result.sourceUrl}
        sourceTitle={result.sourceTitle}
        sourceValidity={result.sourceValidity}
        source={rule.source}
      />
      <ThemedText type="caption" themeColor="textSecondary">
        {DOSE_RESULT_COPY.ruleSetDate(formatOrderDate(result.ruleSetDate))}
      </ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  summary: {
    fontWeight: 600,
  },
  values: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.four,
  },
  cappedNote: {
    borderLeftWidth: CAPPED_NOTE_BAR_WIDTH,
    paddingLeft: CAPPED_NOTE_PADDING,
  },
  cappedText: {
    fontWeight: 700,
  },
});
