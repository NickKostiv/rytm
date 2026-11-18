import { type DosingRule, ROUTE_LABELS } from '@rytm/dosing';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, TOUCH_TARGET_SIZE } from '@/constants/theme';
import { CALCULATOR_COPY, CHOICE_ROW_GAP } from '@/features/calculator/constants';
import { EXAMPLE_ROW_PADDING_VERTICAL, EXAMPLE_ROW_RADIUS } from '@/features/chat/constants';
import { DoseCardHeader } from '@/features/dosing/components/dose-card-header';
import { formatRouteShortLabel } from '@/features/dosing/format-route-label';
import { useTheme } from '@/hooks/use-theme';

type RecentRulesProps = {
  rules: DosingRule[];
  onPick: (rule: DosingRule) => void;
};

export function RecentRules({ rules, onPick }: RecentRulesProps) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <DoseCardHeader ref={null} title={CALCULATOR_COPY.recentTitle} />
      <View style={styles.rows}>
        {rules.map((rule) => {
          const { spoken } = ROUTE_LABELS[rule.route];
          return (
            <Pressable
              key={rule.id}
              accessibilityRole="button"
              accessibilityLabel={CALCULATOR_COPY.recentA11y(rule.drug, rule.indication, spoken)}
              onPress={() => onPick(rule)}
              style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.title}>{`${rule.drug} · ${formatRouteShortLabel(rule.route)}`}</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {rule.indication}
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
    gap: Spacing.two,
  },
  rows: {
    gap: CHOICE_ROW_GAP,
  },
  row: {
    minHeight: TOUCH_TARGET_SIZE,
    justifyContent: 'center',
    paddingVertical: EXAMPLE_ROW_PADDING_VERTICAL,
    paddingHorizontal: Spacing.three,
    borderRadius: EXAMPLE_ROW_RADIUS,
  },
  title: {
    fontWeight: 600,
  },
});
