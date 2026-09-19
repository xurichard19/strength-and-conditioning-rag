import { router } from 'expo-router';
import { ArrowLeft, Cloud, CloudOff, LogOut } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Card, PrimaryButton, SecondaryButton } from '@/components/ui';
import { fonts, radius } from '@/design/tokens';
import { liveApiConfigured } from '@/services/api';
import { useApp } from '@/state/app-context';

function ConnectionStatus() {
  const { colors, authSession } = useApp();
  const connected = Boolean(authSession);
  return (
    <Card style={styles.statusCard}>
      <View style={[styles.cloud, { borderColor: colors.separator }]}>{connected ? <Cloud color={colors.tint} size={23} strokeWidth={1.5} /> : <CloudOff color={colors.textSecondary} size={23} strokeWidth={1.5} />}</View>
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
      <AppText weight="medium" style={styles.sectionTitle}>Connect when the backend is ready</AppText>
      <AppText weight="medium" style={styles.label}>Email</AppText>
      <TextInput accessibilityLabel="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.textTertiary} style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.separator }]} />
      <AppText weight="medium" style={styles.label}>Password</AppText>
      <TextInput accessibilityLabel="Password" autoCapitalize="none" autoComplete="password" secureTextEntry value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.textTertiary} style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.separator }]} />
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
        <View style={[styles.header, { borderBottomColor: colors.separator }]}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.text} size={21} strokeWidth={1.5} /></Pressable><AppText weight="medium" style={styles.headerLabel}>Your account</AppText><View style={styles.back} /></View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}><AppText style={styles.title}>Account & sync</AppText><AppText tone="secondary" style={styles.subtitle}>Manage your connection to Arcel.</AppText></View>
          <ConnectionStatus />
          <BackendNotice />
          {authSession ? <SignedInActions /> : <AccountForm />}
          <AppText tone="secondary" style={styles.footnote}>Profile, onboarding, and chat use the live API. Planning and workout syncing are not connected yet.</AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 60, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { flex: 1, textAlign: 'center', fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase' },
  intro: { marginTop: 12, marginBottom: 18 },
  title: { fontSize: 36, lineHeight: 42, letterSpacing: -1.2 },
  subtitle: { marginTop: 12, fontSize: 14, lineHeight: 22 },
  content: { padding: 24, gap: 16 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cloud: { width: 48, height: 48, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  statusCopy: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  info: { marginTop: 4 },
  infoCopy: { fontSize: 13, lineHeight: 21, marginTop: 10 },
  form: { gap: 12, marginTop: 16 },
  sectionTitle: { fontSize: 22, lineHeight: 29, letterSpacing: -0.4, marginBottom: 10 },
  label: { fontSize: 12, lineHeight: 17, marginTop: 8, marginLeft: 2 },
  input: { height: 56, borderRadius: radius.panel, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, fontFamily: fonts.regular, fontSize: 15 },
  message: { fontSize: 12, lineHeight: 18 },
  footnote: { fontSize: 11, lineHeight: 18, textAlign: 'center', paddingHorizontal: 6, marginTop: 16 },
});
