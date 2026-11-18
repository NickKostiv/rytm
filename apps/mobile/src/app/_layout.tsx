import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { ChatSessionProvider } from '@/features/history/chat-session-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  return (
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <ChatSessionProvider>
          <Stack
            screenOptions={{
              headerShadowVisible: false,
              headerStyle: { backgroundColor: theme.background },
              headerTintColor: theme.text,
              headerTitleStyle: { fontSize: 17, fontWeight: '600' },
            }}>
            <Stack.Screen name="index" options={{ title: 'Rytm' }} />
            <Stack.Screen name="history" dangerouslySingular />
          </Stack>
        </ChatSessionProvider>
      </ThemeProvider>
    </KeyboardProvider>
  );
}
