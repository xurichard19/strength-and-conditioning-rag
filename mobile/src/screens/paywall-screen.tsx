import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PolicyLinks } from '@/components/policy-links';
import { AppText, Card, PrimaryButton, SecondaryButton } from '@/components/ui';
import { useApp } from '@/state/app-context';
import { useSubscription } from '@/state/subscription-context';

/** A dismissed native paywall returns here without granting access or reopening itself. */
export default function PaywallScreen() {
  const { colors, authSession, accountReady, passwordRecovery, profile, signOut } = useApp();
  const subscription = useSubscription();
  const attempted = useRef<string | null>(null);
  const ready = Boolean(authSession && accountReady && profile.onboardingComplete && !passwordRecovery);

  useEffect(() => {
    if (!ready) return;
    if (!subscription.enabled || subscription.hasAccess) {
      router.replace(subscription.destination);
      return;
    }
    if (subscription.status && !subscription.loading && !subscription.busy && !subscription.error
      && !subscription.message && attempted.current !== authSession!.user.id) {
      attempted.current = authSession!.user.id;
      void subscription.purchase();
    }
  }, [authSession, ready, subscription]);

  const busy = Boolean(subscription.busy);
  const choosePlan = () => {
    attempted.current = authSession?.user.id ?? null;
    void subscription.purchase();
  };
  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <AppText weight="bold" style={styles.title}>Continue with Arcel Pro</AppText>
        <AppText tone="secondary">Choose a monthly or annual subscription to continue. Your setup is saved.</AppText>
      </View>
      <Card>
        {subscription.loading ? <View style={styles.loading}><ActivityIndicator color={colors.tint} /><AppText>Checking your subscription…</AppText></View> : null}
        {subscription.error ? <AppText accessibilityRole="alert">{subscription.error}</AppText> : null}
        {subscription.message ? <AppText accessibilityRole="alert">{subscription.message}</AppText> : null}
        <View style={styles.actions}>
          {subscription.error || subscription.message ? <PrimaryButton disabled={busy || subscription.loading} onPress={() => void subscription.refresh()}>Retry subscription check</PrimaryButton> : null}
          <PrimaryButton disabled={!ready || busy || subscription.loading || subscription.confirming || Boolean(subscription.error)} loading={subscription.busy === 'purchase'} onPress={choosePlan}>Choose a plan</PrimaryButton>
          <SecondaryButton disabled={!ready || busy || subscription.loading} loading={subscription.busy === 'restore'} onPress={() => void subscription.restore()}>Restore purchases</SecondaryButton>
          <SecondaryButton disabled={!ready || busy || subscription.loading} loading={subscription.busy === 'manage'} onPress={() => void subscription.manage()}>Manage subscription</SecondaryButton>
        </View>
      </Card>
      <SecondaryButton disabled={busy} onPress={() => router.push('/account')}>Account & support</SecondaryButton>
      <SecondaryButton disabled={busy} onPress={() => void signOut()}>Sign out</SecondaryButton>
      <PolicyLinks />
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  intro: { gap: 12, marginBottom: 8 }, title: { fontSize: 30, lineHeight: 36 },
  actions: { gap: 10, marginTop: 16 }, loading: { gap: 12, alignItems: 'center' },
});
