import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { ThemeColor } from '@/constants/theme';
import { MarkdownInline } from '@/features/chat/components/markdown-inline';
import {
  COPY,
  FLAG_BLOCK_SPACING,
  FLAG_BLOCK_RADIUS,
  FLAG_DISC_SIZE,
} from '@/features/chat/constants';
import { lexMarkdownInline } from '@/features/chat/markdown-tokens';
import type { AnswerFlagLevel } from '@/features/chat/parse-answer-flag';
import { useTheme } from '@/hooks/use-theme';

export type FlagVariant = AnswerFlagLevel | 'pending' | 'unavailable';

type FlagAppearance = {
  label: string;
  glyph: string;
  background: ThemeColor;
  foreground: ThemeColor;
  icon: ThemeColor;
  glyphColor: ThemeColor;
};

const NEUTRAL_APPEARANCE = {
  glyph: '–',
  background: 'backgroundElement',
  foreground: 'textSecondary',
  icon: 'flagNeutralIcon',
  glyphColor: 'flagGlyph',
} as const;

const FLAG_APPEARANCE: Record<FlagVariant, FlagAppearance> = {
  GREEN: {
    label: COPY.flagGreen,
    glyph: '✓',
    background: 'flagGreenBg',
    foreground: 'flagGreenFg',
    icon: 'flagGreenIcon',
    glyphColor: 'flagGlyph',
  },
  YELLOW: {
    label: COPY.flagYellow,
    glyph: '!',
    background: 'flagYellowBg',
    foreground: 'flagYellowFg',
    icon: 'flagYellowIcon',
    glyphColor: 'flagGlyphYellow',
  },
  RED: {
    label: COPY.flagRed,
    glyph: '✕',
    background: 'flagRedBg',
    foreground: 'flagRedFg',
    icon: 'flagRedIcon',
    glyphColor: 'flagGlyph',
  },
  pending: { label: COPY.flagPending, ...NEUTRAL_APPEARANCE },
  unavailable: { label: COPY.flagUnavailable, ...NEUTRAL_APPEARANCE },
};

type FlagBlockProps = {
  variant: FlagVariant;
  explanation?: string;
};

export function FlagBlock({ variant, explanation }: FlagBlockProps) {
  const theme = useTheme();
  const appearance = FLAG_APPEARANCE[variant];

  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={explanation ? `${appearance.label}. ${explanation}` : appearance.label}
      style={[styles.container, { backgroundColor: theme[appearance.background] }]}>
      <View
        importantForAccessibility="no"
        style={[styles.disc, { backgroundColor: theme[appearance.icon] }]}>
        <ThemedText
          allowFontScaling={false}
          themeColor={appearance.glyphColor}
          style={styles.glyph}>
          {appearance.glyph}
        </ThemedText>
      </View>
      <View style={styles.textColumn}>
        <ThemedText themeColor={appearance.foreground} style={styles.label}>
          {appearance.label}
        </ThemedText>
        {explanation ? (
          <ThemedText selectable style={styles.explanation}>
            <MarkdownInline tokens={lexMarkdownInline(explanation)} />
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: FLAG_BLOCK_SPACING,
    padding: FLAG_BLOCK_SPACING,
    borderRadius: FLAG_BLOCK_RADIUS,
  },
  disc: {
    width: FLAG_DISC_SIZE,
    height: FLAG_DISC_SIZE,
    borderRadius: FLAG_DISC_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: 700,
  },
  textColumn: {
    flex: 1,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 700,
  },
  explanation: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: 400,
  },
});
