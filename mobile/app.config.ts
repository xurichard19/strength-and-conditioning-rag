import type { ConfigContext } from 'expo/config';

import eas from './eas.json';

/** Validate billing build settings while preserving the static app.json configuration. */
export default ({ config }: ConfigContext) => {
  const flag = process.env.EXPO_PUBLIC_BILLING_ENABLED ?? 'false';
  const storeFlag = process.env.ARCEL_STORE_BUILD ?? 'false';
  const key = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY?.trim() ?? '';
  const profileName = process.env.EAS_BUILD_PROFILE;
  const profiles: Record<string, { distribution?: string; [key: string]: unknown }> = eas.build;
  const storeBuild = storeFlag === 'true'
    || Boolean(profileName && profiles[profileName]?.distribution !== 'internal');

  if (flag !== 'true' && flag !== 'false') {
    throw new Error('EXPO_PUBLIC_BILLING_ENABLED must be true or false');
  }
  if (storeFlag !== 'true' && storeFlag !== 'false') {
    throw new Error('ARCEL_STORE_BUILD must be true or false');
  }
  if (storeBuild && key.startsWith('test_')) {
    throw new Error('RevenueCat Test Store keys cannot be used in production or store builds');
  }
  if (flag === 'true') {
    if (!/^(test_|appl_|goog_).+/.test(key)) {
      throw new Error('Billing requires a public RevenueCat SDK key');
    }
    const prefix = process.env.EAS_BUILD_PLATFORM === 'android' ? 'goog_' : 'appl_';
    if (storeBuild && !key.startsWith(prefix)) {
      throw new Error(`Store billing requires the app-specific RevenueCat ${prefix} SDK key`);
    }
  }

  return config;
};
