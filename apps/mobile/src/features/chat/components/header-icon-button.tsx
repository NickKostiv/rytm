import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { HEADER_ICON_SIZE, TOUCH_TARGET_SIZE } from '@/features/chat/constants';
import { useTheme } from '@/hooks/use-theme';

type HeaderIconButtonProps = {
  symbol: SymbolViewProps['name'];
  accessibilityLabel: string;
  isDisabled?: boolean;
  onPress: () => void;
};

export function HeaderIconButton({
  symbol,
  accessibilityLabel,
  isDisabled = false,
  onPress,
}: HeaderIconButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={styles.button}>
      <SymbolView
        name={symbol}
        size={HEADER_ICON_SIZE}
        tintColor={isDisabled ? theme.borderStrong : theme.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: TOUCH_TARGET_SIZE,
    height: TOUCH_TARGET_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: TOUCH_TARGET_SIZE / 2,
  },
});
