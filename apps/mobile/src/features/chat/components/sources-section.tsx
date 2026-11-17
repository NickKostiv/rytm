import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
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
import { isAllowedSourceUrl } from '@/features/chat/source-url';
import type { AnswerSource } from '@/features/chat/types';
import { useTheme } from '@/hooks/use-theme';

type SourcesSectionProps = {
  sources: AnswerSource[];
};

export function SourcesSection({ sources }: SourcesSectionProps) {
  if (sources.length === 0) {
    return (
      <View style={[styles.section, styles.notice]}>
        <ThemedText themeColor="textSecondary" style={styles.caption}>
          !
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={[styles.caption, styles.noticeText]}>
          {COPY.noSources}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <ThemedText accessibilityRole="header" themeColor="textSecondary" style={styles.heading}>
        {COPY.sourcesTitle}
      </ThemedText>
      {sources.map((source, index) => (
        <SourceItem key={source.id} source={source} position={index + 1} isFirst={index === 0} />
      ))}
    </View>
  );
}

type OpenState = { status: 'idle' } | { status: 'opening' } | { status: 'failed'; message: string };

type SourceItemProps = {
  source: AnswerSource;
  position: number;
  isFirst: boolean;
};

function SourceItem({ source, position, isFirst }: SourceItemProps) {
  const theme = useTheme();
  const [openState, setOpenState] = useState<OpenState>({ status: 'idle' });
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handlePress = async () => {
    if (openState.status === 'opening') return;
    if (!isAllowedSourceUrl(source.url)) {
      setOpenState({ status: 'failed', message: COPY.sourceBlocked });
      return;
    }
    setOpenState({ status: 'opening' });
    try {
      await openBrowserAsync(source.url);
      if (isMountedRef.current) setOpenState({ status: 'idle' });
    } catch {
      if (isMountedRef.current) setOpenState({ status: 'failed', message: COPY.sourceOpenFailed });
    }
  };

  const orderLine = source.page
    ? `${COPY.sourceOrder(source.orderNumber, source.orderDate)} · ${COPY.sourcePage(source.page)}`
    : COPY.sourceOrder(source.orderNumber, source.orderDate);

  return (
    <View style={!isFirst && [styles.itemDivider, { borderTopColor: theme.border }]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={COPY.sourceA11yLabel(position, source)}
        accessibilityHint={COPY.sourceA11yHint}
        onPress={() => void handlePress()}
        style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.backgroundElement }]}>
        <ThemedText style={styles.title}>
          <ThemedText themeColor="textSecondary" style={styles.title}>
            {`${position}. `}
          </ThemedText>
          {source.title}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.caption}>
          {orderLine}
        </ThemedText>
        <View style={styles.metaRow}>
          <ThemedText themeColor="accent" style={styles.host}>
            {COPY.sourceHost}
          </ThemedText>
          {!source.isValidityVerified && (
            <ThemedText
              themeColor="textSecondary"
              style={[styles.chip, { borderColor: theme.borderStrong }]}>
              {COPY.sourceUnverified}
            </ThemedText>
          )}
        </View>
      </Pressable>
      {openState.status === 'failed' && (
        <ThemedText themeColor="danger" style={styles.caption}>
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
  notice: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  noticeText: {
    flex: 1,
  },
  heading: {
    fontSize: 14,
    lineHeight: 20,
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
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 600,
  },
  caption: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 400,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  host: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 600,
  },
  chip: {
    borderWidth: BORDER_WIDTH,
    borderRadius: SOURCE_CHIP_RADIUS,
    paddingHorizontal: SOURCE_CHIP_PADDING_HORIZONTAL,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 400,
  },
});
