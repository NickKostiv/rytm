import { ROUTE_LABELS } from '@rytm/dosing';
import type { ReactNode } from 'react';
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
import { formatRouteShortLabel } from '@/features/dosing/format-route-label';
import { useTheme } from '@/hooks/use-theme';

const SELECTED_PREFIX = '✓ ';

type RouteOptionsProps = {
  label: ReactNode;
  candidates: DoseCandidate[];
  selectedRuleId: string | null;
  hasSingleIndication: boolean;
  isDisabled: boolean;
  error: string | null;
  onSelect: (ruleId: string) => void;
};

export function RouteOptions({
  label,
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
      {label}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={DOSE_COPY.routeLabel}
        style={styles.options}>
        {candidates.map(({ ruleId, indication, route }) => {
          const isSelected = ruleId === selectedRuleId;
          const { spoken } = ROUTE_LABELS[route];
          const short = formatRouteShortLabel(route);
          const label = hasSingleIndication ? short : `${indication} · ${short}`;
          return (
            <Pressable
              key={ruleId}
              accessibilityRole="radio"
              accessibilityLabel={hasSingleIndication ? spoken : `${indication}, ${spoken}`}
              aria-checked={isSelected}
              aria-disabled={isDisabled}
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
