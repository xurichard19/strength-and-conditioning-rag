# Arcel mobile

Expo SDK 58 / React Native 0.88. Use **Node 22.18+** and npm. App identifiers and the linked EAS project are in `app.json`; `app.config.ts` validates billing settings before builds.

## Local development

1. Run `npm ci` from `mobile/`.
2. Copy `.env.example` to `.env` if absent. Set the Supabase URL/publishable key and backend URL. Keep billing disabled until the [RevenueCat setup](../docs/REVENUECAT.md) is complete.
3. Start the backend on port **8000** from the repository root:

   ```sh
   .venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

4. Start Metro from `mobile/`:

   ```sh
   npx expo start --dev-client --port 8081
   ```

   If 8081 is occupied, use `--port 8082`. This changes Metro's port, not the API URL. For a physical phone, use the computer's LAN address in `EXPO_PUBLIC_API_BASE_URL`, with port 8000; `localhost` on the phone points to the phone. Keep the phone and computer on the same network.

The backend requires its Python environment and root `.env`; install it from the root with `python -m pip install -e .`. Docker is also available through `docker compose up --build api`. For isolated payment testing and backend environment overrides, see [development verification](../docs/REVENUECAT.md#development-verification). Expo loads ignored `mobile/.env.local` ahead of `mobile/.env`; check these overrides when switching environments.

## Native purchases

`expo-dev-client`, `react-native-purchases`, and `react-native-purchases-ui` are included. Install or update Expo native dependencies through `npx expo install`, for example `npx expo install expo-dev-client`. Rebuild the development app after native dependency changes. [Expo SDK 58 DevClient](https://docs.expo.dev/versions/v58.0.0/sdk/dev-client/)

On macOS with Xcode and CocoaPods configured:

```sh
npx expo run:ios
```

After native dependency or app-configuration changes, regenerate the iOS project with `npx expo prebuild --platform ios` and rebuild. Keep intentional native customizations in config plugins. Once the development build is installed, use `npx expo start --dev-client` for ordinary JavaScript development.

Use `npx expo run:ios --device` for a signed device build. Test RevenueCat Test Store during development, then verify real StoreKit purchases in an Apple sandbox development build or TestFlight. Expo Go previews do not verify the native store integration. See [RevenueCat's Expo setup](https://www.revenuecat.com/docs/getting-started/installation/expo).

## Build settings

| Profile | Distribution | Billing default |
| --- | --- | --- |
| `development` | Internal development client | Opt in through local/development environment |
| `preview` | Internal | Explicitly disabled |
| `production` | Store | Explicitly disabled |

Public SDK keys belong in ignored `.env` or the matching EAS environment. Backend RevenueCat secrets never belong in the mobile app. Store builds reject `test_` keys even when billing is disabled; enabled iOS store builds require an `appl_` key. For a native store build outside EAS, set `ARCEL_STORE_BUILD=true` during app configuration/prebuild. Android store configuration uses `EAS_BUILD_PLATFORM=android` and its `goog_` key; the current backend production entitlement policy is iOS only.

`NODE_ENV=production` alone does not mark a store build: ordinary web exports remain available with billing disabled. A store release still requires deliberate configuration and the [billing launch checks](../docs/REVENUECAT.md#release-and-validation).

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run export:web
```
