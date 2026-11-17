import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, useWindowDimensions } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  BORDER_WIDTH,
  COMPOSER_INPUT_PADDING_VERTICAL,
  COMPOSER_LINE_HEIGHT,
  COMPOSER_MAX_LINES,
  COPY,
  PILL_RADIUS,
  TOUCH_TARGET_SIZE,
} from '@/features/chat/constants';
import { useChatGutter } from '@/features/chat/use-chat-gutter';
import { useTheme } from '@/hooks/use-theme';

type ChatComposerProps = {
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
};

export function ChatComposer({ isStreaming, onSend, onStop }: ChatComposerProps) {
  const theme = useTheme();
  const gutter = useChatGutter();
  const { fontScale } = useWindowDimensions();
  const [text, setText] = useState('');
  const trimmedText = text.trim();
  const canSend = trimmedText !== '' && !isStreaming;
  const isButtonActive = isStreaming || canSend;

  const handleSend = () => {
    if (!canSend) return;
    Keyboard.dismiss();
    onSend(trimmedText);
    setText('');
  };

  return (
    <ThemedView
      style={[styles.container, { paddingHorizontal: gutter, borderTopColor: theme.border }]}>
      <TextInput
        style={[
          styles.input,
          {
            maxHeight: COMPOSER_MAX_LINES * COMPOSER_LINE_HEIGHT * fontScale,
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: theme.borderStrong,
          },
        ]}
        placeholder={COPY.inputPlaceholder}
        placeholderTextColor={theme.textSecondary}
        value={text}
        onChangeText={setText}
        multiline
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isStreaming ? COPY.stop : COPY.send}
        disabled={!isButtonActive}
        onPress={isStreaming ? onStop : handleSend}
        style={[
          styles.button,
          { backgroundColor: isButtonActive ? theme.accent : theme.backgroundSelected },
        ]}>
        <ThemedText
          allowFontScaling={false}
          themeColor={isButtonActive ? 'onAccent' : 'textSecondary'}
          style={isStreaming ? styles.stopGlyph : styles.sendGlyph}>
          {isStreaming ? '■' : '↑'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderTopWidth: BORDER_WIDTH,
  },
  input: {
    flex: 1,
    minHeight: TOUCH_TARGET_SIZE,
    paddingHorizontal: Spacing.three,
    paddingVertical: COMPOSER_INPUT_PADDING_VERTICAL,
    borderRadius: PILL_RADIUS,
    borderWidth: BORDER_WIDTH,
    fontSize: 16,
    lineHeight: COMPOSER_LINE_HEIGHT,
  },
  button: {
    width: TOUCH_TARGET_SIZE,
    height: TOUCH_TARGET_SIZE,
    borderRadius: TOUCH_TARGET_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendGlyph: {
    fontSize: 22,
    lineHeight: 26,
  },
  stopGlyph: {
    fontSize: 16,
    lineHeight: 20,
  },
});
