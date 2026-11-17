import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { FlagBlock, type FlagVariant } from '@/features/chat/components/flag-block';
import { MarkdownView } from '@/features/chat/components/markdown-view';
import { SourcesSection } from '@/features/chat/components/sources-section';
import {
  ASSISTANT_SECTION_GAP,
  BORDER_WIDTH,
  PILL_RADIUS,
  COPY,
  RETRY_MIN_WIDTH,
  TOUCH_TARGET_SIZE,
} from '@/features/chat/constants';
import { parseAnswerFlag } from '@/features/chat/parse-answer-flag';
import type { AssistantMessage as AssistantMessageData } from '@/features/chat/types';
import { useTheme } from '@/hooks/use-theme';

type AnswerDisplay = {
  flag: { variant: FlagVariant; explanation?: string } | null;
  body: string;
};

function resolveAnswerDisplay(message: AssistantMessageData): AnswerDisplay {
  if (message.flag) {
    return {
      flag: { variant: message.flag.level, explanation: message.flag.explanation },
      body: message.content,
    };
  }
  const parsed = parseAnswerFlag(message.content);
  const isLive = message.status === 'streaming' || message.status === 'done';

  if (parsed.status === 'parsed') {
    return { flag: { variant: parsed.flag.level, explanation: parsed.flag.explanation }, body: parsed.body };
  }
  if (parsed.status === 'pending' && message.status === 'streaming') {
    return { flag: { variant: 'pending' }, body: '' };
  }
  return { flag: isLive ? { variant: 'unavailable' } : null, body: message.content };
}

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

  if (message.status === 'streaming' && message.content === '' && !message.flag) {
    return (
      <View accessibilityLiveRegion="polite" style={styles.waitingRow}>
        <ActivityIndicator size="small" color={theme.textSecondary} accessibilityRole="progressbar" />
        <ThemedText themeColor="textSecondary" style={styles.statusText}>
          {COPY.waiting}
        </ThemedText>
      </View>
    );
  }

  const { flag, body: parsedBody } = resolveAnswerDisplay(message);
  const body = toDisplayedBody(parsedBody, message.status);
  const retryButton = canRetry ? <RetryButton onPress={() => onRetry(message.id)} /> : null;

  return (
    <View style={styles.container}>
      {flag && <FlagBlock variant={flag.variant} explanation={flag.explanation} />}
      {body !== '' && <MarkdownView markdown={body} />}
      {message.status === 'stopped' && (
        <View>
          <ThemedText themeColor="textSecondary" style={styles.caption}>
            {COPY.stopped}
          </ThemedText>
          {retryButton}
        </View>
      )}
      {message.status === 'error' && (
        <View>
          <View accessibilityLiveRegion="polite" style={styles.errorRow}>
            <ThemedText themeColor="danger" style={styles.statusText}>
              !
            </ThemedText>
            <ThemedText themeColor="danger" style={[styles.statusText, styles.errorText]}>
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

function RetryButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={COPY.retryA11y}
      onPress={onPress}
      style={[styles.retryButton, { borderColor: theme.borderStrong }]}>
      <ThemedText style={styles.retryLabel}>{COPY.retry}</ThemedText>
    </Pressable>
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
  caption: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 400,
  },
  errorRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  errorText: {
    flex: 1,
  },
  retryButton: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET_SIZE,
    minWidth: RETRY_MIN_WIDTH,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: PILL_RADIUS,
    borderWidth: BORDER_WIDTH,
  },
  retryLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 600,
  },
});
