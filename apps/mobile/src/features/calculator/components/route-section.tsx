import type { DosingRule } from '@rytm/dosing';
import type { ComponentRef, Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { CALCULATOR_COPY } from '@/features/calculator/constants';
import { RouteOptions } from '@/features/chat/components/route-options';
import { DoseCardHeader } from '@/features/dosing/components/dose-card-header';

type RouteSectionProps = {
  headerRef: Ref<ComponentRef<typeof View>>;
  routeRules: DosingRule[];
  selectedRuleId: string | null;
  error: string | null;
  onSelect: (ruleId: string) => void;
};

export function RouteSection({
  headerRef,
  routeRules,
  selectedRuleId,
  error,
  onSelect,
}: RouteSectionProps) {
  const isSingleRoute = routeRules.length === 1;

  return (
    <View style={styles.section}>
      <RouteOptions
        label={<DoseCardHeader ref={headerRef} title={CALCULATOR_COPY.routeTitle} />}
        candidates={routeRules.map(({ id, drug, indication, route, population }) => ({
          ruleId: id,
          drug,
          indication,
          route,
          population,
        }))}
        selectedRuleId={selectedRuleId}
        hasSingleIndication
        isDisabled={isSingleRoute}
        error={error}
        onSelect={onSelect}
      />
      {isSingleRoute && (
        <ThemedText type="caption" themeColor="textSecondary">
          {CALCULATOR_COPY.singleOption}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
});
