import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  BORDER_WIDTH,
  PILL_RADIUS,
  RETRY_MIN_WIDTH,
  TOUCH_TARGET_SIZE,
} from '@/features/chat/constants';
import { useTheme } from '@/hooks/use-theme';

type RetryButtonProps = {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
};

export function RetryButton({ label, accessibilityLabel, onPress }: RetryButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.button, { borderColor: theme.borderStrong }]}>
      <ThemedText style={styles.label}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET_SIZE,
    minWidth: RETRY_MIN_WIDTH,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: PILL_RADIUS,
    borderWidth: BORDER_WIDTH,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 600,
  },
});
