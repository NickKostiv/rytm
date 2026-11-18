import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { DoseErrorText } from '@/features/chat/components/dose-error-text';
import {
  BORDER_WIDTH,
  DOSE_COPY,
  TOUCH_TARGET_SIZE,
  WEIGHT_INPUT_WIDTH,
} from '@/features/chat/constants';
import { DOSE_CARD_RADIUS } from '@/features/dosing/constants';
import { useTheme } from '@/hooks/use-theme';

const EMPHASIS_BORDER_WIDTH = 2;

type WeightFieldProps = {
  value: string;
  error: string | null;
  hint: string | null;
  isEditable: boolean;
  onChange: (text: string) => void;
};

export function WeightField({ value, error, hint, isEditable, onChange }: WeightFieldProps) {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const focusColor = isFocused ? theme.accent : null;
  const emphasisColor = error === null ? focusColor : theme.danger;

  return (
    <View style={styles.section}>
      <ThemedText type="caption" themeColor="textSecondary">
        {DOSE_COPY.weightLabel}
      </ThemedText>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel={DOSE_COPY.weightA11y}
          value={value}
          onChangeText={onChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          editable={isEditable}
          keyboardType="decimal-pad"
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.background,
              borderColor: emphasisColor ?? theme.borderStrong,
              borderWidth: emphasisColor === null ? BORDER_WIDTH : EMPHASIS_BORDER_WIDTH,
            },
          ]}
        />
        <ThemedText>{DOSE_COPY.weightUnit}</ThemedText>
      </View>
      {error !== null && <DoseErrorText message={error} />}
      {error === null && hint !== null && (
        <ThemedText type="caption" themeColor="textSecondary">
          {hint}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    width: WEIGHT_INPUT_WIDTH,
    flexShrink: 1,
    minWidth: TOUCH_TARGET_SIZE,
    minHeight: TOUCH_TARGET_SIZE,
    borderRadius: DOSE_CARD_RADIUS,
    paddingHorizontal: Spacing.three,
    fontSize: 17,
    lineHeight: 26,
    fontVariant: ['tabular-nums'],
    outlineWidth: 0,
  },
});
