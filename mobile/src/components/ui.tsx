import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  ChevronRight,
  Dumbbell,
  Moon,
  ShieldCheck,
  Sparkles,
  Timer,
  type LucideIcon,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fonts, radius, shadow, type Palette } from '@/design/tokens';
import type { Modality } from '@/domain/types';
import { useApp } from '@/state/app-context';

type Tone = 'default' | 'secondary' | 'tint' | 'inverse';
type Wash = 'today' | 'week' | 'progress' | 'you';

const modalityIcons: Record<Modality | 'intervals', LucideIcon> = {
  strength: Dumbbell,
  endurance: Timer,
  mixed: Dumbbell,
  rest: Moon,
  intervals: Timer,
};

const toneColorKeys: Record<Tone, keyof Pick<Palette, 'text' | 'textSecondary' | 'tintText' | 'strongText'>> = {
  default: 'text',
  secondary: 'textSecondary',
  tint: 'tintText',
  inverse: 'strongText',
};

const washColorKeys: Record<Wash, keyof Pick<Palette, 'washToday' | 'washWeek' | 'washProgress' | 'washYou'>> = {
  today: 'washToday',
  week: 'washWeek',
  progress: 'washProgress',
  you: 'washYou',
};

const modalityBackgroundKeys: Record<Modality | 'intervals', keyof Pick<Palette, 'strength' | 'endurance' | 'fillStrong' | 'intervals'>> = {
  strength: 'strength',
  endurance: 'endurance',
  mixed: 'strength',
  rest: 'fillStrong',
  intervals: 'intervals',
};

export function AppText({
  children,
  style,
  tone = 'default',
  weight = 'regular',
  numberOfLines,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  tone?: Tone;
  weight?: keyof typeof fonts;
  numberOfLines?: number;
}) {
  const { colors } = useApp();
  return (
    <Text numberOfLines={numberOfLines} style={[styles.text, { color: colors[toneColorKeys[tone]], fontFamily: fonts[weight] }, style]}>
      {children}
    </Text>
  );
}

export function Screen({
  title,
  subtitle,
  context,
  wash = 'today',
  children,
  contentContainerStyle,
  scrollProps,
}: {
  title: string;
  subtitle?: string;
  context?: string;
  wash?: Wash;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollProps?: ScrollViewProps;
}) {
  const { colors, notice, previewMode } = useApp();

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <LinearGradient pointerEvents="none" colors={colors[washColorKeys[wash]]} style={styles.wash} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.screenContent, contentContainerStyle]}
        {...scrollProps}>
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderCopy}>
            <AppText weight="bold" style={styles.largeTitle}>{title}</AppText>
            {subtitle ? <AppText tone="secondary" style={styles.subtitle}>{subtitle}</AppText> : null}
          </View>
          {context ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ask Arcel"
              onPress={() => router.push({ pathname: '/(tabs)/chat', params: { context } })}
              style={({ pressed }) => [styles.askButton, { backgroundColor: colors.card }, pressed && styles.pressed]}>
              <Sparkles color={colors.strength} size={21} strokeWidth={1.8} />
            </Pressable>
          ) : null}
        </View>
        {previewMode ? (
          <View style={[styles.previewPill, { backgroundColor: colors.tintSoft }]}>
            <View style={[styles.previewDot, { backgroundColor: colors.tint }]} />
            <AppText tone="tint" weight="medium" style={styles.previewText}>Preview data</AppText>
          </View>
        ) : null}
        {notice ? (
          <Card style={styles.noticeCard}>
            <AppText tone="secondary" style={styles.noticeText}>{notice}</AppText>
          </Card>
        ) : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useApp();
  return <View style={[styles.card, shadow, { backgroundColor: colors.card }, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <AppText weight="semibold" style={styles.sectionTitle}>{children}</AppText>;
}

export function PrimaryButton({
  children,
  loading,
  style,
  disabled,
  ...props
}: PressableProps & { children: ReactNode; loading?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      {...props}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: colors.strong },
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}>
      {loading ? <ActivityIndicator color={colors.strongText} /> : <AppText tone="inverse" weight="semibold" style={styles.buttonText}>{children}</AppText>}
    </Pressable>
  );
}

export function SecondaryButton({
  children,
  style,
  icon: Icon,
  loading,
  disabled,
  ...props
}: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; icon?: LucideIcon; loading?: boolean }) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      {...props}
      style={({ pressed }) => [styles.secondaryButton, { backgroundColor: colors.fill }, pressed && styles.pressed, (disabled || loading) && styles.disabled, style]}>
      {loading ? <ActivityIndicator color={colors.text} /> : <>{Icon ? <Icon size={18} color={colors.text} strokeWidth={1.8} /> : null}<AppText weight="semibold" style={styles.buttonText}>{children}</AppText></>}
    </Pressable>
  );
}

export function OutlineButton({ children, style, ...props }: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={({ pressed }) => [styles.outlineButton, { backgroundColor: colors.card, borderColor: colors.separator }, pressed && styles.pressed, style]}>
      <AppText weight="semibold" style={styles.buttonText}>{children}</AppText>
    </Pressable>
  );
}

export function ChoiceChip({ label, selected, onPress, style }: { label: string; selected?: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceChip,
        { backgroundColor: selected ? colors.tint : colors.fill },
        pressed && styles.pressed,
        style,
      ]}>
      <AppText tone={selected ? 'inverse' : 'default'} weight="medium" style={styles.choiceLabel}>{label}</AppText>
    </Pressable>
  );
}

export function ModalityBadge({ modality, size = 46 }: { modality: Modality | 'intervals'; size?: 32 | 38 | 46 }) {
  const { colors } = useApp();
  const Icon = modalityIcons[modality];
  const iconColor = modality === 'rest' ? colors.textSecondary : '#FFFFFF';
  return (
    <View style={[styles.modality, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors[modalityBackgroundKeys[modality]] }]}>
      <Icon color={iconColor} size={Math.round(size * 0.48)} strokeWidth={2} />
    </View>
  );
}

export function ShieldLine({ children }: { children: ReactNode }) {
  const { colors } = useApp();
  return (
    <View style={styles.shieldLine}>
      <ShieldCheck color={colors.textSecondary} size={14} strokeWidth={1.8} />
      <AppText tone="secondary" style={styles.shieldText}>{children}</AppText>
    </View>
  );
}

export function DisclosureRow({
  title,
  value,
  icon: Icon,
  onPress,
  last,
}: {
  title: string;
  value?: string;
  icon?: LucideIcon;
  onPress?: () => void;
  last?: boolean;
}) {
  const { colors } = useApp();
  const content = (
    <View style={[styles.disclosure, !last && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      {Icon ? (
        <View style={[styles.rowIcon, { backgroundColor: colors.tintSoft }]}>
          <Icon color={colors.tintText} size={17} strokeWidth={1.8} />
        </View>
      ) : null}
      <AppText weight="medium" style={styles.disclosureTitle}>{title}</AppText>
      {value ? <AppText tone="secondary" style={styles.disclosureValue}>{value}</AppText> : null}
      {onPress ? <ChevronRight color={colors.textTertiary} size={17} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

const styles = StyleSheet.create({
  text: { fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  screen: { flex: 1 },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 290 },
  screenContent: { paddingHorizontal: 16, paddingBottom: 130, gap: 10 },
  pageHeader: { minHeight: 92, paddingTop: 15, paddingBottom: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  pageHeaderCopy: { flex: 1 },
  largeTitle: { fontSize: 34, lineHeight: 36, letterSpacing: -1.2 },
  subtitle: { marginTop: 6, fontSize: 13, lineHeight: 18 },
  askButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', ...shadow },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.4 },
  previewPill: { alignSelf: 'flex-start', minHeight: 28, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10 },
  previewDot: { width: 7, height: 7, borderRadius: 4 },
  previewText: { fontSize: 12, lineHeight: 16 },
  card: { borderRadius: radius.card, padding: 16 },
  noticeCard: { paddingVertical: 11, shadowOpacity: 0 },
  noticeText: { fontSize: 13, lineHeight: 18 },
  sectionTitle: { fontSize: 17, lineHeight: 23, marginTop: 14, marginBottom: -2 },
  primaryButton: { minHeight: 54, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  secondaryButton: { minHeight: 48, borderRadius: radius.button, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  outlineButton: { minHeight: 48, borderRadius: radius.button, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 16, lineHeight: 20, textAlign: 'center' },
  choiceChip: { minHeight: 44, borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  choiceLabel: { fontSize: 14, lineHeight: 18, textAlign: 'center' },
  modality: { alignItems: 'center', justifyContent: 'center' },
  shieldLine: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  shieldText: { fontSize: 12, lineHeight: 16 },
  disclosure: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  disclosureTitle: { flex: 1, fontSize: 15, lineHeight: 20 },
  disclosureValue: { fontSize: 14, lineHeight: 19 },
});
