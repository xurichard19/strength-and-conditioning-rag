import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { CalendarSnapshot } from '@/lib/calendar';
import { errorMessage } from '@/lib/errors';
import { backendFor } from '@/services/api';
import { useApp } from '@/state/app-context';

type State = { key: string; data?: CalendarSnapshot; loading: boolean; error: string | null };

/** Read on focus/range change/resume, reuse fresh cache, and ignore obsolete screen responses. */
export function useCalendarRange(start: string, end: string) {
  const { authSession, calendarCache } = useApp();
  const userId = authSession?.user.id;
  const key = `${userId}:${start}:${end}`;
  const [state, setState] = useState<State>();
  const request = useRef(0);
  const load = useCallback(async (force = false) => {
    const id = ++request.current;
    if (!userId) return;
    const cached = calendarCache.peek(start, end);
    const pending = { key, data: cached?.data, loading: force || !cached?.fresh, error: null };
    setState(pending);
    try {
      const data = await calendarCache.load(backendFor(userId), start, end, force);
      if (request.current === id && data) setState({ key, data, loading: false, error: null });
    } catch (error) {
      if (request.current === id) setState({ ...pending, loading: false,
        error: errorMessage(error, 'Could not load your calendar.') });
    }
  }, [calendarCache, end, key, start, userId]);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    void load();
    const unsubscribe = calendarCache.subscribe(range => {
      if (start <= range.end && range.start <= end) void load();
    });
    const listener = AppState.addEventListener('change', status => { if (status === 'active') void load(); });
    return () => { request.current++; unsubscribe(); listener.remove(); };
  }, [calendarCache, end, load, start, userId]));

  const refresh = () => load(true);
  if (!userId) return { data: undefined, loading: false, error: 'Sign in to see your calendar.', refresh };
  const current = state?.key === key ? state : { data: undefined, loading: true, error: null };
  return {
    data: current.data ?? calendarCache.peek(start, end)?.data,
    loading: current.loading,
    error: current.error,
    refresh,
  };
}
