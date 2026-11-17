import { NativeModules, Platform } from 'react-native';
import type Purchases from 'react-native-purchases';
import type { CustomerInfo, PurchasesOffering } from 'react-native-purchases';

type Core = typeof Purchases;
type UI = typeof import('react-native-purchases-ui').default;
export type PurchaseResult = 'purchased' | 'restored' | 'cancelled' | 'dismissed';
export type PurchasesAdapter = ReturnType<typeof createPurchasesAdapter>;

export const billingEnabled = Platform.OS === 'ios' && process.env.EXPO_PUBLIC_BILLING_ENABLED === 'true';

/** Keep native modules out of disabled, Android, and server-rendered web paths. */
export function createPurchasesAdapter(options: {
  enabled: boolean;
  apiKey: string;
  loadCore: () => Promise<Core>;
  loadUI: () => Promise<UI>;
  nativeUIAvailable: () => boolean;
}) {
  let sdk: Core | null = null;
  let configured = false;
  let desiredUser: string | null = null;
  let queue = Promise.resolve<unknown>(undefined);
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach(listener => listener());
  const enqueue = <T,>(run: () => Promise<T>): Promise<T> => {
    const task = queue.then(run);
    queue = task.catch(() => undefined);
    return task;
  };
  const assertOwner = async (userId: string) => {
    const actualUser = sdk && configured ? await sdk.getAppUserID() : null;
    if (!options.enabled || !sdk || !configured || desiredUser !== userId
      || actualUser !== userId) throw new Error('Your account changed. Please try again.');
    return sdk;
  };
  const operation = <T,>(userId: string, run: (core: Core) => Promise<T>) => enqueue(async () => {
    const core = await assertOwner(userId);
    const value = await run(core);
    if (desiredUser !== userId) throw new Error('Your account changed. Please try again.');
    return value;
  });
  const nativeUI = async () => {
    if (!options.nativeUIAvailable()) throw new Error('Open an iOS development build to use subscription management and the native paywall.');
    return options.loadUI();
  };

  return {
    /** Serialize identity changes with transactions, including rapid sign-out and sign-in. */
    identify(userId: string | null): Promise<void> {
      desiredUser = userId;
      if (!options.enabled) return Promise.resolve();
      return enqueue(async () => {
        if (desiredUser !== userId) return;
        if (!userId) {
          if (sdk && configured && !(await sdk.isAnonymous())) await sdk.logOut();
          return;
        }
        if (!options.apiKey) throw new Error('Subscriptions are not configured in this build.');
        sdk ??= await options.loadCore();
        if (!configured) {
          sdk.configure({ apiKey: options.apiKey, appUserID: userId });
          configured = true;
          sdk.addCustomerInfoUpdateListener(changed);
        } else if (await sdk.getAppUserID() !== userId) await sdk.logIn(userId);
      });
    },
    customerInfo: (userId: string): Promise<CustomerInfo> => operation(userId, core => core.getCustomerInfo()),
    restore: (userId: string): Promise<CustomerInfo> => operation(userId, core => core.restorePurchases()),
    /** Fetch current catalog values; prices, trials, and package selection belong to RevenueCat. */
    offering: (userId: string): Promise<PurchasesOffering> => operation(userId, async core => {
      const current = (await core.getOfferings()).current;
      if (!current?.monthly || !current.annual) throw new Error('Subscription plans are temporarily unavailable. Please try again.');
      return current;
    }),
    paywall: (userId: string, offering: PurchasesOffering): Promise<PurchaseResult> => operation(userId, async () => {
      const result = await (await nativeUI()).presentPaywall({ offering });
      if (result === 'PURCHASED') return 'purchased';
      if (result === 'RESTORED') return 'restored';
      if (result === 'CANCELLED') return 'cancelled';
      if (result === 'ERROR') throw new Error('The purchase could not be completed. Please try again.');
      return 'dismissed';
    }),
    manage: (userId: string): Promise<void> => operation(userId, async () => {
      await (await nativeUI()).presentCustomerCenter();
    }),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export const purchases = createPurchasesAdapter({
  enabled: billingEnabled,
  apiKey: (process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? '').trim(),
  loadCore: async () => (await import('react-native-purchases')).default,
  loadUI: async () => (await import('react-native-purchases-ui')).default,
  nativeUIAvailable: () => Boolean(NativeModules.RNPaywalls && NativeModules.RNCustomerCenter),
});
