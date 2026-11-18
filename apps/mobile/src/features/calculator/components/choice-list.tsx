import { type ComponentRef, type Ref, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, TOUCH_TARGET_SIZE } from '@/constants/theme';
import { CALCULATOR_COPY, CHOICE_ROW_GAP } from '@/features/calculator/constants';
import { DoseErrorText } from '@/features/chat/components/dose-error-text';
import { EXAMPLE_ROW_PADDING_VERTICAL, EXAMPLE_ROW_RADIUS } from '@/features/chat/constants';
import { DoseCardHeader } from '@/features/dosing/components/dose-card-header';
import { focusAccessibilityNode } from '@/features/dosing/focus-accessibility-node';
import { useTheme } from '@/hooks/use-theme';

const SELECTED_MARK = '✓';

type PendingFocus = 'first_row' | 'collapsed_row' | null;

export type ChoiceOption = { value: string; detail: string | null };

type ChoiceListProps = {
  title: string;
  headerRef: Ref<ComponentRef<typeof View>>;
  options: ChoiceOption[];
  selectedValue: string | null;
  isExpanded: boolean;
  error: string | null;
  onSelect: (value: string) => void;
  onExpand: () => void;
};

export function ChoiceList({
  title,
  headerRef,
  options,
  selectedValue,
  isExpanded,
  error,
  onSelect,
  onExpand,
}: ChoiceListProps) {
  const theme = useTheme();
  const firstRowRef = useRef<ComponentRef<typeof View>>(null);
  const collapsedRowRef = useRef<ComponentRef<typeof View>>(null);
  const pendingFocusRef = useRef<PendingFocus>(null);
  const isSingleOption = options.length === 1;
  const isCollapsed = selectedValue !== null && (isSingleOption || !isExpanded);

  useEffect(() => {
    const pendingFocus = pendingFocusRef.current;
    pendingFocusRef.current = null;
    if (pendingFocus === 'first_row') focusAccessibilityNode(firstRowRef.current);
    if (pendingFocus === 'collapsed_row') focusAccessibilityNode(collapsedRowRef.current);
  }, [isCollapsed]);

  const handleExpand = () => {
    pendingFocusRef.current = 'first_row';
    onExpand();
  };

  const handleSelect = (value: string) => {
    pendingFocusRef.current = 'collapsed_row';
    onSelect(value);
  };

  const renderCollapsed = (value: string) => {
    if (isSingleOption) {
      return (
        <View style={styles.optionGroup}>
          <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={[styles.rowText, styles.selectedText]}>{value}</ThemedText>
          </View>
          <ThemedText type="caption" themeColor="textSecondary">
            {CALCULATOR_COPY.singleOption}
          </ThemedText>
        </View>
      );
    }
    return (
      <Pressable
        ref={collapsedRowRef}
        accessibilityRole="button"
        accessibilityLabel={CALCULATOR_COPY.collapsedA11y(title, value)}
        onPress={handleExpand}
        style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText style={[styles.rowText, styles.selectedText]}>{value}</ThemedText>
        <ThemedText type="caption" themeColor="accent" style={styles.selectedText}>
          {CALCULATOR_COPY.change}
        </ThemedText>
      </Pressable>
    );
  };

  return (
    <View style={styles.section}>
      <DoseCardHeader ref={headerRef} title={title} />
      {isCollapsed ? (
        renderCollapsed(selectedValue)
      ) : (
        <View accessibilityRole="radiogroup" accessibilityLabel={title} style={styles.optionGroup}>
          {options.map(({ value, detail }, index) => {
            const isSelected = value === selectedValue;
            return (
              <Pressable
                key={value}
                ref={index === 0 ? firstRowRef : undefined}
                accessibilityRole="radio"
                aria-checked={isSelected}
                onPress={() => handleSelect(value)}
                style={[
                  styles.row,
                  {
                    backgroundColor: isSelected
                      ? theme.backgroundSelected
                      : theme.backgroundElement,
                  },
                ]}>
                <View style={styles.rowText}>
                  <ThemedText style={isSelected && styles.selectedText}>{value}</ThemedText>
                  {detail !== null && (
                    <ThemedText type="caption" themeColor={isSelected ? 'text' : 'textSecondary'}>
                      {detail}
                    </ThemedText>
                  )}
                </View>
                {isSelected && <ThemedText style={styles.selectedText}>{SELECTED_MARK}</ThemedText>}
              </Pressable>
            );
          })}
        </View>
      )}
      {error !== null && <DoseErrorText message={error} />}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  optionGroup: {
    gap: CHOICE_ROW_GAP,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: TOUCH_TARGET_SIZE,
    paddingVertical: EXAMPLE_ROW_PADDING_VERTICAL,
    paddingHorizontal: Spacing.three,
    borderRadius: EXAMPLE_ROW_RADIUS,
  },
  rowText: {
    flex: 1,
  },
  selectedText: {
    fontWeight: 600,
  },
});
