import { ArrowLeft, ArrowUpRight, ChevronRight, Clock3, History, Layers3 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ActionSheet } from '@/components/action-sheet';
import { AppText, Card, Screen, SecondaryButton } from '@/components/ui';
import { calendarLabel, calendarSnapshot, shiftDays, type CalendarSnapshot } from '@/lib/calendar';
import { backendFor } from '@/services/api';
import type { CalendarWorkout, PlanningChange, PlanningChangePreview, PlanningJob, PlanningSchedule } from '@/services/backend';
import { useApp } from '@/state/app-context';
import { usePlanningManager } from '@/state/use-planning-manager';

const day = (date: string) => calendarLabel(date, { month: 'short', day: 'numeric' });
const timestamp = (date: string) => new Date(date).toLocaleString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});
const reasons: Record<string, string> = {
  'scheduled refresh': 'Scheduled plan refresh',
  'sport schedule changed': 'Your sports schedule changed',
  'onboarding answers changed': 'Your training preferences changed',
};
const changeLabels = { applied: 'Applied', undone: 'Undone', discarded: 'Discarded' };
const changeKind = (change: PlanningChange) => change.kind === 'adjustment' ? 'Plan adjustment'
  : change.horizon_end_before ? 'Plan refresh' : 'First plan';
const changeTitle = (change: PlanningChange) => change.kind === 'adjustment' ? 'Your plan, adjusted.'
  : change.horizon_end_before ? 'More training, planned.' : 'Your starting point.';

function JobCard({ job }: { job: PlanningJob }) {
  const { colors } = useApp();
  const running = job.status === 'running';
  return <Card style={styles.stack}>
    <View style={styles.row}>
      {running ? <ActivityIndicator color={colors.tintText} /> : <Clock3 size={19} color={colors.tintText} />}
      <AppText weight="medium" style={styles.grow}>{running ? 'Updating your plan' : 'Update queued'}</AppText>
      <AppText tone="tint" style={styles.caption}>{running ? 'In progress' : 'Queued'}</AppText>
    </View>
    <AppText tone="secondary" style={styles.body}>{reasons[job.reason] ?? job.reason}</AppText>
    {job.scheduled_for && !running ? <AppText tone="secondary" style={styles.caption}>
      Scheduled for {timestamp(job.scheduled_for)}
    </AppText> : null}
  </Card>;
}

/** Read counts from saved calendar entries, never the illustrative copy in the mockup. */
function PlanOverview({ schedule, calendar, checkedAt, compact = false }: {
  schedule: PlanningSchedule; calendar: CalendarSnapshot | null; checkedAt: number; compact?: boolean;
}) {
  const { colors } = useApp();
  const [week, setWeek] = useState(0);
  const end = schedule.horizon_end;
  const days = Math.min(schedule.horizon_days, 31);
  const start = end ? shiftDays(end, 1 - days) : null;
  const weeks = Math.ceil(days / 7);
  const selected = Math.min(week, weeks - 1);
  const from = start ? shiftDays(start, selected * 7) : null;
  const through = from && end ? [shiftDays(from, 6), end].sort()[0] : null;
  const entries = calendar?.entries.filter(entry => from && through && entry.date >= from && entry.date <= through) ?? [];
  const workouts = entries.filter(entry => entry.kind === 'workout');
  const sports = entries.filter(entry => entry.kind === 'sport');
  const sportNames = [...new Set(sports.map(entry => entry.title))].join(', ');
  const today = new Date(checkedAt - new Date(checkedAt).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const expired = Boolean(end && end < today);
  const due = Date.parse(schedule.next_refresh_at) <= checkedAt;
  const cadence = schedule.refresh_interval_days === 7 ? 'refreshes weekly' : `refreshes every ${schedule.refresh_interval_days} days`;
  return <Card style={[styles.hero, { backgroundColor: colors.tintSoft, borderColor: colors.tintSoft }]}>
    <View style={styles.between}>
      <AppText tone="tint" weight="medium" style={styles.eyebrow}>{expired ? 'PAST COVERAGE' : 'YOUR TRAINING PLAN'}</AppText>
      <Layers3 size={19} color={colors.tintText} strokeWidth={1.5} />
    </View>
    <AppText style={compact ? styles.heading : styles.heroTitle}>{expired ? 'Ready for a refresh.' : 'Training, with room to adapt.'}</AppText>
    <AppText>{end ? `Planned through ${calendarLabel(end, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Your first plan has not been published yet.'}</AppText>
    <AppText tone="secondary" style={styles.caption}>{schedule.horizon_days % 7 === 0 ? `${schedule.horizon_days / 7} weeks` : `${schedule.horizon_days} days`} · {cadence}</AppText>
    {!compact && from && through ? <>
      <View style={[styles.weekPicker, { backgroundColor: colors.card }]}>
        {Array.from({ length: weeks }, (_, index) => <Pressable key={index} accessibilityRole="button"
          accessibilityLabel={`Plan week ${index + 1}`} accessibilityState={{ selected: index === selected }}
          onPress={() => setWeek(index)} style={[styles.week, index === selected && { backgroundColor: colors.tintSoft }]}>
          <AppText tone={index === selected ? 'tint' : 'secondary'} weight="medium" style={styles.caption}>Week {index + 1}</AppText>
        </Pressable>)}
      </View>
      <View accessibilityLiveRegion="polite" style={styles.stack}>
        <AppText weight="medium" style={styles.body}>{day(from)} – {day(through)}</AppText>
        {calendar ? <>
          <AppText style={styles.body}>{workouts.length} training {workouts.length === 1 ? 'session' : 'sessions'} · {sports.length} sports {sports.length === 1 ? 'session' : 'sessions'}</AppText>
          {sportNames ? <AppText tone="secondary" style={styles.body}>{sportNames} on your schedule.</AppText> : null}
        </> : <AppText tone="secondary" style={styles.body}>Session summary unavailable.</AppText>}
      </View>
    </> : null}
    {!compact ? <View style={[styles.footer, { borderTopColor: colors.controlBorder }]}>
      <AppText tone="secondary" style={styles.caption}>{due ? 'Refresh due' : 'Next refresh'}</AppText>
      <AppText weight="medium" style={styles.caption}>{new Date(schedule.next_refresh_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</AppText>
    </View> : null}
  </Card>;
}

function ChangeCard({ change, onPress }: { change: PlanningChange; onPress: () => void }) {
  const { colors } = useApp();
  return <Pressable accessibilityRole="button" accessibilityLabel={`View plan update ${change.revision}. ${changeKind(change)}. ${changeLabels[change.status]}. ${reasons[change.reason] ?? change.reason}. ${calendarLabel(change.effective_from, { dateStyle: 'long' })} to ${calendarLabel(change.effective_through, { dateStyle: 'long' })}.`}
    onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
    <Card style={styles.stack}>
      <View style={styles.between}>
        <AppText tone="tint" weight="medium" style={styles.eyebrow}>{changeKind(change).toUpperCase()}</AppText>
        <AppText tone="secondary" style={styles.caption}>{changeLabels[change.status]} · V{change.revision}</AppText>
      </View>
      <AppText weight="medium" style={styles.heading}>{changeTitle(change)}</AppText>
      <AppText tone="secondary" style={styles.body}>{reasons[change.reason] ?? change.reason}</AppText>
      <AppText style={styles.body}>{day(change.effective_from)} – {day(change.effective_through)}</AppText>
      <View style={[styles.footer, { borderTopColor: colors.separator }]}>
        <AppText tone="tint" weight="medium" style={styles.caption}>See what changed</AppText>
        <ChevronRight size={17} color={colors.textSecondary} />
      </View>
    </Card>
  </Pressable>;
}

/** Preserve historical prescriptions even when a workout is now superseded. */
function WorkoutList({ title, workouts }: { title: string; workouts: CalendarWorkout[] }) {
  const { colors } = useApp();
  const entries = calendarSnapshot({ workouts: workouts.map(workout => ({ ...workout, superseded_at: null })), sports_workouts: [], revision: null }).entries;
  return <View style={styles.stack}>
    <AppText tone="tint" weight="medium" style={styles.eyebrow}>{title}</AppText>
    {entries.length ? entries.map(workout => <View key={workout.id} style={[styles.detailWorkout, { borderColor: colors.separator }]}>
      <AppText weight="medium">{workout.title}</AppText>
      <AppText tone="secondary" style={styles.caption}>{calendarLabel(workout.date, { dateStyle: 'full' })}</AppText>
      {workout.notes ? <AppText tone="secondary" style={styles.body}>{workout.notes}</AppText> : null}
      {workout.exercises?.map(exercise => <View key={exercise.id} style={styles.exercise}>
        <AppText weight="medium" style={styles.body}>{exercise.name}</AppText>
        {exercise.prescriptions.map((target, index) => <AppText key={index} tone="secondary" style={styles.caption}>{target}</AppText>)}
        {exercise.notes ? <AppText tone="secondary" style={styles.caption}>{exercise.notes}</AppText> : null}
      </View>)}
    </View>) : <AppText tone="secondary" style={styles.body}>No workouts in this part of the update.</AppText>}
  </View>;
}

/** Keep one preview cached; ignore requests after closing, switching accounts, or unmounting. */
function ChangeDetails({ change, userId, visible, onClose }: {
  change: PlanningChange; userId: string; visible: boolean; onClose: () => void;
}) {
  const { colors } = useApp();
  const [preview, setPreview] = useState<PlanningChangePreview | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!visible || preview) return;
    let current = true;
    void backendFor(userId).getPlanningChange(change.id).then(value => {
      if (current) setPreview(value);
    }).catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [change.id, userId, visible, attempt, preview]);
  if (!visible) return null;
  return <ActionSheet title={changeKind(change)} onClose={() => { setError(false); onClose(); }}>
    <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent}>
      <AppText tone="secondary" style={styles.caption}>Version {change.revision} · {changeLabels[change.status]} · {timestamp(change.created_at)}</AppText>
      <AppText>{reasons[change.reason] ?? change.reason}</AppText>
      <AppText tone="secondary" style={styles.body}>Only workouts affected by this update are shown. This is a historical record, not the full current plan.</AppText>
      {error ? <>
        <AppText tone="secondary">Could not load this update.</AppText>
        <SecondaryButton onPress={() => { setError(false); setAttempt(value => value + 1); }}>Retry details</SecondaryButton>
      </> : !preview ? <ActivityIndicator accessibilityLabel="Loading plan details" color={colors.tintText} /> : <>
        <WorkoutList title="BEFORE" workouts={preview.before} />
        <WorkoutList title="AFTER" workouts={preview.after} />
      </>}
    </ScrollView>
  </ActionSheet>;
}

function PlansContent({ userId }: { userId: string }) {
  const { colors } = useApp();
  const { jobs, changes, schedule, calendar, overviewLoaded, overviewError, checkedAt,
    loading, loadingMore, hasMore, jobsLoaded, loaded, error, refresh, loadMore } = usePlanningManager();
  const [timeline, setTimeline] = useState(false);
  const [adjustmentsOnly, setAdjustmentsOnly] = useState(false);
  const [detail, setDetail] = useState<{ change: PlanningChange; visible: boolean } | null>(null);
  const open = (change: PlanningChange) => setDetail({ change, visible: true });
  const latest = changes[0];
  const filtered = changes.filter(change => !adjustmentsOnly || change.kind === 'adjustment');
  return <>
    <Screen key={String(timeline)} title={timeline ? 'Plan history' : 'Your plan'} subtitle={timeline ? 'Every adjustment, in one place.' : 'Built around the way you train.'}
      preview={false} onRefresh={refresh} refreshing={loading && loaded}>
      {timeline ? <Pressable accessibilityRole="button" accessibilityLabel="Back to plan overview" onPress={() => setTimeline(false)} style={styles.back}>
        <ArrowLeft size={17} color={colors.tintText} /><AppText tone="tint" weight="medium" style={styles.body}>Your plan</AppText>
      </Pressable> : null}
      {error || overviewError ? <Card style={styles.stack}>
        <AppText tone="secondary">{error || overviewError}</AppText>
        {loaded || overviewLoaded ? <AppText tone="secondary" style={styles.caption}>Showing the last loaded data. It may be out of date.</AppText> : null}
        <SecondaryButton onPress={() => void refresh()} disabled={loading}>Retry</SecondaryButton>
      </Card> : null}
      {!loaded && !error ? <ActivityIndicator accessibilityLabel="Loading plans" color={colors.tintText} /> : null}
      {schedule ? <PlanOverview schedule={schedule} calendar={calendar} checkedAt={checkedAt} compact={timeline} /> : overviewLoaded ? <Card style={styles.stack}>
        <AppText style={styles.heading}>Your plan starts here.</AppText>
        <AppText tone="secondary">Complete onboarding to set up your training plan.</AppText>
      </Card> : null}
      {jobs.map(job => <JobCard key={job.id} job={job} />)}
      {jobsLoaded && !jobs.length ? <AppText tone="secondary" style={[styles.caption, { textAlign: 'center' }]}>
        No plan updates in progress.
      </AppText> : null}
      {timeline ? <>
        <View style={styles.row}>
          {['All updates', 'Adjustments'].map((label, index) => <Pressable key={label} accessibilityRole="button"
            accessibilityLabel={label} accessibilityState={{ selected: adjustmentsOnly === Boolean(index) }}
            onPress={() => setAdjustmentsOnly(Boolean(index))}
            style={[styles.filter, { backgroundColor: adjustmentsOnly === Boolean(index) ? colors.tintSoft : colors.card }]}>
            <AppText tone={adjustmentsOnly === Boolean(index) ? 'tint' : 'secondary'} weight="medium" style={styles.caption}>{label}</AppText>
          </Pressable>)}
        </View>
        {filtered.map(change => <View key={change.id} style={styles.timelineRow}>
          <View style={styles.rail}><View style={[styles.timelineDot, { backgroundColor: change.status === 'applied' ? colors.tintText : colors.textSecondary }]} />
            <View style={[styles.line, { backgroundColor: colors.separator }]} />
          </View>
          <View style={[styles.grow, styles.stack]}>
            <AppText tone="secondary" style={styles.caption}>{timestamp(change.created_at)}</AppText>
            <ChangeCard change={change} onPress={() => open(change)} />
          </View>
        </View>)}
        {loaded && !filtered.length ? <AppText tone="secondary">{changes.length ? 'No adjustments in the loaded history.' : 'No plan history yet. Your first plan will appear here once it is ready.'}</AppText> : null}
        {hasMore ? <SecondaryButton onPress={() => void loadMore()} loading={loadingMore} disabled={loading}>Load older updates</SecondaryButton> : null}
      </> : <>
        <View style={styles.between}><AppText weight="medium" style={styles.sectionTitle}>Latest update</AppText><History size={18} color={colors.textSecondary} /></View>
        {latest ? <ChangeCard change={latest} onPress={() => open(latest)} /> : loaded ? <Card>
          <AppText tone="secondary">No plan history yet. Your first plan will appear here once it is ready.</AppText>
        </Card> : null}
        <View style={styles.between}>
          <AppText weight="medium" style={styles.sectionTitle}>Plan history</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="View all plan history" onPress={() => setTimeline(true)} style={styles.textAction}>
            <AppText tone="tint" weight="medium" style={styles.body}>View all</AppText><ArrowUpRight size={16} color={colors.tintText} />
          </Pressable>
        </View>
        {changes.slice(1, 3).map(change => <Pressable key={change.id} accessibilityRole="button" accessibilityLabel={`View plan update ${change.revision}`}
          onPress={() => open(change)} style={[styles.historyRow, { borderBottomColor: colors.separator }]}>
          <View style={[styles.grow, styles.stack]}><AppText weight="medium" style={styles.body}>{changeKind(change)} · V{change.revision}</AppText>
            <AppText tone="secondary" style={styles.caption}>{timestamp(change.created_at)} · {changeLabels[change.status]}</AppText>
          </View><ChevronRight size={18} color={colors.textSecondary} />
        </Pressable>)}
      </>}
    </Screen>
    {detail ? <ChangeDetails key={`${detail.change.id}:${detail.change.status}`} change={detail.change} userId={userId} visible={detail.visible}
      onClose={() => setDetail(current => current && { ...current, visible: false })} /> : null}
  </>;
}

export default function PlansScreen() {
  const { authSession } = useApp();
  const userId = authSession?.user.id;
  return userId ? <PlansContent key={userId} userId={userId} /> : <Screen title="Your plan" preview={false}>
    <Card><AppText tone="secondary">Sign in to view your plans.</AppText></Card>
  </Screen>;
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  grow: { flex: 1, minWidth: 0 },
  hero: { padding: 24, borderRadius: 24, gap: 12 },
  heroTitle: { fontSize: 30, lineHeight: 36, letterSpacing: -1 },
  heading: { fontSize: 21, lineHeight: 28, letterSpacing: -0.5 },
  sectionTitle: { fontSize: 18, lineHeight: 25, letterSpacing: -0.3 },
  body: { fontSize: 14, lineHeight: 22 },
  caption: { fontSize: 12, lineHeight: 18 },
  eyebrow: { fontSize: 10, lineHeight: 16, letterSpacing: 1.1 },
  weekPicker: { flexDirection: 'row', borderRadius: 13, padding: 4, marginVertical: 6, flexWrap: 'wrap' },
  week: { flex: 1, minWidth: 65, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 10, padding: 6 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 6 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, alignSelf: 'flex-start' },
  textAction: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 4 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 18 },
  filter: { minHeight: 44, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 22 },
  timelineRow: { flexDirection: 'row', gap: 14 },
  rail: { width: 10, alignItems: 'center' },
  timelineDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  line: { width: StyleSheet.hairlineWidth, flex: 1, marginTop: 8 },
  detailScroll: { flexShrink: 1 },
  detailContent: { gap: 20, paddingVertical: 16, paddingBottom: 28 },
  detailWorkout: { gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 16 },
  exercise: { gap: 4, paddingTop: 6 },
  pressed: { opacity: 0.7 },
});
