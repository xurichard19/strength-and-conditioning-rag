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
  schedule: PlanningSchedule | null; calendar: CalendarSnapshot | null; overviewLoaded: boolean; overviewError: string | null; checkedAt: number;
};
const empty: State = { jobs: [], changes: [], jobsLoaded: false, loaded: false, loading: false, loadingMore: false,
  hasMore: false, error: null, schedule: null, calendar: null, overviewLoaded: false, overviewError: null, checkedAt: 0 };
type Action = 'refresh' | 'more' | 'poll';

/** Retain the last view on focus/resume; poll unfinished jobs only while visible. */
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
        const changes = action === 'refresh' ? history.changes : [...new Map([
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
        } else if (force || changed || !snapshot.calendar) {
          const end = schedule.horizon_end;
          const start = shiftDays(end, 1 - Math.min(schedule.horizon_days, 31));
          if (changed) calendarCache.invalidate();
          const calendar = await calendarCache.load(api, start, end, force && !changed);
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
      clearTimeout(timer);
      pending = true;
      refreshOnResume = false;
      snapshot = { ...snapshot, loading: action === 'refresh', loadingMore: action === 'more', error: null };
      publish();
      try {
        // Read history and coverage after jobs so a completed job's publication cannot be missed.
        const jobs = action === 'more' ? snapshot.jobs : await api.getPlanningJobs();
        if (!visible) return;
        // Activity should appear without waiting for the slower history read.
        snapshot = { ...snapshot, jobs, jobsLoaded: true };
        publish();
        await Promise.all([loadHistory(action), action !== 'more' && loadOverview(action === 'refresh')]);
      } catch (error) {
        snapshot = { ...snapshot, error: errorMessage(error, 'Could not load your plans.') };
      } finally {
        pending = false;
        if (visible) {
          snapshot = { ...snapshot, loading: false, loadingMore: false };
          publish();
          if (foreground && refreshOnResume) void load('refresh');
          else if (foreground && snapshot.jobs.some(job => job.status === 'pending' || job.status === 'running')) {
            timer = setTimeout(() => void load('poll'), 10_000);
          }
        }
      }
    }

    actions.current = { userId, load };
    publish();
    void load('refresh');
    const listener = AppState.addEventListener('change', status => {
      foreground = status === 'active';
      clearTimeout(timer);
      if (foreground) {
        if (pending) refreshOnResume = true;
        else void load('refresh');
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
