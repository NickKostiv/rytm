import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DOSE_RESULT_COPY } from '@/features/dosing/constants';

export function PopulationNotice({ population }: { population: string }) {
  return (
    <ThemedText type="bodyCompact">
      <ThemedText type="bodyCompact" style={styles.label}>
        {DOSE_RESULT_COPY.populationLabel}
      </ThemedText>
      {` ${population}`}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  label: {
    fontWeight: 600,
  },
});
