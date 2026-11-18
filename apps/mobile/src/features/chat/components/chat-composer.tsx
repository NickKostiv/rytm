import { useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  BORDER_WIDTH,
  COMPOSER_ACTION_SIZE,
  COMPOSER_FIELD_MIN_HEIGHT,
  COMPOSER_FIELD_RADIUS,
  COMPOSER_INPUT_PADDING_VERTICAL,
  COMPOSER_LINE_HEIGHT,
  COMPOSER_MAX_LINES,
  COPY,
  TOUCH_TARGET_SIZE,
} from '@/features/chat/constants';
import { useChatGutter } from '@/features/chat/use-chat-gutter';
import { useTheme } from '@/hooks/use-theme';

const ZERO_WIDTH_SPACE = '\u200B';
const INPUT_PADDING_TOTAL = COMPOSER_INPUT_PADDING_VERTICAL * 2;
const IS_WEB = Platform.OS === 'web';
const IME_COMPOSING_KEY_CODE = 229;
const INPUT_MIN_HEIGHT = COMPOSER_FIELD_MIN_HEIGHT - BORDER_WIDTH * 2;

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
  const [isFocused, setIsFocused] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const trimmedText = text.trim();
  const canSend = trimmedText !== '' && !isStreaming;
  const isButtonActive = isStreaming || canSend;
  const maxInputHeight = COMPOSER_MAX_LINES * COMPOSER_LINE_HEIGHT * fontScale + INPUT_PADDING_TOTAL;
  const inputHeightStyle = IS_WEB
    ? { height: Math.min(maxInputHeight, Math.max(INPUT_MIN_HEIGHT, measuredHeight)) }
    : { minHeight: INPUT_MIN_HEIGHT, maxHeight: maxInputHeight };

  const handleSend = () => {
    if (!canSend) return;
    if (!IS_WEB) Keyboard.dismiss();
    onSend(trimmedText);
    setText('');
  };

  return (
    <View style={[styles.container, { paddingHorizontal: gutter }]}>
      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: isFocused ? theme.accent : theme.borderStrong,
          },
        ]}>
        <View style={styles.inputWrapper}>
          {IS_WEB && (
            <Text
              aria-hidden
              onLayout={(event) => setMeasuredHeight(event.nativeEvent.layout.height)}
              style={styles.mirror}>
              {text + ZERO_WIDTH_SPACE}
            </Text>
          )}
          <TextInput
            accessibilityLabel={COPY.inputA11yLabel}
            style={[styles.input, inputHeightStyle, { color: theme.text }]}
            placeholder={COPY.inputPlaceholder}
            placeholderTextColor={theme.textSecondary}
            value={text}
            onChangeText={setText}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyPress={(event) => {
              const { nativeEvent } = event;
              if (!IS_WEB || nativeEvent.key !== 'Enter') return;
              if ('shiftKey' in nativeEvent && nativeEvent.shiftKey) return;
              if ('isComposing' in nativeEvent && nativeEvent.isComposing) return;
              if ('keyCode' in nativeEvent && nativeEvent.keyCode === IME_COMPOSING_KEY_CODE) return;
              event.preventDefault();
              handleSend();
            }}
            rows={IS_WEB ? 1 : undefined}
            multiline
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isStreaming ? COPY.stop : COPY.send}
          disabled={!isButtonActive}
          onPress={isStreaming ? onStop : handleSend}
          style={styles.actionTouchArea}>
          <View
            style={[
              styles.actionCircle,
              { backgroundColor: isButtonActive ? theme.accent : theme.backgroundSelected },
            ]}>
            <ThemedText
              allowFontScaling={false}
              themeColor={isButtonActive ? 'onAccent' : 'textSecondary'}
              style={isStreaming ? styles.stopGlyph : styles.sendGlyph}>
              {isStreaming ? '■' : '↑'}
            </ThemedText>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const inputTextStyle = {
  fontSize: 16,
  lineHeight: COMPOSER_LINE_HEIGHT,
  paddingLeft: Spacing.three,
  paddingVertical: COMPOSER_INPUT_PADDING_VERTICAL,
} as const;

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.two,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: COMPOSER_FIELD_MIN_HEIGHT,
    borderRadius: COMPOSER_FIELD_RADIUS,
    borderWidth: BORDER_WIDTH,
  },
  inputWrapper: {
    flex: 1,
  },
  input: {
    ...inputTextStyle,
    outlineWidth: 0,
  },
  mirror: {
    ...inputTextStyle,
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  actionTouchArea: {
    width: TOUCH_TARGET_SIZE,
    height: TOUCH_TARGET_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCircle: {
    width: COMPOSER_ACTION_SIZE,
    height: COMPOSER_ACTION_SIZE,
    borderRadius: COMPOSER_ACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendGlyph: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: 500,
  },
  stopGlyph: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: 500,
  },
});
