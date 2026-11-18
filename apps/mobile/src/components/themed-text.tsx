import { StyleSheet, Text, type TextProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'answer'
    | 'answerHeading'
    | 'answerSubheading'
    | 'body'
    | 'bodyCompact'
    | 'table'
    | 'caption'
    | 'footnote'
    | 'emptyTitle'
    | 'doseValue';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'body', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  answer: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: 400,
  },
  answerHeading: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: 700,
  },
  answerSubheading: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: 700,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 400,
  },
  bodyCompact: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 400,
  },
  table: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 400,
    fontVariant: ['tabular-nums'],
  },
  caption: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 400,
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 400,
  },
  emptyTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
  },
  doseValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
});
