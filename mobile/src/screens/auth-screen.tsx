import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ShieldCheck, Sparkles } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthCard, type AuthFeedback, type AuthMode } from '@/components/auth-card';
import { AppText } from '@/components/ui';
import { liveApiConfigured } from '@/services/api';
import { useApp } from '@/state/app-context';

const screenCopy: Record<AuthMode, { title: string; copy: string }> = {
  'sign-in': { title: 'Welcome back', copy: 'Continue with your plan exactly where you left it.' },
  'sign-up': { title: 'Create your account', copy: 'A few quick questions, then Arcel will build your first week.' },
  reset: { title: 'Reset your password', copy: 'Enter your email and we’ll send recovery instructions.' },
};

export default function AuthScreen() {
  const params = useLocalSearchParams<{ reset?: string }>();
  const {
    accountReady,
    authSession,
    colors,
    profile,
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
      <LinearGradient pointerEvents="none" colors={colors.washYou} style={styles.wash} />
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.brandRow}>
            <View style={[styles.mark, { backgroundColor: colors.tintSoft }]}><Sparkles color={colors.tintText} size={25} /></View>
            <AppText weight="bold" style={styles.brand}>Arcel</AppText>
          </View>

          <View style={styles.intro}>
            <AppText weight="bold" style={styles.title}>{content.title}</AppText>
            <AppText tone="secondary" style={styles.copy}>{content.copy}</AppText>
          </View>

          <AuthCard mode={mode} email={email} password={password} showPassword={showPassword} busy={busy} accountLoading={Boolean(authSession) && !accountReady} canSubmit={canSubmit} feedback={feedback} onModeChange={chooseMode} onEmailChange={setEmail} onPasswordChange={setPassword} onTogglePassword={() => setShowPassword((current) => !current)} onSubmit={() => void submit()} onGoogle={() => void submitGoogle()} />

          <View style={styles.trustRow}>
            <ShieldCheck color={colors.textTertiary} size={15} />
            <AppText tone="secondary" style={styles.trustText}>Your account keeps your plan and training history in sync.</AppText>
          </View>
          <AppText tone="secondary" style={styles.legal}>By continuing, you agree to Arcel’s Terms and Privacy Policy.</AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 390 },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 34, paddingBottom: 24, justifyContent: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  mark: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 17, lineHeight: 21, letterSpacing: 1.7, textTransform: 'uppercase' },
  intro: { marginTop: 28, marginBottom: 22 },
  title: { fontSize: 34, lineHeight: 39, letterSpacing: -1.15 },
  copy: { marginTop: 9, fontSize: 15, lineHeight: 22, maxWidth: 330 },
  trustRow: { marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  trustText: { fontSize: 11, lineHeight: 16 },
  legal: { marginTop: 10, textAlign: 'center', fontSize: 10, lineHeight: 15 },
});
