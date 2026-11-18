import { type DoseVolume, toDisplayDecimal } from '@rytm/dosing';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DOSE_RESULT_COPY } from '@/features/dosing/constants';

type DoseVolumeValueProps = {
  volume: DoseVolume;
  concentrationText: string | null;
};

function getVolumeNote(volume: DoseVolume, concentrationText: string | null): string | null {
  if (volume.kind === 'no_concentration') return DOSE_RESULT_COPY.noConcentration;
  if (volume.kind === 'not_exact_decimal') return DOSE_RESULT_COPY.notExactVolume;
  return concentrationText === null ? null : DOSE_RESULT_COPY.concentration(concentrationText);
}

export function DoseVolumeValue({ volume, concentrationText }: DoseVolumeValueProps) {
  const note = getVolumeNote(volume, concentrationText);

  return (
    <View style={styles.column}>
      <ThemedText type="caption" themeColor="textSecondary">
        {DOSE_RESULT_COPY.volumeLabel}
      </ThemedText>
      {volume.kind === 'calculated' ? (
        <ThemedText type="doseValue">
          {DOSE_RESULT_COPY.millilitres(toDisplayDecimal(volume.volumeMl))}
        </ThemedText>
      ) : (
        <ThemedText style={styles.notCalculated}>{DOSE_RESULT_COPY.notCalculated}</ThemedText>
      )}
      {note !== null && (
        <ThemedText type="caption" themeColor="textSecondary">
          {note}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    flexShrink: 1,
  },
  notCalculated: {
    fontWeight: 600,
  },
});
