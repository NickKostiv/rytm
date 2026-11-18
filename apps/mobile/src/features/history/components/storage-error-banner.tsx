import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { RetryButton } from '@/features/chat/components/retry-button';
import { EXAMPLE_ROW_RADIUS } from '@/features/chat/constants';

const BANNER_PADDING_VERTICAL = 12;

type StorageErrorBannerProps = {
  message: string;
  retryLabel: string;
  onRetry: () => void;
};

export function StorageErrorBanner({ message, retryLabel, onRetry }: StorageErrorBannerProps) {
  return (
    <ThemedView
      type="backgroundElement"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.container}>
      <View style={styles.messageRow}>
        <ThemedText themeColor="danger" style={styles.mark}>
          !
        </ThemedText>
        <ThemedText type="caption" style={styles.message}>
          {message}
        </ThemedText>
      </View>
      <RetryButton label={retryLabel} accessibilityLabel={retryLabel} onPress={onRetry} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: EXAMPLE_ROW_RADIUS,
    paddingVertical: BANNER_PADDING_VERTICAL,
    paddingHorizontal: Spacing.three,
  },
  messageRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  mark: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: 600,
  },
  message: {
    flex: 1,
  },
});
