import {
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
  useFonts,
} from '@expo-google-fonts/rubik';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AppText, PrimaryButton, SecondaryButton } from '@/components/ui';

import { AppProvider, useApp } from '@/state/app-context';

void SplashScreen.preventAutoHideAsync();

function Navigation() {
  const { accountReady, accountError, authSession, colorScheme, colors, hydrated, passwordRecovery, profile, refreshLiveData, signOut } = useApp();
  const segments = useSegments();
  const baseTheme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...baseTheme,
    colors: { ...baseTheme.colors, background: colors.background, card: colors.card, text: colors.text, primary: colors.tint, border: colors.separator, notification: colors.danger },
  };

  useEffect(() => {
    if (!hydrated) return;
    const onAuthScreen = segments[0] === 'auth';
    const onRecoveryScreen = segments[0] === 'reset-password';
    if (passwordRecovery && !onRecoveryScreen) {
      router.replace('/reset-password');
      return;
    }
    if (!authSession && !onAuthScreen) router.replace('/auth');
    else if (authSession && accountReady && !profile.onboardingComplete && segments[0] !== 'onboarding' && !onRecoveryScreen) router.replace('/onboarding');
  }, [accountReady, authSession, hydrated, passwordRecovery, profile.onboardingComplete, segments]);

  if (hydrated && authSession && !accountReady && !passwordRecovery) {
    return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: colors.background }}>
      {accountError ? <><AppText>{accountError}</AppText><PrimaryButton onPress={() => void refreshLiveData()}>Retry account loading</PrimaryButton><SecondaryButton onPress={() => void signOut()}>Sign out</SecondaryButton></> : <ActivityIndicator color={colors.tint} />}
    </View>;
  }

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" options={{ gestureEnabled: false }} />
        <Stack.Screen name="reset-password" options={{ gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        <Stack.Screen name="session/[id]" />
        <Stack.Screen name="sports-workout" />
        <Stack.Screen name="workout/[id]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="account" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ Rubik_400Regular, Rubik_500Medium, Rubik_600SemiBold, Rubik_700Bold });

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [error, loaded]);

  if (!loaded && !error) return null;
  return <AppProvider><Navigation /></AppProvider>;
}
