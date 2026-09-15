import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useApp } from '@/state/app-context';

export default function Index() {
  const { accountReady, authSession, hydrated, profile, colors } = useApp();
  if (!hydrated || (authSession && !accountReady)) {
    return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.tint} /></View>;
  }
  if (!authSession) return <Redirect href="/auth" />;
  return <Redirect href={profile.onboardingComplete ? '/(tabs)/today' : '/onboarding'} />;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
