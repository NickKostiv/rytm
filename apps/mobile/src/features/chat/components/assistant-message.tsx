import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { MarkdownView } from '@/features/chat/components/markdown-view';
import { RetryButton } from '@/features/chat/components/retry-button';
import { SourcesSection } from '@/features/chat/components/sources-section';
import { ASSISTANT_SECTION_GAP, COPY } from '@/features/chat/constants';
import type { AssistantMessage as AssistantMessageData } from '@/features/chat/types';
import { useTheme } from '@/hooks/use-theme';

const TABLE_CELL_SEPARATOR = '|';
const CUT_OFF_MARKER = '\n\n…';

function withoutIncompleteTableRow(markdown: string): string {
  const lastLineStart = markdown.lastIndexOf('\n') + 1;
  const lastLine = markdown.slice(lastLineStart);
  return lastLine.includes(TABLE_CELL_SEPARATOR) ? markdown.slice(0, lastLineStart) : markdown;
}

function toDisplayedBody(body: string, status: AssistantMessageData['status']): string {
  if (status === 'done' || body === '') return body;
  const completeBody = withoutIncompleteTableRow(body);
  return status === 'streaming' ? completeBody : `${completeBody}${CUT_OFF_MARKER}`;
}

type AssistantMessageProps = {
  message: AssistantMessageData;
  canRetry: boolean;
  onRetry: (assistantId: string) => void;
};

export function AssistantMessage({ message, canRetry, onRetry }: AssistantMessageProps) {
  const theme = useTheme();

  if (message.status === 'streaming' && message.content === '') {
    return (
      <View accessibilityLiveRegion="polite" style={styles.waitingRow}>
        <ActivityIndicator size="small" color={theme.textSecondary} accessibilityRole="progressbar" />
        <ThemedText themeColor="textSecondary" style={styles.statusText}>
          {COPY.waiting}
        </ThemedText>
      </View>
    );
  }

  const body = toDisplayedBody(message.content, message.status);
  const retryButton = canRetry ? (
    <RetryButton
      label={COPY.retry}
      accessibilityLabel={COPY.retryA11y}
      onPress={() => onRetry(message.id)}
    />
  ) : null;

  return (
    <View style={styles.container}>
      {body !== '' && <MarkdownView markdown={body} />}
      {message.status === 'stopped' && body !== '' && (
        <View>
          <ThemedText type="caption" themeColor="textSecondary">
            {COPY.stopped}
          </ThemedText>
          {retryButton}
        </View>
      )}
      {message.status === 'stopped' && body === '' && (
        <View>
          <View accessibilityLiveRegion="polite" style={styles.errorRow}>
            <ThemedText themeColor="danger" style={styles.statusText}>
              !
            </ThemedText>
            <ThemedText themeColor="danger" style={[styles.statusText, styles.errorText]}>
              {COPY.stoppedEmpty}
            </ThemedText>
          </View>
          {retryButton}
        </View>
      )}
      {message.status === 'error' && (
        <View>
          <View accessibilityLiveRegion="polite">
            <View style={styles.errorRow}>
              <ThemedText themeColor="danger" style={[styles.statusText, styles.noAnswerText]}>
                !
              </ThemedText>
              <ThemedText
                themeColor="danger"
                style={[styles.statusText, styles.noAnswerText, styles.errorText]}>
                {COPY.noAnswer}
              </ThemedText>
            </View>
            <ThemedText type="caption" themeColor="textSecondary">
              {message.error}
            </ThemedText>
          </View>
          {retryButton}
        </View>
      )}
      {message.status === 'done' && <SourcesSection sources={message.sources} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    gap: ASSISTANT_SECTION_GAP,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: 400,
  },
  errorRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  errorText: {
    flex: 1,
  },
  noAnswerText: {
    fontWeight: 600,
  },
});
