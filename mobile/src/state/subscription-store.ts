import type { BillingStatus } from '../services/backend';
import type { PurchasesAdapter } from '../services/purchases';
import type { CustomerInfo } from 'react-native-purchases';

export type SubscriptionState = {
  owner: string | null;
  status: BillingStatus | null;
  loading: boolean;
  busy: 'purchase' | 'restore' | 'manage' | null;
  error: string | null;
  message: string | null;
  confirming: boolean;
};
export type SubscriptionDestination = '/(tabs)/today' | '/(tabs)/chat' | '/(tabs)/you';
const empty = (owner: string | null = null): SubscriptionState => ({ owner, status: null,
  loading: Boolean(owner), busy: null, error: null, message: null, confirming: false });
const message = (error: unknown, fallback: string) => error && typeof error === 'object'
  && 'message' in error && typeof error.message === 'string' ? error.message : fallback;

/** Access always comes from the server and belongs to one authenticated account. */
export function subscriptionAllowsAccess(enabled: boolean, userId: string | null, state: SubscriptionState) {
  const status = state.status;
  const expired = status?.enabled && status.expires_at && Date.parse(status.expires_at) <= Date.now();
  return !enabled || Boolean(userId && state.owner === userId && status?.has_access && !state.error && !expired);
}

/** SDK entitlement data informs recovery messages; it never grants application access. */
export function hasSDKEntitlement(info: CustomerInfo) {
  return info.entitlements.active.arcel_pro?.isActive === true;
}

export function purchaseError(error: unknown) {
  const value = error && typeof error === 'object' ? error as { code?: unknown; userCancelled?: boolean } : {};
  const code = String(value.code ?? '');
  return {
    cancelled: value.userCancelled === true || code === '1',
    pending: code === '20',
    message: code === '20' ? 'Your payment is awaiting approval. Access will update when the purchase is confirmed.'
      : code === '10' ? 'Could not reach the App Store. Check your connection and try again.'
        : code === '6' ? 'This subscription is already purchased. Use Restore purchases to recover access.'
          : message(error, 'Could not complete this action. Please try again.'),
  };
}

/** Resolve existing destinations without letting a loading or failed check unlock the app. */
export function subscriptionDestination(enabled: boolean, userId: string | null,
  state: SubscriptionState, destination: SubscriptionDestination = '/(tabs)/today') {
  return subscriptionAllowsAccess(enabled, userId, state) ? destination : '/paywall';
}

export function createSubscriptionStore(options: {
  enabled: boolean;
  purchases: PurchasesAdapter;
  api: (userId: string) => { getBillingStatus: () => Promise<BillingStatus>; syncBilling: () => Promise<BillingStatus> };
}) {
  let state = empty();
  let generation = 0;
  let request = 0;
  let initializedUser: string | null = null;
  let pendingSync = false;
  let confirmationMessage = 'Your purchase is confirmed, but access is still syncing. Retry to finish.';
  let refreshQueued = false;
  let syncQueued = false;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<SubscriptionState>) => {
    state = { ...state, ...patch }; listeners.forEach(listener => listener());
  };
  const identify = async (userId: string) => {
    await options.purchases.identify(userId);
    await options.purchases.customerInfo(userId);
    if (state.owner === userId) initializedUser = userId;
  };

  /** An invalidated or failed verification never retains a previous access grant. */
  const refresh = async (sync = false): Promise<void> => {
    const userId = state.owner;
    if (!options.enabled || !userId || state.busy) return;
    const epoch = generation; const ticket = ++request;
    const current = () => generation === epoch && request === ticket;
    publish({ loading: true, error: null });
    try {
      const api = options.api(userId);
      const status = await (sync || pendingSync ? api.syncBilling() : api.getBillingStatus());
      if (!current()) return;
      pendingSync = pendingSync && !status.has_access;
      publish({ status, loading: false, error: pendingSync ? confirmationMessage : null,
        message: null, confirming: pendingSync });
      if (status.enabled && initializedUser !== userId) {
        try { await identify(userId); }
        catch (error) { if (current()) publish({ message: message(error, 'Could not connect to the App Store. Please try again.') }); }
      }
    } catch {
      if (current()) publish({ status: null, loading: false,
        error: pendingSync ? confirmationMessage
          : 'Could not verify your subscription. Please try again.' });
    }
  };

  const perform = async (kind: NonNullable<SubscriptionState['busy']>): Promise<void> => {
    const userId = state.owner;
    if (!options.enabled || !userId || state.busy || kind === 'purchase' && state.confirming) return;
    const epoch = generation;
    const current = () => generation === epoch && state.owner === userId;
    ++request;
    publish({ busy: kind, error: null, message: null });
    let confirmed = false;
    let verifying = false;
    let restored = kind === 'restore';
    try {
      await identify(userId);
      if (!current()) return;
      if (kind === 'purchase') {
        const offering = await options.purchases.offering(userId);
        if (!current()) return;
        const result = await options.purchases.paywall(userId, offering);
        if (!current()) return;
        if (result !== 'purchased' && result !== 'restored') return;
        restored = result === 'restored';
        confirmed = result === 'purchased' || hasSDKEntitlement(await options.purchases.customerInfo(userId));
        if (!current()) return;
      } else if (kind === 'restore') {
        const info = await options.purchases.restore(userId);
        if (!current()) return;
        confirmed = hasSDKEntitlement(info);
      } else {
        await options.purchases.manage(userId);
        if (!current()) return;
      }
      pendingSync = pendingSync || confirmed;
      if (confirmed) confirmationMessage = restored
        ? 'Your subscription was restored, but access is still syncing. Retry to finish.'
        : 'Your purchase is confirmed, but access is still syncing. Retry to finish.';
      verifying = true;
      const status = await options.api(userId).syncBilling();
      if (!current()) return;
      pendingSync = pendingSync && !status.has_access;
      publish({ status, loading: false, error: pendingSync ? confirmationMessage : null, confirming: pendingSync,
        message: status.has_access ? null : restored && !confirmed ? 'No active subscription was found for this account.'
          : 'No active subscription is available yet. Restore purchases or try again.' });
    } catch (error) {
      if (!current()) return;
      const failure = purchaseError(error);
      if (failure.cancelled) return;
      if (verifying) {
        publish({ status: null, loading: false, confirming: pendingSync,
          error: pendingSync ? confirmationMessage : 'Could not verify your subscription. Please try again.' });
      } else if (failure.pending) {
        pendingSync = true; confirmationMessage = failure.message;
        publish({ loading: false, confirming: true, message: failure.message });
      } else publish({ loading: false, message: failure.message });
    } finally {
      if (current()) {
        publish({ busy: null });
        if (refreshQueued) { const sync = syncQueued; refreshQueued = false; syncQueued = false; void refresh(sync); }
      }
    }
  };

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setUser(userId: string | null) {
      if (state.owner === userId) return;
      generation++; request++; initializedUser = null; pendingSync = false; refreshQueued = false; syncQueued = false;
      state = empty(userId); listeners.forEach(listener => listener());
      if (!options.enabled) return;
      // Updating the desired SDK owner immediately fences an in-flight native purchase.
      void options.purchases.identify(userId).catch(() => undefined);
      if (userId) void refresh();
    },
    refresh,
    purchase: () => perform('purchase'),
    restore: () => perform('restore'),
    manage: () => perform('manage'),
    invalidate(userId: string) {
      if (!options.enabled || state.owner !== userId) return;
      ++request;
      publish({ status: null, error: null });
      if (state.busy) { refreshQueued = true; return; }
      void refresh();
    },
    sdkChanged() {
      if (initializedUser !== state.owner || !state.owner) return;
      if (state.busy) { refreshQueued = true; syncQueued = true; return; }
      void refresh(true);
    },
  };
}
