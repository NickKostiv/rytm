import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  BORDER_WIDTH,
  COPY,
  SOURCE_CHIP_PADDING_HORIZONTAL,
  SOURCE_CHIP_RADIUS,
  SOURCE_ITEM_PADDING_VERTICAL,
  TOUCH_TARGET_SIZE,
} from '@/features/chat/constants';
import type { AnswerSource, WebSource } from '@/features/chat/types';
import { isAllowedSourceUrl, isAllowedWebSourceUrl } from '@/features/sources/source-url';
import { useSourceLink } from '@/features/sources/use-source-link';
import { useTheme } from '@/hooks/use-theme';

type SourcesSectionProps = {
  sources: AnswerSource[];
  webSources: WebSource[];
};

export function SourcesSection({ sources, webSources }: SourcesSectionProps) {
  if (sources.length === 0 && webSources.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <ThemedText
        accessibilityRole="header"
        type="caption"
        themeColor="textSecondary"
        style={styles.heading}>
        {COPY.sourcesTitle}
      </ThemedText>
      {sources.map((source, index) => (
        <SourceItem key={source.id} source={source} position={index + 1} isFirst={index === 0} />
      ))}
      {webSources.map((source, index) => (
        <WebSourceItem
          key={source.id}
          source={source}
          position={sources.length + index + 1}
          isFirst={sources.length + index === 0}
        />
      ))}
    </View>
  );
}

type SourceItemProps = {
  source: AnswerSource;
  position: number;
  isFirst: boolean;
};

function SourceItem({ source, position, isFirst }: SourceItemProps) {
  const theme = useTheme();
  const { openState, openLink } = useSourceLink({
    url: source.url,
    isAllowed: isAllowedSourceUrl,
    blockedMessage: COPY.sourceBlocked,
  });

  const orderLine = source.page
    ? `${COPY.sourceOrder(source.orderNumber, source.orderDate)} · ${COPY.sourcePage(source.page)}`
    : COPY.sourceOrder(source.orderNumber, source.orderDate);

  return (
    <View style={!isFirst && [styles.itemDivider, { borderTopColor: theme.border }]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={COPY.sourceA11yLabel(position, source)}
        accessibilityHint={COPY.sourceA11yHint}
        onPress={() => void openLink()}
        style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="bodyCompact" style={styles.title}>
          <ThemedText type="bodyCompact" themeColor="textSecondary" style={styles.title}>
            {`${position}. `}
          </ThemedText>
          {source.title}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {orderLine}
        </ThemedText>
        <View style={styles.metaRow}>
          <ThemedText type="caption" themeColor="accent" style={styles.host}>
            {COPY.sourceHost}
          </ThemedText>
          {!source.isValidityVerified && (
            <ThemedText
              type="footnote"
              themeColor="textSecondary"
              style={[styles.chip, { borderColor: theme.borderStrong }]}>
              {COPY.sourceUnverified}
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

type WebSourceItemProps = {
  source: WebSource;
  position: number;
  isFirst: boolean;
};

function WebSourceItem({ source, position, isFirst }: WebSourceItemProps) {
  const theme = useTheme();
  const { openState, openLink } = useSourceLink({
    url: source.url,
    isAllowed: isAllowedWebSourceUrl,
    blockedMessage: COPY.webSourceBlocked,
  });

  return (
    <View style={!isFirst && [styles.itemDivider, { borderTopColor: theme.border }]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={COPY.webSourceA11yLabel(position, source)}
        accessibilityHint={COPY.webSourceA11yHint}
        onPress={() => void openLink()}
        style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.backgroundElement }]}>
        <ThemedText
          type="footnote"
          style={[styles.chip, styles.webChip, { borderColor: theme.borderStrong }]}>
          {COPY.webSourceLabel}
        </ThemedText>
        <ThemedText type="bodyCompact" style={styles.title}>
          <ThemedText type="bodyCompact" themeColor="textSecondary" style={styles.title}>
            {`${position}. `}
          </ThemedText>
          {source.title}
        </ThemedText>
        <ThemedText type="caption" themeColor="accent" style={styles.host}>
          {COPY.webSourceHost(source.domain)}
        </ThemedText>
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
  section: {
    marginTop: Spacing.two,
  },
  heading: {
    fontWeight: 700,
  },
  itemDivider: {
    borderTopWidth: BORDER_WIDTH,
  },
  item: {
    minHeight: TOUCH_TARGET_SIZE,
    paddingVertical: SOURCE_ITEM_PADDING_VERTICAL,
  },
  title: {
    fontWeight: 600,
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
  webChip: {
    alignSelf: 'flex-start',
    fontWeight: 600,
  },
});
