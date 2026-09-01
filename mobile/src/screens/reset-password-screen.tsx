import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Check, Eye, EyeOff, LockKeyhole, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Card, PrimaryButton } from '@/components/ui';
import { fonts, radius } from '@/design/tokens';
import { useApp } from '@/state/app-context';

function PasswordRequirements({ password, confirmation }: { password: string; confirmation: string }) {
  const { colors } = useApp();
  const longEnough = password.length >= 8;
  const matches = Boolean(confirmation) && password === confirmation;
  return (
    <View style={styles.requirements}>
      <Check color={longEnough ? colors.success : colors.textTertiary} size={15} />
      <AppText tone="secondary" style={styles.requirement}>At least 8 characters</AppText>
      <Check color={matches ? colors.success : colors.textTertiary} size={15} />
      <AppText tone="secondary" style={styles.requirement}>Passwords match</AppText>
    </View>
  );
}

function ResetFeedback({ recovery, error }: { recovery: boolean; error: string | null }) {
  const { colors } = useApp();
  return (
    <>
      {!recovery ? <View style={[styles.feedback, { backgroundColor: colors.tintSoft }]}><AppText tone="tint" style={styles.feedbackText}>Open this screen from the recovery link in your email.</AppText></View> : null}
      {error ? <View accessibilityRole="alert" style={[styles.feedback, { backgroundColor: `${colors.danger}12` }]}><AppText style={[styles.feedbackText, { color: colors.danger }]}>{error}</AppText></View> : null}
    </>
  );
}

export default function ResetPasswordScreen() {
  const { colors, passwordRecovery, updatePassword } = useApp();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = password.length >= 8 && password === confirmation && passwordRecovery;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const result = await updatePassword(password);
    setBusy(false);
    if (!result.ok) setError(result.message);
    else router.replace({ pathname: '/auth', params: { reset: 'success' } });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <LinearGradient pointerEvents="none" colors={colors.washYou} style={styles.wash} />
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={[styles.mark, { backgroundColor: colors.tintSoft }]}><Sparkles color={colors.tintText} size={28} /></View>
          <AppText weight="bold" style={styles.title}>Choose a new password</AppText>
          <AppText tone="secondary" style={styles.copy}>Use something unique that you don’t use for another account.</AppText>
          <Card style={styles.card}>
            <PasswordField label="New password" value={password} onChange={setPassword} visible={showPassword} onToggle={() => setShowPassword((current) => !current)} />
            <PasswordField label="Confirm password" value={confirmation} onChange={setConfirmation} visible={showPassword} onToggle={() => setShowPassword((current) => !current)} />
            <PasswordRequirements password={password} confirmation={confirmation} />
            <ResetFeedback recovery={passwordRecovery} error={error} />
            <PrimaryButton disabled={!valid} loading={busy} onPress={() => void submit()}>Update password</PrimaryButton>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PasswordField({ label, value, onChange, visible, onToggle }: { label: string; value: string; onChange: (value: string) => void; visible: boolean; onToggle: () => void }) {
  const { colors } = useApp();
  return (
    <View>
      <AppText weight="medium" style={styles.label}>{label}</AppText>
      <View style={[styles.inputShell, { backgroundColor: colors.fill, borderColor: colors.separator }]}>
        <LockKeyhole color={colors.textTertiary} size={18} />
        <TextInput accessibilityLabel={label} autoCapitalize="none" autoComplete="new-password" secureTextEntry={!visible} value={value} onChangeText={onChange} placeholder="At least 8 characters" placeholderTextColor={colors.textTertiary} style={[styles.input, { color: colors.text }]} />
        <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={onToggle} style={styles.eyeButton}>{visible ? <EyeOff color={colors.textSecondary} size={18} /> : <Eye color={colors.textSecondary} size={18} />}</Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 390 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 30 },
  mark: { width: 56, height: 56, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 22, fontSize: 32, lineHeight: 37, letterSpacing: -1 }, copy: { marginTop: 8, marginBottom: 22, fontSize: 15, lineHeight: 22 },
  card: { gap: 16 }, label: { fontSize: 12, marginBottom: 7, marginLeft: 2 },
  inputShell: { minHeight: 52, borderRadius: radius.panel, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  input: { flex: 1, height: 51, fontFamily: fonts.regular, fontSize: 15 }, eyeButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  requirements: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }, requirement: { fontSize: 10, lineHeight: 14, marginRight: 8 },
  feedback: { borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10 }, feedbackText: { fontSize: 12, lineHeight: 17 },
});
