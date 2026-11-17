import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui';
import { useApp } from '@/state/app-context';
import { useSubscription } from '@/state/subscription-context';

/** A retryable warning outside the navigator keeps the current workout and its draft mounted. */
export function SubscriptionNotice() {
  const subscription = useSubscription();
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  if (!subscription.enabled || !subscription.hasAccess || !subscription.error) return null;
  const checking = subscription.loading || Boolean(subscription.busy);
  return <View style={[styles.notice, { backgroundColor: colors.card, borderTopColor: colors.separator,
    paddingBottom: Math.max(insets.bottom, 12) }]}>
    <AppText accessibilityLiveRegion="polite" style={styles.message}>
      {subscription.error} Some actions may be unavailable until the check succeeds.
    </AppText>
    <Pressable accessibilityRole="button" accessibilityLabel="Retry subscription check"
      accessibilityState={{ disabled: checking }} disabled={checking} style={styles.retry}
      onPress={() => void subscription.refresh()}>
      <AppText tone="tint" weight="medium">{checking ? 'Checking…' : 'Retry'}</AppText>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, gap: 12, borderTopWidth: StyleSheet.hairlineWidth },
  message: { flex: 1, fontSize: 13, lineHeight: 18 },
  retry: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
