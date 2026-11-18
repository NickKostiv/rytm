import { ROUTE_LABELS } from '@rytm/dosing';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { DoseErrorText } from '@/features/chat/components/dose-error-text';
import {
  BORDER_WIDTH,
  DOSE_COPY,
  PILL_RADIUS,
  ROUTE_OPTION_MIN_WIDTH,
  TOUCH_TARGET_SIZE,
} from '@/features/chat/constants';
import type { DoseCandidate } from '@/features/chat/types';
import { useTheme } from '@/hooks/use-theme';

const SELECTED_PREFIX = '✓ ';

type RouteOptionsProps = {
  candidates: DoseCandidate[];
  selectedRuleId: string | null;
  hasSingleIndication: boolean;
  isDisabled: boolean;
  error: string | null;
  onSelect: (ruleId: string) => void;
};

export function RouteOptions({
  candidates,
  selectedRuleId,
  hasSingleIndication,
  isDisabled,
  error,
  onSelect,
}: RouteOptionsProps) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <ThemedText type="caption" themeColor="textSecondary">
        {DOSE_COPY.routeLabel}
      </ThemedText>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={DOSE_COPY.routeLabel}
        style={styles.options}>
        {candidates.map(({ ruleId, indication, route }) => {
          const isSelected = ruleId === selectedRuleId;
          const { short, spoken } = ROUTE_LABELS[route];
          const label = hasSingleIndication ? short : `${indication} · ${short}`;
          return (
            <Pressable
              key={ruleId}
              accessibilityRole="radio"
              accessibilityLabel={hasSingleIndication ? spoken : `${indication}, ${spoken}`}
              accessibilityState={{ checked: isSelected, disabled: isDisabled }}
              disabled={isDisabled}
              onPress={() => onSelect(ruleId)}
              style={[
                styles.option,
                isSelected
                  ? { backgroundColor: theme.accent, borderColor: theme.accent }
                  : { borderColor: theme.borderStrong },
              ]}>
              <ThemedText
                themeColor={isSelected ? 'onAccent' : 'text'}
                style={[styles.label, isSelected && styles.selectedLabel]}>
                {isSelected ? `${SELECTED_PREFIX}${label}` : label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {error !== null && <DoseErrorText message={error} />}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  option: {
    minHeight: TOUCH_TARGET_SIZE,
    minWidth: ROUTE_OPTION_MIN_WIDTH,
    maxWidth: '100%',
    paddingHorizontal: Spacing.three,
    borderRadius: PILL_RADIUS,
    borderWidth: BORDER_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    textAlign: 'center',
  },
  selectedLabel: {
    fontWeight: 600,
  },
});
