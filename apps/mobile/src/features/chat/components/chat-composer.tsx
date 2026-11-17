import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { COMPOSER_MAX_HEIGHT, COPY, USER_BUBBLE_COLOR } from '@/features/chat/constants';
import { useTheme } from '@/hooks/use-theme';

type ChatComposerProps = {
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
};

export function ChatComposer({ isStreaming, onSend, onStop }: ChatComposerProps) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const trimmedText = text.trim();
  const canSend = trimmedText !== '' && !isStreaming;

  const handleSend = () => {
    if (!canSend) return;
    onSend(trimmedText);
    setText('');
  };

  return (
    <ThemedView style={styles.container}>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        placeholder={COPY.inputPlaceholder}
        placeholderTextColor={theme.textSecondary}
        value={text}
        onChangeText={setText}
        multiline
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isStreaming ? COPY.stop : COPY.send}
        disabled={!isStreaming && !canSend}
        onPress={isStreaming ? onStop : handleSend}
        style={[styles.button, !isStreaming && !canSend && styles.disabledButton]}>
        <ThemedText style={styles.buttonLabel}>{isStreaming ? '■' : '↑'}</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  input: {
    flex: 1,
    maxHeight: COMPOSER_MAX_HEIGHT,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
    fontSize: 16,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: USER_BUBBLE_COLOR,
  },
  disabledButton: {
    opacity: 0.4,
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 24,
  },
});
