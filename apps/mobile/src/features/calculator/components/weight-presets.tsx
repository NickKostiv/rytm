import { toDisplayDecimal } from '@rytm/dosing';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BORDER_WIDTH, PILL_RADIUS, Spacing, TOUCH_TARGET_SIZE } from '@/constants/theme';
import {
  CALCULATOR_COPY,
  WEIGHT_CHIP_MIN_WIDTH,
  WEIGHT_CHIP_PADDING_HORIZONTAL,
  WEIGHT_PRESETS_KG,
  WEIGHT_PRESETS_OFFSET,
} from '@/features/calculator/constants';
import { useTheme } from '@/hooks/use-theme';

const SELECTED_PREFIX = '✓ ';

type WeightPresetsProps = {
  selectedWeightKg: number | null;
  onPick: (weightKg: number) => void;
};

export function WeightPresets({ selectedWeightKg, onPick }: WeightPresetsProps) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <ThemedText type="caption" themeColor="textSecondary">
        {CALCULATOR_COPY.presetsTitle}
      </ThemedText>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={CALCULATOR_COPY.presetsA11y}
        style={styles.chips}>
        {WEIGHT_PRESETS_KG.map((weightKg) => {
          const isSelected = weightKg === selectedWeightKg;
          const label = toDisplayDecimal(String(weightKg));
          return (
            <Pressable
              key={weightKg}
              accessibilityRole="radio"
              accessibilityLabel={CALCULATOR_COPY.presetA11y(label)}
              aria-checked={isSelected}
              onPress={() => onPick(weightKg)}
              style={[
                styles.chip,
                isSelected
                  ? { backgroundColor: theme.accent, borderColor: theme.accent }
                  : { borderColor: theme.borderStrong },
              ]}>
              <ThemedText themeColor={isSelected ? 'onAccent' : 'text'} style={styles.chipLabel}>
                {isSelected ? `${SELECTED_PREFIX}${label}` : label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: WEIGHT_PRESETS_OFFSET,
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    minHeight: TOUCH_TARGET_SIZE,
    minWidth: WEIGHT_CHIP_MIN_WIDTH,
    paddingHorizontal: WEIGHT_CHIP_PADDING_HORIZONTAL,
    borderRadius: PILL_RADIUS,
    borderWidth: BORDER_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: {
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
});
