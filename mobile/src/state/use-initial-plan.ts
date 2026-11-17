import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { errorMessage } from '@/lib/errors';
import { initialPlanPending } from '@/lib/initial-plan';
import { backendFor } from '@/services/api';
import type { PlanningSchedule } from '@/services/backend';
import { useApp } from '@/state/app-context';

type State = { userId?: string; schedule: PlanningSchedule | null; loading: boolean; retrying: boolean; error: string | null };
const empty: State = { schedule: null, loading: true, retrying: false, error: null };

/** Today watches first publication, including a deferred job that is absent from the active jobs list. */
export function useInitialPlan() {
  const { authSession, calendarCache } = useApp();
  const userId = authSession?.user.id;
  const [state, setState] = useState<State>(empty);
  const cached = useRef(empty);
  const actions = useRef<{ userId: string; load: (retry?: boolean) => Promise<void> } | null>(null);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    const api = backendFor(userId);
    let active = true;
    let foreground = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    let pending = false;
    let snapshot = { ...(cached.current.userId === userId ? cached.current : empty), userId, retrying: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const publish = () => { if (active) { cached.current = snapshot; setState(snapshot); } };

    async function load(retry = false) {
      if (!active || !foreground || pending) return;
      if (retry && (snapshot.schedule?.initial_plan_status !== 'failed' || !snapshot.schedule.initial_plan_job)) return;
      clearTimeout(timer);
      pending = true;
      snapshot = { ...snapshot, loading: !snapshot.schedule, retrying: retry, error: null }; publish();
      try {
        if (retry) await api.retryPlanningJob(snapshot.schedule!.initial_plan_job!.id);
        if (!active) return;
        const schedule = await api.getPlanningSchedule();
        if (!active) return;
        // Also refresh an empty calendar loaded elsewhere before Today's first status read.
        if (schedule?.initial_plan_status === 'ready' && snapshot.schedule?.initial_plan_status !== 'ready') {
          calendarCache.invalidate();
        }
        snapshot = { ...snapshot, schedule };
      } catch (error) {
        if (!active) return;
        snapshot = { ...snapshot, error: errorMessage(error, retry ? 'Could not retry your plan.' : 'Could not check your plan.') };
      } finally {
        pending = false;
        if (active) {
          snapshot = { ...snapshot, loading: false, retrying: false }; publish();
          if (foreground && initialPlanPending(snapshot.schedule)) timer = setTimeout(() => void load(), 10_000);
        }
      }
    }
    actions.current = { userId, load }; publish(); void load();
    const listener = AppState.addEventListener('change', status => {
      foreground = status === 'active'; clearTimeout(timer);
      if (foreground) void load();
    });
    return () => { active = false; clearTimeout(timer); listener.remove(); actions.current = null; };
  }, [calendarCache, userId]));

  const run = async (retry = false) => { if (actions.current?.userId === userId) await actions.current?.load(retry); };
  return { ...(state.userId === userId ? state : empty), refresh: () => run(), retry: () => run(true) };
}
