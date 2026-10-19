import { ChevronDown, ChevronUp, Clock3 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen, SectionTitle, SecondaryButton } from '@/components/ui';
import { calendarLabel } from '@/lib/calendar';
import { backendFor } from '@/services/api';
import type { PlanningChange, PlanningChangePreview, PlanningJob } from '@/services/backend';
import { useApp } from '@/state/app-context';
import { usePlanningManager } from '@/state/use-planning-manager';

const day = (date: string) => calendarLabel(date, { month: 'short', day: 'numeric', year: 'numeric' });
const timestamp = (date: string) => new Date(date).toLocaleString('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});
const kindLabel = (kind: PlanningJob['kind']) => kind === 'refresh' ? 'Plan refresh' : 'Plan update';
const reasons: Record<string, string> = {
  'scheduled refresh': 'Scheduled plan refresh',
  'sport schedule changed': 'Your sports schedule changed',
  'onboarding answers changed': 'Your training preferences changed',
};
const changeLabels: Record<PlanningChange['status'], string> = { applied: 'Applied', undone: 'Undone', discarded: 'Discarded' };

function JobCard({ job }: { job: PlanningJob }) {
  const { colors } = useApp();
  const running = job.status === 'running';
  return <Card style={styles.card}>
    <View style={styles.row}>
      {running ? <ActivityIndicator color={colors.tintText} /> : <Clock3 size={19} color={colors.tintText} />}
      <AppText weight="medium" style={styles.grow}>{kindLabel(job.kind)}</AppText>
      <AppText tone="tint" style={styles.caption}>{running ? 'In progress' : 'Queued'}</AppText>
    </View>
    <AppText>{reasons[job.reason] ?? job.reason}</AppText>
    {job.effective_from && job.effective_through ? <AppText tone="secondary" style={styles.caption}>
      {day(job.effective_from)} – {day(job.effective_through)}
    </AppText> : null}
    {job.scheduled_for && !running ? <AppText tone="secondary" style={styles.caption}>
      Scheduled for {timestamp(job.scheduled_for)}
    </AppText> : null}
  </Card>;
}

/** Fetch affected workouts on first expansion; ignore responses after closing or unmounting. */
function ChangeCard({ change, userId }: { change: PlanningChange; userId: string }) {
  const { colors } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<PlanningChangePreview | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!expanded || preview) return;
    let current = true;
    void backendFor(userId).getPlanningChange(change.id).then(value => {
      if (current) setPreview(value);
    }).catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [change.id, userId, expanded, attempt, preview]);
  const Chevron = expanded ? ChevronUp : ChevronDown;
  const workouts = preview?.after.length ? preview.after : preview?.before ?? [];

  return <Card style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`View plan update ${change.revision}. ${kindLabel(change.kind)}. ${changeLabels[change.status]}. ${reasons[change.reason] ?? change.reason}. ${day(change.effective_from)} to ${day(change.effective_through)}.`}
      accessibilityState={{ expanded }} onPress={() => {
        setError(false); setExpanded(value => !value);
      }} style={styles.card}>
      <View style={styles.row}>
        <AppText weight="medium" style={styles.grow}>{kindLabel(change.kind)}</AppText>
        <AppText tone={change.status === 'applied' ? 'tint' : 'secondary'} style={styles.caption}>{changeLabels[change.status]}</AppText>
        <Chevron size={18} color={colors.textSecondary} />
      </View>
      <AppText>{reasons[change.reason] ?? change.reason}</AppText>
      <AppText tone="secondary" style={styles.caption}>{day(change.effective_from)} – {day(change.effective_through)}</AppText>
      <AppText tone="secondary" style={styles.caption}>Version {change.revision} · {timestamp(change.created_at)}</AppText>
    </Pressable>
    {expanded ? <View style={[styles.details, { borderTopColor: colors.separator }]}>
      {error ? <>
        <AppText tone="secondary">Could not load this update.</AppText>
        <SecondaryButton onPress={() => { setError(false); setAttempt(value => value + 1); }}>Retry details</SecondaryButton>
      </> : !preview ? <ActivityIndicator accessibilityLabel="Loading plan details" color={colors.tintText} /> : <>
        <AppText weight="medium">{!preview.after.length && preview.before.length ? 'Workouts removed by this update' : 'Workouts from this update'}</AppText>
        <AppText tone="secondary" style={styles.caption}>Only workouts affected by this update are shown.</AppText>
        {workouts.length ? workouts.map(workout => <View key={workout.id} style={styles.workout}>
          <AppText weight="medium">{workout.name}</AppText>
          <AppText tone="secondary" style={styles.caption}>{day(workout.scheduled_date)}</AppText>
          {workout.exercises.length ? <AppText tone="secondary" style={styles.caption}>{workout.exercises.map(exercise => exercise.name).join(' · ')}</AppText> : null}
        </View>) : <AppText tone="secondary">No workouts changed in this update.</AppText>}
      </>}
    </View> : null}
  </Card>;
}

function PlansContent({ userId }: { userId: string }) {
  const { colors } = useApp();
  const { jobs, changes, loading, loadingMore, hasMore, jobsLoaded, loaded, error, refresh, loadMore } = usePlanningManager();
  return <Screen title="Plan manager" subtitle="Follow your plan updates." preview={false}
    onRefresh={refresh} refreshing={loading && loaded}>
    {error ? <Card style={styles.card}>
      <AppText tone="secondary">{error}</AppText>
      {loaded ? <AppText tone="secondary" style={styles.caption}>Showing the last loaded activity and history. They may be out of date.</AppText> : null}
      <SecondaryButton onPress={() => void refresh()} disabled={loading}>Retry</SecondaryButton>
    </Card> : null}
    {!loaded && !error ? <ActivityIndicator accessibilityLabel="Loading plans" color={colors.tintText} /> : null}
    <SectionTitle>Current activity</SectionTitle>
    {jobs.map(job => <JobCard key={job.id} job={job} />)}
    {jobsLoaded && !jobs.length ? <Card><AppText tone="secondary">No plan updates in progress.</AppText></Card> : null}
    <SectionTitle>Plan history</SectionTitle>
    {changes.map(change => <ChangeCard key={`${change.id}:${change.status}`} change={change} userId={userId} />)}
    {loaded && !changes.length ? <Card><AppText tone="secondary">No plan history yet. Your first plan will appear here once it is ready.</AppText></Card> : null}
    {hasMore ? <SecondaryButton onPress={() => void loadMore()} loading={loadingMore} disabled={loading}>Load older updates</SecondaryButton> : null}
  </Screen>;
}

export default function PlansScreen() {
  const { authSession } = useApp();
  const userId = authSession?.user.id;
  // Remount account-owned history and pending detail reads when the signed-in user changes.
  return userId ? <PlansContent key={userId} userId={userId} /> : <Screen title="Plan manager" preview={false}>
    <Card><AppText tone="secondary">Sign in to view your plans.</AppText></Card>
  </Screen>;
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  caption: { fontSize: 12, lineHeight: 18 },
  details: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 10 },
  workout: { gap: 3, paddingVertical: 5 },
});
