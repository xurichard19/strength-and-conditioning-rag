import { router, useLocalSearchParams } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthCard, type AuthFeedback, type AuthMode } from '@/components/auth-card';
import { PolicyLinks } from '@/components/policy-links';
import { AppText } from '@/components/ui';
import { liveApiConfigured } from '@/services/api';
import { useApp } from '@/state/app-context';

const screenCopy: Record<AuthMode, { title: string; copy: string }> = {
  'sign-in': { title: 'Welcome back', copy: 'Continue with your plan exactly where you left it.' },
  'sign-up': { title: 'Create your account', copy: 'Save your training preferences and start chatting with Arcel.' },
  reset: { title: 'Reset your password', copy: 'Enter your email and we’ll send recovery instructions.' },
};

export default function AuthScreen() {
  const params = useLocalSearchParams<{ reset?: string }>();
  const {
    accountReady,
    authSession,
    colors,
    profile,
    notice,
    requestPasswordReset,
    signIn,
    signInWithGoogle,
    signUp,
  } = useApp();
  const [mode, setMode] = useState<AuthMode>('sign-up');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<AuthFeedback>(
    params.reset === 'success' ? { kind: 'success', text: 'Password updated. Sign in with your new password.' } : null,
  );

  useEffect(() => {
    if (!authSession || !accountReady) return;
    router.replace(profile.onboardingComplete ? '/(tabs)/today' : '/onboarding');
  }, [accountReady, authSession, profile.onboardingComplete]);

  const chooseMode = (next: AuthMode) => {
    setMode(next);
    setPassword('');
    setFeedback(null);
  };

  const submit = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || busy) return;
    setBusy(true);
    setFeedback(null);
    const actions = {
      reset: () => requestPasswordReset(normalizedEmail),
      'sign-in': () => signIn(normalizedEmail, password),
      'sign-up': () => signUp(normalizedEmail, password),
    } satisfies Record<AuthMode, () => ReturnType<typeof signIn>>;
    const result = await actions[mode]();
    setBusy(false);
    if (!result.ok) setFeedback({ kind: 'error', text: result.message });
    else if (result.message) setFeedback({ kind: 'success', text: result.message });
  };

  const submitGoogle = async () => {
    if (busy || !liveApiConfigured) return;
    setBusy(true);
    setFeedback(null);
    const result = await signInWithGoogle();
    setBusy(false);
    if (!result.ok) setFeedback({ kind: 'error', text: result.message });
  };

  const canSubmit = Boolean(email.trim()) && (mode === 'reset' || password.length >= 6) && liveApiConfigured;
  const content = screenCopy[mode];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.brandRow}>
            <AppText weight="medium" style={styles.brand}>Arcel</AppText>
            <View style={[styles.brandRule, { backgroundColor: colors.separator }]} />
            <AppText tone="secondary" style={styles.brandDescriptor}>TRAINING, IN CONTEXT</AppText>
          </View>

          <View style={styles.intro}>
            <AppText style={styles.title}>{content.title}</AppText>
            <AppText tone="secondary" style={styles.copy}>{content.copy}</AppText>
          </View>

          {!liveApiConfigured ? <AppText>Configure the mobile API URL, Supabase URL, and publishable key to sign in.</AppText> : null}
          {notice ? <AppText>{notice}</AppText> : null}
          <AuthCard mode={mode} email={email} password={password} showPassword={showPassword} busy={busy} accountLoading={Boolean(authSession) && !accountReady} canSubmit={canSubmit} feedback={feedback} onModeChange={chooseMode} onEmailChange={setEmail} onPasswordChange={setPassword} onTogglePassword={() => setShowPassword((current) => !current)} onSubmit={() => void submit()} onGoogle={() => void submitGoogle()} />

          <View style={styles.trustRow}>
            <ShieldCheck color={colors.textTertiary} size={15} />
            <AppText tone="secondary" style={styles.trustText}>Your account keeps your plan and training history in sync.</AppText>
          </View>
          <AppText tone="secondary" style={styles.legal}>By continuing, you agree to Arcel’s Terms of Service. See our privacy policies for how we handle your information.</AppText>
          <PolicyLinks />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 36, paddingBottom: 24, justifyContent: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  brand: { fontSize: 15, lineHeight: 20, letterSpacing: 3, textTransform: 'uppercase' },
  brandRule: { height: 16, width: StyleSheet.hairlineWidth },
  brandDescriptor: { fontSize: 8, lineHeight: 12, letterSpacing: 1.1 },
  intro: { marginTop: 44, marginBottom: 30 },
  title: { fontSize: 38, lineHeight: 43, letterSpacing: -1.5 },
  copy: { marginTop: 12, fontSize: 15, lineHeight: 24, maxWidth: 330 },
  trustRow: { marginTop: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  trustText: { flexShrink: 1, fontSize: 11, lineHeight: 17 },
  legal: { marginTop: 10, textAlign: 'center', fontSize: 10, lineHeight: 15 },
});
