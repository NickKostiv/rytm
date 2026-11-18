import { toDisplayDecimal } from '@rytm/dosing';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BORDER_WIDTH, Spacing, TOUCH_TARGET_SIZE } from '@/constants/theme';
import { TABLE_RADIUS } from '@/features/chat/constants';
import { DOSE_RESULT_COPY } from '@/features/dosing/constants';
import type { DoseResult } from '@/features/dosing/types';
import {
  SOURCE_CHIP_PADDING_HORIZONTAL,
  SOURCE_CHIP_RADIUS,
  SOURCE_COPY,
  SOURCE_ITEM_PADDING_VERTICAL,
} from '@/features/sources/constants';
import { formatOrderDate } from '@/features/sources/format-order-date';
import { isAllowedSourceUrl } from '@/features/sources/source-url';
import { useSourceLink } from '@/features/sources/use-source-link';
import { useTheme } from '@/hooks/use-theme';

type DoseSourceLinkProps = Pick<DoseResult, 'sourceUrl' | 'sourceTitle' | 'sourceValidity'> & {
  source: DoseResult['rule']['source'];
};

export function DoseSourceLink({
  sourceUrl,
  sourceTitle,
  sourceValidity,
  source,
}: DoseSourceLinkProps) {
  const theme = useTheme();
  const { openState, openLink } = useSourceLink({
    url: sourceUrl,
    isAllowed: isAllowedSourceUrl,
    blockedMessage: SOURCE_COPY.sourceBlocked,
  });
  const isUnverified = sourceValidity === 'unknown';
  const order = SOURCE_COPY.sourceOrder(source.orderNumber, formatOrderDate(source.orderDate));
  const page = SOURCE_COPY.sourcePage(toDisplayDecimal(String(source.page)));
  const orderLine = `${order} · ${page}`;

  return (
    <View style={[styles.divider, { borderTopColor: theme.border }]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={DOSE_RESULT_COPY.sourceA11y({
          title: sourceTitle,
          orderLine,
          section: source.section,
          isUnverified,
        })}
        accessibilityHint={SOURCE_COPY.sourceA11yHint}
        onPress={() => void openLink()}
        style={({ pressed }) => [
          styles.item,
          pressed && { backgroundColor: theme.backgroundSelected },
        ]}>
        <ThemedText type="caption">{sourceTitle}</ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {orderLine}
        </ThemedText>
        <ThemedText type="caption">{source.section}</ThemedText>
        <View style={styles.metaRow}>
          <ThemedText type="caption" themeColor="accent" style={styles.host}>
            {SOURCE_COPY.sourceHost}
          </ThemedText>
          {isUnverified && (
            <ThemedText
              type="footnote"
              themeColor="textSecondary"
              style={[styles.chip, { borderColor: theme.borderStrong }]}>
              {SOURCE_COPY.sourceUnverified}
            </ThemedText>
          )}
        </View>
      </Pressable>
      {openState.status === 'failed' && (
        <ThemedText type="caption" themeColor="danger">
          {openState.message}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    borderTopWidth: BORDER_WIDTH,
  },
  item: {
    minHeight: TOUCH_TARGET_SIZE,
    paddingVertical: SOURCE_ITEM_PADDING_VERTICAL,
    borderRadius: TABLE_RADIUS,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  host: {
    fontWeight: 600,
  },
  chip: {
    borderWidth: BORDER_WIDTH,
    borderRadius: SOURCE_CHIP_RADIUS,
    paddingHorizontal: SOURCE_CHIP_PADDING_HORIZONTAL,
  },
});
