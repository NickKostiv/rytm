import type { ComponentRef } from 'react';
import { AccessibilityInfo, Platform, type View } from 'react-native';

export function focusAccessibilityNode(node: ComponentRef<typeof View> | null) {
  if (!node) return;
  if (Platform.OS === 'web') {
    node.focus();
  } else {
    AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
  }
}
