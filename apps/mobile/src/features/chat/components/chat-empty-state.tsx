import { Keyboard, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { COPY } from '@/features/chat/constants';
import { useChatGutter } from '@/features/chat/use-chat-gutter';
import { useTheme } from '@/hooks/use-theme';

export function ChatEmptyState() {
  const gutter = useChatGutter();
  const theme = useTheme();
  return (
    <Pressable
      accessible={false}
      onPress={Keyboard.dismiss}
      style={[styles.container, { paddingHorizontal: gutter, backgroundColor: theme.background }]}>
      <ThemedText style={styles.title}>{COPY.emptyTitle}</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.hint}>
        {COPY.emptyHint}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  title: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: 700,
  },
  hint: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 400,
    textAlign: 'center',
  },
});
