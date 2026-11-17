/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    accent: '#0B5FA5',
    onAccent: '#FFFFFF',
    border: '#D6D8DD',
    borderStrong: '#7E838C',
    danger: '#B42318',
    flagGreenBg: '#E7F4EA',
    flagGreenFg: '#17602D',
    flagGreenIcon: '#1E7B3A',
    flagYellowBg: '#FFF4D6',
    flagYellowFg: '#6E4600',
    flagYellowIcon: '#A87500',
    flagRedBg: '#FCEBEB',
    flagRedFg: '#9E1B1B',
    flagRedIcon: '#C62828',
    flagNeutralIcon: '#6B7078',
    flagGlyph: '#FFFFFF',
    flagGlyphYellow: '#1A1300',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    accent: '#7BB8F0',
    onAccent: '#00182B',
    border: '#34373C',
    borderStrong: '#7A7F87',
    danger: '#FF8A80',
    flagGreenBg: '#0E2616',
    flagGreenFg: '#86DBA0',
    flagGreenIcon: '#4CC26E',
    flagYellowBg: '#2B2208',
    flagYellowFg: '#F5CF5C',
    flagYellowIcon: '#F2C230',
    flagRedBg: '#341010',
    flagRedFg: '#FFA3A3',
    flagRedIcon: '#FF6B6B',
    flagNeutralIcon: '#8C9198',
    flagGlyph: '#000000',
    flagGlyphYellow: '#1A1300',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
