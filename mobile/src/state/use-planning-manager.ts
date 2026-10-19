import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { errorMessage } from '@/lib/errors';
import { backendFor } from '@/services/api';
import type { PlanningChange, PlanningJob } from '@/services/backend';
import { useApp } from '@/state/app-context';

type State = {
  userId?: string; jobs: PlanningJob[]; changes: PlanningChange[]; jobsLoaded: boolean; loaded: boolean;
  loading: boolean; loadingMore: boolean; hasMore: boolean; error: string | null;
};
const empty: State = { jobs: [], changes: [], jobsLoaded: false, loaded: false, loading: false, loadingMore: false, hasMore: false, error: null };
type Action = 'refresh' | 'more' | 'poll';

/** Retain the last view on focus/resume; poll unfinished jobs only while visible. */
export function usePlanningManager() {
  const { authSession } = useApp();
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

    async function load(action: Action) {
      if (!visible || !foreground || pending || (action === 'more' && !snapshot.hasMore)) return;
      clearTimeout(timer);
      pending = true;
      refreshOnResume = false;
      snapshot = { ...snapshot, loading: action === 'refresh', loadingMore: action === 'more', error: null };
      publish();
      try {
        const before = action === 'more' ? snapshot.changes.at(-1)?.revision : undefined;
        // Read history after jobs so a completed job's published change cannot be missed.
        const jobs = action === 'more' ? snapshot.jobs : await api.getPlanningJobs();
        if (!visible) return;
        // Activity should appear without waiting for the slower history read.
        snapshot = { ...snapshot, jobs, jobsLoaded: true };
        publish();
        const history = await api.getPlanningHistory(before);
        if (!visible) return;
        const changes = action === 'refresh' ? history.changes : [...new Map([
          ...snapshot.changes, ...history.changes,
        ].map(change => [change.id, change])).values()].sort((a, b) => b.revision - a.revision);
        snapshot = { ...snapshot, jobs, changes, loaded: true,
          hasMore: action === 'poll' && snapshot.loaded ? snapshot.hasMore : history.changes.length === 20 };
      } catch (error) {
        snapshot = { ...snapshot, error: errorMessage(error, 'Could not load your plans.') };
      } finally {
        pending = false;
        if (visible) {
          snapshot = { ...snapshot, loading: false, loadingMore: false };
          publish();
          if (foreground && refreshOnResume) void load('refresh');
          else if (foreground && snapshot.jobs.length) timer = setTimeout(() => void load('poll'), 10_000);
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
  }, [userId]));

  const run = async (action: Action) => {
    if (actions.current?.userId === userId) await actions.current?.load(action);
  };
  const current = state.userId === userId ? state : { ...empty, loading: Boolean(userId) };
  return { ...current, error: userId ? current.error : 'Sign in to see your plans.',
    refresh: () => run('refresh'), loadMore: () => run('more') };
}
