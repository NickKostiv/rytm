import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { COPY } from '@/features/chat/constants';

export function ChatEmptyState() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText themeColor="textSecondary" style={styles.hint}>
        {COPY.emptyHint}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  hint: {
    textAlign: 'center',
  },
});
