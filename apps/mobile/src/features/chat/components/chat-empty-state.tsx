import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import {
  COPY,
  EXAMPLE_QUESTIONS,
  EXAMPLE_ROW_PADDING_VERTICAL,
  EXAMPLE_ROW_RADIUS,
  TOUCH_TARGET_SIZE,
} from "@/features/chat/constants";
import { useChatGutter } from "@/features/chat/use-chat-gutter";
import { useTheme } from "@/hooks/use-theme";

type ChatEmptyStateProps = {
  onExamplePress: (text: string) => void;
};

export function ChatEmptyState({ onExamplePress }: ChatEmptyStateProps) {
  const gutter = useChatGutter();
  const theme = useTheme();

  const handleExamplePress = (text: string) => {
    Keyboard.dismiss();
    onExamplePress(text);
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.container, { paddingHorizontal: gutter }]}
    >
      <Pressable
        accessible={false}
        onPress={Keyboard.dismiss}
        style={styles.dismissArea}
      />
      <View style={styles.content}>
        <ThemedText type="emptyTitle" accessibilityRole="header">
          {COPY.emptyTitle}
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          {COPY.emptyDescription}
        </ThemedText>
        <ThemedText
          type="footnote"
          themeColor="textSecondary"
          style={styles.examplesLabel}
        >
          {COPY.examplesLabel}
        </ThemedText>
        {EXAMPLE_QUESTIONS.map((question) => (
          <Pressable
            key={question}
            accessibilityRole="button"
            accessibilityLabel={question}
            accessibilityHint={COPY.exampleHint}
            onPress={() => handleExamplePress(question)}
            style={({ pressed }) => [
              styles.exampleRow,
              {
                backgroundColor: pressed
                  ? theme.backgroundSelected
                  : theme.backgroundElement,
              },
            ]}
          >
            <ThemedText type="bodyCompact" style={styles.exampleText}>
              {question}
            </ThemedText>
            <ThemedText
              type="bodyCompact"
              themeColor="textSecondary"
              allowFontScaling={false}
            >
              ↑
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingBottom: Spacing.three,
  },
  content: {
    gap: Spacing.two,
  },
  dismissArea: {
    flex: 1,
  },
  examplesLabel: {
    marginTop: Spacing.three,
    fontWeight: 600,
  },
  exampleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    minHeight: TOUCH_TARGET_SIZE,
    paddingVertical: EXAMPLE_ROW_PADDING_VERTICAL,
    paddingHorizontal: Spacing.three,
    borderRadius: EXAMPLE_ROW_RADIUS,
  },
  exampleText: {
    flex: 1,
  },
});
