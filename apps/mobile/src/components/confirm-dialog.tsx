import { type ComponentRef, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BORDER_WIDTH, PILL_RADIUS, Spacing, TOUCH_TARGET_SIZE } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const CANCEL_LABEL = 'Скасувати';
const CARD_MAX_WIDTH = 400;
const CARD_RADIUS = 16;
const CARD_MAX_HEIGHT_RATIO = 0.8;

function focusTitleOnWeb(node: ComponentRef<typeof View> | null) {
  if (Platform.OS === 'web') node?.focus();
}

type ConfirmStatus = 'idle' | 'running' | 'failed';

type ConfirmDialogProps = {
  title: string;
  body: string;
  confirmLabel: string;
  failureMessage: string;
  horizontalInset: number;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  failureMessage,
  horizontalInset,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [status, setStatus] = useState<ConfirmStatus>('idle');
  const isMountedRef = useRef(false);
  const isRunning = status === 'running';

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleCancel = () => {
    if (!isRunning) onCancel();
  };

  const handleConfirm = async () => {
    if (isRunning) return;
    setStatus('running');
    try {
      await onConfirm();
      if (isMountedRef.current) setStatus('idle');
    } catch {
      if (isMountedRef.current) setStatus('failed');
    }
  };

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      aria-label={title}
      onRequestClose={handleCancel}>
      <View style={[styles.overlay, { paddingHorizontal: horizontalInset }]}>
        <Pressable
          accessible={false}
          onPress={handleCancel}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              maxHeight: windowHeight * CARD_MAX_HEIGHT_RATIO,
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}>
          <ScrollView contentContainerStyle={styles.content}>
            <View tabIndex={-1} ref={focusTitleOnWeb}>
              <ThemedText type="answerSubheading" accessibilityRole="header">
                {title}
              </ThemedText>
            </View>
            <ThemedText themeColor="textSecondary">{body}</ThemedText>
            {status === 'failed' && (
              <View accessibilityLiveRegion="polite" style={styles.failureRow}>
                <ThemedText themeColor="danger" style={styles.failureText}>
                  !
                </ThemedText>
                <ThemedText themeColor="danger" style={[styles.failureText, styles.failureMessage]}>
                  {failureMessage}
                </ThemedText>
              </View>
            )}
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={confirmLabel}
                accessibilityState={{ disabled: isRunning, busy: isRunning }}
                onPress={() => void handleConfirm()}
                style={[styles.button, { backgroundColor: theme.danger }]}>
                {isRunning ? (
                  <ActivityIndicator size="small" color={theme.onDanger} />
                ) : (
                  <ThemedText themeColor="onDanger" style={styles.buttonLabel}>
                    {confirmLabel}
                  </ThemedText>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={handleCancel}
                style={[styles.button, styles.cancelButton, { borderColor: theme.borderStrong }]}>
                <ThemedText style={styles.buttonLabel}>{CANCEL_LABEL}</ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: CARD_MAX_WIDTH,
    borderRadius: CARD_RADIUS,
    borderWidth: BORDER_WIDTH,
    overflow: 'hidden',
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  failureRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  failureText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: 600,
  },
  failureMessage: {
    flex: 1,
  },
  actions: {
    gap: Spacing.two,
  },
  button: {
    minHeight: TOUCH_TARGET_SIZE,
    borderRadius: PILL_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  cancelButton: {
    borderWidth: BORDER_WIDTH,
  },
  buttonLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 600,
  },
});
