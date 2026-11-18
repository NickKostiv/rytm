import type { ComponentRef, Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

type DoseCardHeaderProps = {
  title: string;
  ref: Ref<ComponentRef<typeof View>>;
};

export function DoseCardHeader({ title, ref }: DoseCardHeaderProps) {
  return (
    <View ref={ref} tabIndex={-1} accessible accessibilityRole="header">
      <ThemedText type="caption" themeColor="textSecondary" style={styles.title}>
        {title}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontWeight: 700,
  },
});
