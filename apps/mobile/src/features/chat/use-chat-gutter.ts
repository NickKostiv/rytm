import { useSyncExternalStore } from 'react';
import { Dimensions } from 'react-native';

import { NARROW_GUTTER, WIDE_GUTTER, WIDE_LAYOUT_MIN_WIDTH } from '@/features/chat/constants';

function subscribeToWindowSize(onChange: () => void): () => void {
  const subscription = Dimensions.addEventListener('change', onChange);
  return () => subscription.remove();
}

function getGutter(): number {
  return Dimensions.get('window').width >= WIDE_LAYOUT_MIN_WIDTH ? WIDE_GUTTER : NARROW_GUTTER;
}

function getServerGutter(): number {
  return NARROW_GUTTER;
}

export function useChatGutter(): number {
  return useSyncExternalStore(subscribeToWindowSize, getGutter, getServerGutter);
}
