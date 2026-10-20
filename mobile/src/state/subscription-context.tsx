import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { backendFor, onSubscriptionRequired } from '@/services/api';
import { billingEnabled, purchases } from '@/services/purchases';
import { useApp } from './app-context';
import { createSubscriptionStore, subscriptionAllowsAccess, subscriptionDestination,
  type SubscriptionDestination, type SubscriptionState } from './subscription-store';

type SubscriptionContextValue = SubscriptionState & {
  enabled: boolean;
  hasAccess: boolean;
  destination: SubscriptionDestination;
  next: (destination?: SubscriptionDestination) => SubscriptionDestination | '/paywall';
  rememberDestination: (destination: SubscriptionDestination) => void;
  refresh: () => Promise<void>;
  purchase: () => Promise<void>;
  restore: () => Promise<void>;
  manage: () => Promise<void>;
};
const Context = createContext<SubscriptionContextValue | null>(null);

/** Keep billing lifecycle separate from profile, onboarding, and training state. */
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { authSession, hydrated } = useApp();
  const userId = hydrated ? authSession?.user.id ?? null : null;
  const [store] = useState(() => createSubscriptionStore({ enabled: billingEnabled, purchases, api: backendFor }));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [destination, setDestination] = useState<{ owner: string | null; value: SubscriptionDestination }>({ owner: null, value: '/(tabs)/today' });

  useEffect(() => { store.setUser(userId); }, [store, userId]);
  useEffect(() => {
    if (!billingEnabled) return;
    const stopSDK = purchases.subscribe(store.sdkChanged);
    const stopAPI = onSubscriptionRequired(store.invalidate);
    const foreground = AppState.addEventListener('change', value => { if (value === 'active') void store.refresh(); });
    return () => { stopSDK(); stopAPI(); foreground.remove(); };
  }, [store]);
  useEffect(() => {
    if (!billingEnabled || !userId) return;
    const interval = setInterval(() => { if (AppState.currentState === 'active') void store.refresh(); }, 5 * 60_000);
    return () => clearInterval(interval);
  }, [store, userId]);
  useEffect(() => {
    const end = state.owner === userId && state.status?.enabled ? state.status.expires_at : null;
    if (!billingEnabled || !userId || !end) return;
    const remaining = Date.parse(end) - Date.now();
    // Long subscriptions are checked by the regular refresh; do not overflow native timers.
    if (remaining > 2_147_483_000 || remaining <= 0) return;
    const timeout = setTimeout(() => store.invalidate(userId), remaining + 25);
    return () => clearTimeout(timeout);
  }, [state.owner, state.status, store, userId]);

  const value = useMemo<SubscriptionContextValue>(() => ({
    ...state,
    // Reject another account's snapshot synchronously, before the lifecycle effect runs.
    ...(state.owner !== userId ? { status: null, error: null, message: null, busy: null, confirming: false, loading: Boolean(userId) } : {}),
    enabled: billingEnabled,
    hasAccess: subscriptionAllowsAccess(billingEnabled, userId, state),
    destination: destination.owner === userId ? destination.value : '/(tabs)/today',
    next: preferred => subscriptionDestination(billingEnabled, userId, state, preferred),
    rememberDestination: preferred => { setDestination({ owner: userId, value: preferred }); },
    refresh: () => store.refresh(), purchase: store.purchase, restore: store.restore, manage: store.manage,
  }), [destination, state, store, userId]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const value = useContext(Context);
  if (!value) throw new Error('useSubscription must be used inside SubscriptionProvider.');
  return value;
}
