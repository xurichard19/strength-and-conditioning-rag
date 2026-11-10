import { StyleSheet } from 'react-native';

import { AppText, Card, SecondaryButton } from '@/components/ui';
import type { PlanningSchedule } from '@/services/backend';

/** Generation failures never send a paid member back through purchasing. */
export function InitialPlanStatus({ schedule, loading = false, error, retrying = false, onRetry, onRefresh }: {
  schedule: PlanningSchedule | null; loading?: boolean; error?: string | null; retrying?: boolean;
  onRetry: () => Promise<void>; onRefresh: () => Promise<void>;
}) {
  const status = schedule?.initial_plan_status;
  if (status === 'ready' || (!schedule && !loading && !error)) return null;
  const failed = status === 'failed';
  const title = failed ? 'Your first plan needs another try.' : status === 'running' ? 'Building your first plan.'
    : status === 'deferred' ? 'Your first plan is waiting to start.' : schedule ? 'Your first plan is queued.' : 'Checking your plan.';
  const detail = failed ? 'We could not finish preparing your plan. You can retry without purchasing again.'
    : status === 'deferred' ? 'Planning is temporarily delayed. We will keep checking and start when it is available.'
      : 'Your training plan will appear here when it is ready. You can leave this screen while we prepare it.';
  return <Card style={styles.card}>
    <AppText weight="medium" accessibilityRole="header" style={styles.title}>{title}</AppText>
    <AppText tone="secondary">{detail}</AppText>
    {error ? <AppText tone="secondary">{error}</AppText> : null}
    {failed && schedule?.initial_plan_job ? <SecondaryButton onPress={() => void onRetry()} loading={retrying} disabled={retrying}>
      Retry plan
    </SecondaryButton> : error || failed ? <SecondaryButton onPress={() => void onRefresh()} disabled={loading}>Check again</SecondaryButton> : null}
  </Card>;
}

const styles = StyleSheet.create({ card: { gap: 12 }, title: { fontSize: 21, lineHeight: 28, letterSpacing: -0.5 } });
