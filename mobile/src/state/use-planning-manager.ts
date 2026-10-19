import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { shiftDays, type CalendarSnapshot } from '@/lib/calendar';
import { errorMessage } from '@/lib/errors';
import { backendFor } from '@/services/api';
import type { PlanningChange, PlanningJob, PlanningSchedule } from '@/services/backend';
import { useApp } from '@/state/app-context';

type State = {
  userId?: string; jobs: PlanningJob[]; changes: PlanningChange[]; jobsLoaded: boolean; loaded: boolean;
  loading: boolean; loadingMore: boolean; hasMore: boolean; error: string | null;
  fetchedAt: number; cacheVersion: number;
  schedule: PlanningSchedule | null; calendar: CalendarSnapshot | null; overviewLoaded: boolean; overviewError: string | null; checkedAt: number;
};
const empty: State = { jobs: [], changes: [], jobsLoaded: false, loaded: false, loading: false, loadingMore: false,
  hasMore: false, error: null, fetchedAt: -Infinity, cacheVersion: -1,
  schedule: null, calendar: null, overviewLoaded: false, overviewError: null, checkedAt: 0 };
type Action = 'focus' | 'refresh' | 'more' | 'poll';

/** Reuse fresh views for a minute; edits, manual refresh and active jobs bypass the TTL. */
export function usePlanningManager() {
  const { authSession, calendarCache } = useApp();
  const userId = authSession?.user.id;
  const [state, setState] = useState<State>(empty);
  const cached = useRef(empty);
  const actions = useRef<{ userId: string; load: (action: Action) => Promise<void> } | null>(null);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    const api = backendFor(userId);
    let visible = true;
    let foreground = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    let pending = false;
    let refreshOnResume = false;
    let snapshot = { ...(cached.current.userId === userId ? cached.current : empty), userId, loading: false, loadingMore: false };
    let timer: ReturnType<typeof setTimeout> | undefined;

    function publish() {
      cached.current = snapshot;
      setState(snapshot);
    }

    async function loadHistory(action: Action) {
      try {
        const history = await api.getPlanningHistory(action === 'more' ? snapshot.changes.at(-1)?.revision : undefined);
        if (!visible) return;
        const changes = action === 'refresh' || action === 'focus' ? history.changes : [...new Map([
          ...snapshot.changes, ...history.changes,
        ].map(change => [change.id, change])).values()].sort((a, b) => b.revision - a.revision);
        snapshot = { ...snapshot, changes, loaded: true,
          hasMore: action === 'poll' && snapshot.loaded ? snapshot.hasMore : history.changes.length === 20 };
      } catch (error) {
        if (!visible) return;
        snapshot = { ...snapshot, error: errorMessage(error, 'Could not load your plans.') };
      }
      publish();
    }

    async function loadOverview(force: boolean) {
      try {
        const schedule = await api.getPlanningSchedule();
        if (!visible) return;
        const changed = snapshot.schedule?.revision !== schedule?.revision
          || snapshot.schedule?.horizon_end !== schedule?.horizon_end || snapshot.schedule?.horizon_days !== schedule?.horizon_days;
        snapshot = { ...snapshot, schedule, overviewError: null, checkedAt: Date.now(),
          ...(changed ? { calendar: null, overviewLoaded: false } : {}) };
        publish();
        if (!schedule?.horizon_end) {
          snapshot = { ...snapshot, calendar: null };
        } else {
          const end = schedule.horizon_end;
          const start = shiftDays(end, 1 - Math.min(schedule.horizon_days, 31));
          const cached = calendarCache.peek(start, end);
          const calendar = await calendarCache.load(api, start, end, force || Boolean(cached && cached.data.revision !== schedule.revision));
          if (!visible) return;
          if (!calendar) throw new Error('Your plan changed while loading. Refresh to try again.');
          snapshot = { ...snapshot, calendar };
        }
        snapshot = { ...snapshot, overviewLoaded: true };
      } catch (error) {
        if (!visible) return;
        snapshot = { ...snapshot, overviewLoaded: false, overviewError: errorMessage(error, 'Could not load your current plan.') };
      }
      publish();
    }

    async function load(action: Action) {
      if (!visible || !foreground || pending || (action === 'more' && !snapshot.hasMore)) return;
      if (action === 'focus' && snapshot.loaded && snapshot.overviewLoaded && !snapshot.error && !snapshot.overviewError
          && !snapshot.jobs.some(job => job.status === 'pending' || job.status === 'running')
          && snapshot.cacheVersion === calendarCache.version && Date.now() - snapshot.fetchedAt < 60_000) return;
      clearTimeout(timer);
      pending = true;
      refreshOnResume = false;
      const cacheVersion = calendarCache.version;
      snapshot = { ...snapshot, loading: action === 'refresh' || !snapshot.loaded, loadingMore: action === 'more', error: null,
        ...(action !== 'more' ? { fetchedAt: -Infinity } : {}) };
      publish();
      try {
        // Read history and coverage after jobs so a completed job's publication cannot be missed.
        const jobs = action === 'more' ? snapshot.jobs : await api.getPlanningJobs();
        if (!visible) return;
        // Activity should appear without waiting for the slower history read.
        snapshot = { ...snapshot, jobs, jobsLoaded: true };
        publish();
        await Promise.all([loadHistory(action), action !== 'more' && loadOverview(action === 'refresh')]);
        if (action !== 'more' && !snapshot.error && snapshot.overviewLoaded) snapshot = { ...snapshot, fetchedAt: Date.now(), cacheVersion };
      } catch (error) {
        snapshot = { ...snapshot, error: errorMessage(error, 'Could not load your plans.') };
      } finally {
        pending = false;
        if (visible) {
          snapshot = { ...snapshot, loading: false, loadingMore: false };
          publish();
          if (foreground && (refreshOnResume || cacheVersion !== calendarCache.version)) void load('poll');
          else if (foreground && snapshot.jobs.some(job => job.status === 'pending' || job.status === 'running')) {
            timer = setTimeout(() => void load('poll'), 10_000);
          }
        }
      }
    }

    actions.current = { userId, load };
    publish();
    void load('focus');
    const listener = AppState.addEventListener('change', status => {
      foreground = status === 'active';
      clearTimeout(timer);
      if (foreground) {
        if (pending) refreshOnResume = true;
        else void load('focus');
      }
    });
    return () => {
      visible = false;
      clearTimeout(timer);
      listener.remove();
      actions.current = null;
    };
  }, [calendarCache, userId]));

  const run = async (action: Action) => {
    if (actions.current?.userId === userId) await actions.current?.load(action);
  };
  const current = state.userId === userId ? state : { ...empty, loading: Boolean(userId) };
  return { ...current, error: userId ? current.error : 'Sign in to see your plans.',
    refresh: () => run('refresh'), loadMore: () => run('more') };
}
