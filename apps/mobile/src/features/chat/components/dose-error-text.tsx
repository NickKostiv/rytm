import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export function DoseErrorText({ message }: { message: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.row}>
      <ThemedText type="caption" themeColor="danger" style={styles.text}>
        !
      </ThemedText>
      <ThemedText type="caption" themeColor="danger" style={[styles.text, styles.message]}>
        {message}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  text: {
    fontWeight: 600,
  },
  message: {
    flex: 1,
  },
});
