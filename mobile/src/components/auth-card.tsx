import { ArrowLeft, Eye, EyeOff, KeyRound, LockKeyhole, Mail } from 'lucide-react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { fonts, radius } from '@/design/tokens';
import { liveApiConfigured } from '@/services/api';
import { useApp } from '@/state/app-context';

import { AppText, PrimaryButton } from './ui';

export type AuthMode = 'sign-in' | 'sign-up' | 'reset';
export type AuthFeedback = { kind: 'error' | 'success'; text: string } | null;

type AuthCardProps = {
  mode: AuthMode;
  email: string;
  password: string;
  showPassword: boolean;
  busy: boolean;
  accountLoading: boolean;
  canSubmit: boolean;
  feedback: AuthFeedback;
  onModeChange: (mode: AuthMode) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onSubmit: () => void;
  onGoogle: () => void;
};

const primaryLabels: Record<AuthMode, string> = {
  'sign-in': 'Sign in',
  'sign-up': 'Create account',
  reset: 'Send reset link',
};

function SegmentButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useApp();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.segmentButton, { borderBottomColor: selected ? colors.text : 'transparent' }, pressed && styles.googlePressed]}>
      <AppText tone={selected ? 'default' : 'secondary'} weight="medium" style={styles.segmentLabel}>{label}</AppText>
    </Pressable>
  );
}

function ModeSwitch({ mode, onChange }: Pick<AuthCardProps, 'mode'> & { onChange: AuthCardProps['onModeChange'] }) {
  const { colors } = useApp();
  if (mode === 'reset') {
    return <Pressable accessibilityRole="button" onPress={() => onChange('sign-in')} style={styles.returnButton}><ArrowLeft color={colors.tint} size={17} /><AppText tone="tint" weight="semibold" style={styles.smallAction}>Return to sign in</AppText></Pressable>;
  }
  return (
    <View style={[styles.segment, { borderBottomColor: colors.separator }]}>
      <SegmentButton label="Sign in" selected={mode === 'sign-in'} onPress={() => onChange('sign-in')} />
      <SegmentButton label="Create account" selected={mode === 'sign-up'} onPress={() => onChange('sign-up')} />
    </View>
  );
}

function EmailField({ value, submitOnEnter, onChange, onSubmit }: { value: string; submitOnEnter: boolean; onChange: (value: string) => void; onSubmit: () => void }) {
  const { colors } = useApp();
  return (
    <View>
      <AppText weight="medium" style={styles.label}>Email</AppText>
      <View style={[styles.inputShell, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        <Mail color={colors.textTertiary} size={18} />
        <TextInput accessibilityLabel="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={value} onChangeText={onChange} onSubmitEditing={() => { if (submitOnEnter) onSubmit(); }} placeholder="you@example.com" placeholderTextColor={colors.textTertiary} style={[styles.input, { color: colors.text }]} />
      </View>
    </View>
  );
}

function PasswordField({ mode, value, visible, canSubmit, onChange, onToggle, onSubmit }: Pick<AuthCardProps, 'mode' | 'canSubmit'> & { value: string; visible: boolean; onChange: (value: string) => void; onToggle: () => void; onSubmit: () => void }) {
  const { colors } = useApp();
  if (mode === 'reset') return null;
  const creating = mode === 'sign-up';
  return (
    <View>
      <AppText weight="medium" style={styles.label}>Password</AppText>
      <View style={[styles.inputShell, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        <LockKeyhole color={colors.textTertiary} size={18} />
        <TextInput accessibilityLabel="Password" autoCapitalize="none" autoComplete={creating ? 'new-password' : 'current-password'} secureTextEntry={!visible} value={value} onChangeText={onChange} onSubmitEditing={() => { if (canSubmit) onSubmit(); }} placeholder={creating ? 'At least 6 characters' : 'Your password'} placeholderTextColor={colors.textTertiary} style={[styles.input, { color: colors.text }]} />
        <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={onToggle} style={styles.eyeButton}>{visible ? <EyeOff color={colors.textSecondary} size={18} /> : <Eye color={colors.textSecondary} size={18} />}</Pressable>
      </View>
      <AppText tone="secondary" style={styles.hint}>{creating ? 'Use at least 6 characters.' : 'Use your existing Arcel credentials.'}</AppText>
    </View>
  );
}

function FeedbackMessage({ feedback }: { feedback: AuthFeedback }) {
  const { colors } = useApp();
  if (!feedback) return null;
  const color = feedback.kind === 'error' ? colors.danger : colors.success;
  return <View accessibilityRole="alert" style={[styles.feedback, { backgroundColor: `${color}12` }]}><AppText style={[styles.feedbackText, { color }]}>{feedback.text}</AppText></View>;
}

function ConfigurationMessage() {
  const { colors } = useApp();
  if (liveApiConfigured) return null;
  return <View style={[styles.feedback, { backgroundColor: colors.tintSoft }]}><AppText tone="tint" style={styles.feedbackText}>Add your API and Supabase public values to `.env`, then restart Expo.</AppText></View>;
}

function GoogleButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const { colors } = useApp();
  return (
    <>
      <View style={styles.dividerRow}><View style={[styles.divider, { backgroundColor: colors.separator }]} /><AppText tone="secondary" style={styles.dividerText}>or</AppText><View style={[styles.divider, { backgroundColor: colors.separator }]} /></View>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.googleButton, { backgroundColor: colors.card, borderColor: colors.separator }, pressed && styles.googlePressed, disabled && styles.googleDisabled]}>
        <View style={styles.googleMark}><AppText weight="bold" style={styles.googleLetter}>G</AppText></View>
        <AppText weight="medium">Continue with Google</AppText>
      </Pressable>
    </>
  );
}

export function AuthCard(props: AuthCardProps) {
  const { colors } = useApp();
  const socialDisabled = props.busy || !liveApiConfigured;
  return (
    <View style={styles.formCard}>
      <ModeSwitch mode={props.mode} onChange={props.onModeChange} />
      <View style={styles.fields}>
        <EmailField value={props.email} submitOnEnter={props.mode === 'reset'} onChange={props.onEmailChange} onSubmit={props.onSubmit} />
        <PasswordField mode={props.mode} value={props.password} visible={props.showPassword} canSubmit={props.canSubmit} onChange={props.onPasswordChange} onToggle={props.onTogglePassword} onSubmit={props.onSubmit} />
      </View>
      <FeedbackMessage feedback={props.feedback} />
      <ConfigurationMessage />
      <PrimaryButton loading={props.busy || props.accountLoading} disabled={!props.canSubmit} onPress={props.onSubmit}>{primaryLabels[props.mode]}</PrimaryButton>
      {props.mode === 'reset' ? null : <GoogleButton disabled={socialDisabled} onPress={props.onGoogle} />}
      {props.mode === 'sign-in' ? <Pressable accessibilityRole="button" onPress={() => props.onModeChange('reset')} style={styles.forgotButton}><KeyRound color={colors.tint} size={16} /><AppText tone="tint" weight="semibold" style={styles.smallAction}>Forgot password?</AppText></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  formCard: { gap: 20 },
  segment: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row' },
  segmentButton: { flex: 1, borderBottomWidth: 2, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginBottom: -1 },
  segmentLabel: { fontSize: 13, lineHeight: 17 },
  returnButton: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 },
  fields: { gap: 20 },
  label: { fontSize: 12, lineHeight: 17, marginBottom: 9, marginLeft: 2 },
  inputShell: { minHeight: 56, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  input: { flex: 1, height: 55, paddingRight: 12, fontFamily: fonts.regular, fontSize: 15 },
  eyeButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  hint: { marginTop: 8, marginLeft: 2, fontSize: 11, lineHeight: 16 },
  feedback: { borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10 },
  feedbackText: { fontSize: 12, lineHeight: 17 },
  forgotButton: { minHeight: 44, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 },
  smallAction: { fontSize: 13, lineHeight: 17 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 11, lineHeight: 15 },
  googleButton: { minHeight: 54, borderRadius: radius.capsule, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  googlePressed: { opacity: 0.72 },
  googleDisabled: { opacity: 0.45 },
  googleMark: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  googleLetter: { color: '#4285F4', fontSize: 18, lineHeight: 22 },
});
