import { MOH_RULE_SET_DATE, type RuleSet } from '@rytm/dosing';
import { useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, type TextInput, useWindowDimensions, View } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import { useReducedMotion } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, PILL_RADIUS, Spacing, TOUCH_TARGET_SIZE } from '@/constants/theme';
import { BUNDLED_RULE_SET } from '@/features/calculator/bundled-rule-set';
import { CalculatorResult } from '@/features/calculator/components/calculator-result';
import { ChoiceList } from '@/features/calculator/components/choice-list';
import { RecentRules } from '@/features/calculator/components/recent-rules';
import { RouteSection } from '@/features/calculator/components/route-section';
import { WeightSection } from '@/features/calculator/components/weight-section';
import { CALCULATOR_COPY, SCROLL_TARGET_MARGIN } from '@/features/calculator/constants';
import {
  type CalculatorFocusTarget,
  type CalculatorParams,
  useCalculatorForm,
} from '@/features/calculator/use-calculator-form';
import { DoseErrorText } from '@/features/chat/components/dose-error-text';
import { CONFIRM_MIN_WIDTH_WIDE, WIDE_LAYOUT_MIN_WIDTH } from '@/features/chat/constants';
import { useChatGutter } from '@/features/chat/use-chat-gutter';
import { PopulationNotice } from '@/features/dosing/components/population-notice';
import {
  CAPPED_NOTE_BAR_WIDTH,
  CAPPED_NOTE_PADDING,
  DOSE_RESULT_COPY,
} from '@/features/dosing/constants';
import { focusAccessibilityNode } from '@/features/dosing/focus-accessibility-node';
import { formatOrderDate } from '@/features/sources/format-order-date';
import { useTheme } from '@/hooks/use-theme';

type ViewNode = ComponentRef<typeof View>;

type FocusRequest = { target: CalculatorFocusTarget; isAnimated: boolean };

function readStringParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function CalculatorScreen() {
  const params = useLocalSearchParams();
  const calculatorParams: CalculatorParams = {
    ruleId: readStringParam(params.ruleId),
    weightKg: readStringParam(params.weightKg),
    pickRoute: readStringParam(params.pickRoute),
  };

  if (BUNDLED_RULE_SET.status !== 'loaded') {
    return (
      <ThemedView style={styles.unavailable}>
        <ThemedText>
          {BUNDLED_RULE_SET.status === 'empty'
            ? CALCULATOR_COPY.rulesEmpty
            : CALCULATOR_COPY.rulesFailed}
        </ThemedText>
      </ThemedView>
    );
  }
  return <CalculatorForm ruleSet={BUNDLED_RULE_SET.ruleSet} params={calculatorParams} />;
}

function CalculatorForm({ ruleSet, params }: { ruleSet: RuleSet; params: CalculatorParams }) {
  const theme = useTheme();
  const gutter = useChatGutter();
  const { width } = useWindowDimensions();
  const isReducedMotion = useReducedMotion();
  const form = useCalculatorForm(ruleSet, params);
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const columnRef = useRef<ViewNode>(null);
  const weightInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const indicationHeaderRef = useRef<ViewNode>(null);
  const drugHeaderRef = useRef<ViewNode>(null);
  const routeHeaderRef = useRef<ViewNode>(null);
  const weightHeaderRef = useRef<ViewNode>(null);
  const resultHeaderRef = useRef<ViewNode>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const { selection, selectedRule, errors } = form;

  useEffect(() => {
    if (focusRequest === null) return;
    const focusNodes: Record<CalculatorFocusTarget, ViewNode | null> = {
      indication: indicationHeaderRef.current,
      drug: drugHeaderRef.current,
      route: routeHeaderRef.current,
      weight: weightHeaderRef.current,
      result: resultHeaderRef.current,
    };
    const node = focusNodes[focusRequest.target];
    const column = columnRef.current;
    if (!node || !column) return;
    node.measureLayout(column, (_x, y) => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - SCROLL_TARGET_MARGIN),
        animated: focusRequest.isAnimated,
      });
    });
    focusAccessibilityNode(node);
  }, [focusRequest]);

  const handleCalculate = () => {
    const target = form.calculate();
    if (target !== null) setFocusRequest({ target, isAnimated: !isReducedMotion });
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAwareScrollView
        ref={scrollRef}
        bottomOffset={Spacing.three}
        keyboardShouldPersistTaps="handled">
        <View ref={columnRef} style={[styles.column, { paddingHorizontal: gutter }]}>
          <View style={styles.info}>
            <ThemedText type="caption" themeColor="textSecondary">
              {CALCULATOR_COPY.info}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {DOSE_RESULT_COPY.ruleSetDate(formatOrderDate(MOH_RULE_SET_DATE))}
            </ThemedText>
          </View>
          {form.isPrefillApplied && (
            <ThemedText type="caption">{CALCULATOR_COPY.prefillApplied}</ThemedText>
          )}
          {form.isPrefillRuleUnknown && (
            <DoseErrorText message={CALCULATOR_COPY.prefillUnknownRule} />
          )}
          {selection.indication === null && form.recentRules.length > 0 && (
            <RecentRules
              rules={form.recentRules}
              onPick={(rule) => {
                form.selectRecentRule(rule);
                weightInputRef.current?.focus();
              }}
            />
          )}
          <ChoiceList
            title={CALCULATOR_COPY.indicationTitle}
            headerRef={indicationHeaderRef}
            options={form.indications.map((value) => ({ value, detail: null }))}
            selectedValue={selection.indication}
            isExpanded={form.expandedList === 'indication'}
            error={errors.indication}
            onSelect={form.selectIndication}
            onExpand={() => form.expandList('indication')}
          />
          {selection.indication !== null && (
            <ChoiceList
              title={CALCULATOR_COPY.drugTitle}
              headerRef={drugHeaderRef}
              options={form.drugOptions.map(({ drug, population }) => ({
                value: drug,
                detail: population,
              }))}
              selectedValue={selection.drug}
              isExpanded={form.expandedList === 'drug'}
              error={errors.drug}
              onSelect={form.selectDrug}
              onExpand={() => form.expandList('drug')}
            />
          )}
          {selection.drug !== null && (
            <RouteSection
              headerRef={routeHeaderRef}
              routeRules={form.routeRules}
              selectedRuleId={selectedRule?.id ?? null}
              error={errors.route}
              onSelect={form.selectRoute}
            />
          )}
          {selectedRule?.population != null && (
            <View style={[styles.populationNote, { borderLeftColor: theme.borderStrong }]}>
              <PopulationNotice population={selectedRule.population} />
            </View>
          )}
          <View>
            <WeightSection
              headerRef={weightHeaderRef}
              inputRef={weightInputRef}
              weightText={form.weightText}
              error={errors.weight}
              onChange={form.changeWeight}
              onPickPreset={form.pickWeightPreset}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={handleCalculate}
            style={[
              styles.calculateButton,
              width >= WIDE_LAYOUT_MIN_WIDTH && styles.calculateButtonWide,
              { backgroundColor: theme.accent },
            ]}>
            <ThemedText themeColor="onAccent" style={styles.calculateLabel}>
              {CALCULATOR_COPY.calculate}
            </ThemedText>
          </Pressable>
          {form.result !== null && (
            <CalculatorResult result={form.result} headerRef={resultHeaderRef} />
          )}
        </View>
      </KeyboardAwareScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  unavailable: {
    flex: 1,
    padding: Spacing.three,
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
  },
  info: {
    gap: Spacing.one,
  },
  populationNote: {
    borderLeftWidth: CAPPED_NOTE_BAR_WIDTH,
    paddingLeft: CAPPED_NOTE_PADDING,
  },
  calculateButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET_SIZE,
    paddingHorizontal: Spacing.three,
    borderRadius: PILL_RADIUS,
  },
  calculateButtonWide: {
    alignSelf: 'flex-start',
    minWidth: CONFIRM_MIN_WIDTH_WIDE,
  },
  calculateLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 600,
    textAlign: 'center',
  },
});
