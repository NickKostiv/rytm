import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  USER_MESSAGE_MAX_WIDTH_RATIO,
  USER_MESSAGE_PADDING_VERTICAL,
  USER_MESSAGE_RADIUS,
} from '@/features/chat/constants';

type UserMessageProps = {
  content: string;
};

export function UserMessage({ content }: UserMessageProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.container}>
      <ThemedText selectable>
        {content}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-end',
    maxWidth: USER_MESSAGE_MAX_WIDTH_RATIO,
    borderRadius: USER_MESSAGE_RADIUS,
    paddingVertical: USER_MESSAGE_PADDING_VERTICAL,
    paddingHorizontal: Spacing.three,
  },
});
