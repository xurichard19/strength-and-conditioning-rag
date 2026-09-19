import { router, useFocusEffect } from 'expo-router';
import {
  ChevronRight,
  Dumbbell,
  Moon,
  ShieldCheck,
  Sparkles,
  Timer,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { fonts, radius, type Palette } from '@/design/tokens';
import type { Modality } from '@/domain/types';
import { errorMessage } from '@/lib/errors';
import { useApp } from '@/state/app-context';

type Tone = 'default' | 'secondary' | 'tint' | 'inverse';

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

const modalityColorKeys: Record<Modality | 'intervals', keyof Pick<Palette, 'strength' | 'endurance' | 'textSecondary' | 'intervals' | 'mixed'>> = {
  strength: 'strength',
  endurance: 'endurance',
  mixed: 'mixed',
  rest: 'textSecondary',
  intervals: 'intervals',
};

export function AppText({
  children,
  style,
  tone = 'default',
  weight = 'regular',
  ...props
}: TextProps & {
  tone?: Tone;
  weight?: keyof typeof fonts;
}) {
  const { colors } = useApp();
  return (
    <Text {...props} style={[styles.text, { color: colors[toneColorKeys[tone]], fontFamily: fonts[weight] }, style]}>
      {children}
    </Text>
  );
}

export function Screen({
  title,
  subtitle,
  context,
  children,
  contentContainerStyle,
  scrollProps,
  onRefresh,
  refreshing: externalRefreshing = false,
  preview,
}: {
  title: string;
  subtitle?: string;
  context?: string;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollProps?: ScrollViewProps;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;
  preview?: boolean;
}) {
  const { colors, notice, previewMode } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refreshPending = useRef(false);
  const entrance = useSharedValue(1);
  useFocusEffect(useCallback(() => {
    entrance.set(0);
    entrance.set(withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }));
    return () => cancelAnimation(entrance);
  }, [entrance]));
  const entranceStyle = useAnimatedStyle(() => ({
    opacity: 0.65 + entrance.get() * 0.35,
    transform: [{ translateY: (1 - entrance.get()) * 12 }],
  }));
  const refreshingContent = refreshing || externalRefreshing;
  const refresh = async () => {
    if (!onRefresh || refreshPending.current) return;
    refreshPending.current = true;
    setRefreshing(true); setRefreshError(null);
    try { await onRefresh(); }
    catch (error) { setRefreshError(errorMessage(error, 'Could not refresh this page. Pull down to retry.')); }
    finally { refreshPending.current = false; setRefreshing(false); }
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={Boolean(onRefresh)}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshingContent} onRefresh={refresh}
          tintColor={colors.tint} colors={[colors.tint]} progressBackgroundColor={colors.card} /> : undefined}
        contentContainerStyle={[styles.screenContent, contentContainerStyle]}
        style={refreshingContent ? styles.refreshingContent : undefined}
        accessibilityState={{ busy: refreshingContent }}
        {...scrollProps}>
        <Animated.View style={[styles.pageHeader, entranceStyle]}>
          <View style={styles.pageHeaderCopy}>
            <AppText tone="tint" weight="medium" style={styles.brandLabel}>ARCEL</AppText>
            <AppText style={styles.largeTitle}>{title}</AppText>
            {subtitle ? <AppText tone="secondary" style={styles.subtitle}>{subtitle}</AppText> : null}
          </View>
          {context ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ask Arcel"
              onPress={() => router.push({ pathname: '/(tabs)/chat', params: { context } })}
              style={({ pressed }) => [styles.askButton, { backgroundColor: colors.card, borderColor: colors.separator }, pressed && styles.pressed]}>
              <Sparkles color={colors.tintText} size={20} strokeWidth={1.6} />
            </Pressable>
          ) : null}
        </Animated.View>
        {(preview ?? previewMode) ? (
          <View style={styles.previewPill}>
            <View style={[styles.previewDot, { backgroundColor: colors.textTertiary }]} />
              <AppText tone="secondary" style={styles.previewText}>Training preview · not synced</AppText>
          </View>
        ) : null}
        {refreshError || notice ? (
          <Card style={styles.noticeCard}>
            <AppText tone="secondary" style={styles.noticeText}>{refreshError || notice}</AppText>
          </Card>
        ) : null}
        <Animated.View style={[styles.sections, entranceStyle]}>{children}</Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useApp();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <AppText weight="medium" style={styles.sectionTitle}>{children}</AppText>;
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
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      {...props}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: colors.strong },
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}>
      {loading ? <ActivityIndicator color={colors.strongText} /> : <AppText tone="inverse" weight="medium" style={styles.buttonText}>{children}</AppText>}
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
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      {...props}
      style={({ pressed }) => [styles.secondaryButton, { backgroundColor: colors.fill, borderColor: colors.separator }, pressed && styles.pressed, (disabled || loading) && styles.disabled, style]}>
      {loading ? <ActivityIndicator color={colors.text} /> : <>{Icon ? <Icon size={18} color={colors.text} strokeWidth={1.8} /> : null}<AppText weight="medium" style={styles.buttonText}>{children}</AppText></>}
    </Pressable>
  );
}

export function OutlineButton({ children, style, disabled, ...props }: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      {...props}
      style={({ pressed }) => [styles.outlineButton, { backgroundColor: colors.card, borderColor: colors.separator }, pressed && styles.pressed, style, disabled && styles.disabled]}>
      <AppText weight="medium" style={styles.buttonText}>{children}</AppText>
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
        { backgroundColor: selected ? colors.strong : colors.card, borderColor: selected ? colors.strong : colors.separator },
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
  const iconColor = colors[modalityColorKeys[modality]];
  return (
    <View style={[styles.modality, { width: size, height: size, borderRadius: 12, backgroundColor: colors.fill }]}>
      <Icon color={iconColor} size={Math.round(size * 0.48)} strokeWidth={1.65} />
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
        <View style={styles.rowIcon}>
          <Icon color={colors.tintText} size={17} strokeWidth={1.8} />
        </View>
      ) : null}
      <AppText weight="medium" style={styles.disclosureTitle}>{title}</AppText>
      {value ? <AppText tone="secondary" style={styles.disclosureValue}>{value}</AppText> : null}
      {onPress ? <ChevronRight color={colors.textTertiary} size={17} /> : null}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>{content}</Pressable> : content;
}

const styles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 22, letterSpacing: -0.15 },
  screen: { flex: 1 },
  screenContent: { paddingHorizontal: 22, paddingBottom: 40, gap: 16 },
  sections: { gap: 14 },
  refreshingContent: { opacity: 0.55 },
  pageHeader: { minHeight: 122, paddingTop: 24, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 16 },
  pageHeaderCopy: { flex: 1 },
  brandLabel: { fontSize: 10, lineHeight: 15, letterSpacing: 2.3, marginBottom: 10 },
  largeTitle: { fontSize: 38, lineHeight: 43, letterSpacing: -1.6 },
  subtitle: { marginTop: 8, fontSize: 13, lineHeight: 19 },
  askButton: { width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.4 },
  previewPill: { alignSelf: 'flex-start', minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 7 },
  previewDot: { width: 4, height: 4, borderRadius: 2 },
  previewText: { fontSize: 11, lineHeight: 16 },
  card: { borderRadius: radius.card, padding: 18, borderWidth: StyleSheet.hairlineWidth },
  noticeCard: { paddingVertical: 11, shadowOpacity: 0 },
  noticeText: { fontSize: 13, lineHeight: 18 },
  sectionTitle: { fontSize: 19, lineHeight: 25, letterSpacing: -0.5, marginTop: 16, marginBottom: 0 },
  primaryButton: { minHeight: 54, borderRadius: radius.capsule, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  secondaryButton: { minHeight: 50, borderRadius: radius.capsule, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  outlineButton: { minHeight: 48, borderRadius: radius.button, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  choiceChip: { minHeight: 44, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  choiceLabel: { fontSize: 14, lineHeight: 18, textAlign: 'center' },
  modality: { alignItems: 'center', justifyContent: 'center' },
  shieldLine: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  shieldText: { flexShrink: 1, fontSize: 12, lineHeight: 16 },
  disclosure: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 11 },
  rowIcon: { width: 26, height: 32, alignItems: 'center', justifyContent: 'center' },
  disclosureTitle: { flex: 1, fontSize: 15, lineHeight: 20 },
  disclosureValue: { fontSize: 14, lineHeight: 19 },
});
