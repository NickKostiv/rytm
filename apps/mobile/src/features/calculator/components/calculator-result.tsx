import type { ComponentRef, Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BORDER_WIDTH, Spacing } from '@/constants/theme';
import type { CalculatorResult as CalculatorResultData } from '@/features/calculator/use-calculator-form';
import { DoseResult } from '@/features/dosing/components/dose-result';
import { DOSE_CARD_RADIUS } from '@/features/dosing/constants';
import { useTheme } from '@/hooks/use-theme';

const REFUSAL_PREFIX = '! ';

type CalculatorResultProps = {
  result: NonNullable<CalculatorResultData>;
  headerRef: Ref<ComponentRef<typeof View>>;
};

export function CalculatorResult({ result, headerRef }: CalculatorResultProps) {
  const theme = useTheme();

  if (result.kind === 'refused') {
    return (
      <View ref={headerRef} tabIndex={-1} accessible accessibilityRole="alert">
        <ThemedText themeColor="danger">{`${REFUSAL_PREFIX}${result.message}`}</ThemedText>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      <DoseResult result={result.result} headerRef={headerRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    gap: Spacing.three,
    borderRadius: DOSE_CARD_RADIUS,
    borderWidth: BORDER_WIDTH,
  },
});
