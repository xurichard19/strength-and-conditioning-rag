import { router } from 'expo-router';
import { ArrowLeft, Cloud, CloudOff, LogOut } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Card, PrimaryButton, SecondaryButton } from '@/components/ui';
import { fonts, radius } from '@/design/tokens';
import { liveApiConfigured } from '@/services/api';
import { useApp } from '@/state/app-context';
import { useSubscription } from '@/state/subscription-context';
import { PolicyLinks } from '@/components/policy-links';

function ConnectionStatus() {
  const { colors, authSession } = useApp();
  const connected = Boolean(authSession);
  return (
    <Card style={styles.statusCard}>
      <View style={[styles.cloud, { backgroundColor: connected ? `${colors.success}18` : colors.fill }]}>{connected ? <Cloud color={colors.success} size={24} /> : <CloudOff color={colors.textSecondary} size={24} />}</View>
      <View style={styles.copy}><AppText weight="semibold">{connected ? 'Signed in' : 'Not signed in'}</AppText><AppText tone="secondary" style={styles.statusCopy}>{connected ? authSession?.user.email : 'Sign in to access your account.'}</AppText></View>
    </Card>
  );
}

function BackendNotice() {
  if (liveApiConfigured) return null;
  return <Card style={styles.info}><AppText weight="semibold">Backend connection is not configured</AppText><AppText tone="secondary" style={styles.infoCopy}>Add the three public environment values described in the mobile README. These values are required for authentication and chat.</AppText></Card>;
}

function SignedInActions() {
  const { refreshLiveData, signOut } = useApp();
  return (
    <View style={styles.form}>
      <PrimaryButton onPress={() => void refreshLiveData()}>Refresh account</PrimaryButton>
      <SecondaryButton icon={LogOut} onPress={() => void signOut()}>Sign out</SecondaryButton>
    </View>
  );
}

function SubscriptionActions() {
  const subscription = useSubscription();
  if (!subscription.enabled) return null;
  const busy = Boolean(subscription.busy) || subscription.loading;
  const status = subscription.status;
  const expiry = status?.expires_at ? new Date(status.expires_at).toLocaleDateString() : null;
  return <Card>
    <AppText weight="semibold">Subscription</AppText>
    <AppText tone="secondary" style={styles.infoCopy}>{subscription.loading ? 'Checking subscription…'
      : subscription.hasAccess ? status?.enabled === false ? 'Subscription access is not required in this environment.'
        : status?.phase === 'trial' ? 'Arcel Pro trial is active.' : status?.phase === 'grace' ? 'Arcel Pro is active during the billing grace period.' : 'Arcel Pro is active.'
        : 'No verified active subscription.'}</AppText>
    {expiry ? <AppText tone="secondary" style={styles.infoCopy}>{status?.will_renew ? 'Renews' : 'Access until'} {expiry}</AppText> : null}
    {subscription.error || subscription.message ? <AppText accessibilityRole="alert" style={styles.infoCopy}>{subscription.error ?? subscription.message}</AppText> : null}
    <View style={styles.form}>
      <SecondaryButton disabled={busy} onPress={() => void subscription.refresh()}>Refresh subscription</SecondaryButton>
      <SecondaryButton disabled={busy} loading={subscription.busy === 'restore'} onPress={() => void subscription.restore()}>Restore purchases</SecondaryButton>
      <PrimaryButton disabled={busy} loading={subscription.busy === 'manage'} onPress={() => void subscription.manage()}>Manage subscription</PrimaryButton>
      {!subscription.hasAccess ? <SecondaryButton disabled={busy} onPress={() => router.replace('/paywall')}>View plans</SecondaryButton> : null}
    </View>
  </Card>;
}

function AccountForm() {
  const { colors, signIn, signUp, refreshLiveData } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'in' | 'up' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const authenticate = async (mode: 'in' | 'up') => {
    setBusy(mode); setMessage(null);
    const result = mode === 'in' ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    setBusy(null); setMessage(result.ok ? result.message ?? 'Connected.' : result.message);
    if (result.ok) await refreshLiveData();
  };
  const disabled = !liveApiConfigured || !email || password.length < 6;
  return (
    <View style={styles.form}>
      <AppText weight="bold" style={styles.sectionTitle}>Connect when the backend is ready</AppText>
      <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.textTertiary} style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.separator }]} />
      <TextInput autoCapitalize="none" autoComplete="password" secureTextEntry value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.textTertiary} style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.separator }]} />
      {message ? <AppText tone="secondary" style={styles.message}>{message}</AppText> : null}
      <PrimaryButton disabled={disabled} loading={busy === 'in'} onPress={() => void authenticate('in')}>Sign in</PrimaryButton>
      <SecondaryButton disabled={disabled} loading={busy === 'up'} onPress={() => void authenticate('up')}>Create account</SecondaryButton>
    </View>
  );
}

export default function AccountScreen() {
  const { colors, authSession } = useApp();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { borderBottomColor: colors.separator }]}><Pressable onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.text} size={21} /></Pressable><AppText weight="bold" style={styles.title}>Account & sync</AppText><View style={styles.back} /></View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ConnectionStatus />
          <BackendNotice />
          {authSession ? <SubscriptionActions /> : null}
          {authSession ? <SignedInActions /> : <AccountForm />}
          <AppText tone="secondary" style={styles.footnote}>Profile, onboarding, and chat use the live API. Planning and workout syncing are not connected yet.</AppText>
          <PolicyLinks />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, header: { height: 60, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth }, back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, title: { flex: 1, textAlign: 'center', fontSize: 18 },
  content: { padding: 16, gap: 12 }, statusCard: { flexDirection: 'row', alignItems: 'center', gap: 12 }, cloud: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1 }, statusCopy: { fontSize: 12, marginTop: 3 },
  info: { shadowOpacity: 0 }, infoCopy: { fontSize: 13, lineHeight: 19, marginTop: 8 }, form: { gap: 10, marginTop: 8 }, sectionTitle: { fontSize: 22, marginBottom: 7 },
  input: { height: 52, borderRadius: radius.panel, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontFamily: fonts.regular, fontSize: 15 }, message: { fontSize: 12, lineHeight: 17 }, footnote: { fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 10, marginTop: 14 },
});
