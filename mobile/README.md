# Arcel mobile MVP

This is a standalone Expo / React Native client built from the supplied Arcel UI/UX prototype. It does not reuse the desktop web UI. It runs immediately in preview mode, persists local changes, and switches to live data when the existing backend environment is configured.

## Run it

Requirements: Node 22.13 or newer and the Expo Go app (or an iOS/Android simulator).

```bash
cd mobile
npm install
cp .env.example .env
npm start
```

The environment file is optional for preview mode. When testing on a physical phone, `EXPO_PUBLIC_API_BASE_URL` must use an address the phone can reach—not `localhost`.

## What is live vs preview

| Area | Live integration | Preview fallback |
| --- | --- | --- |
| Account | Supabase sign-up, sign-in, sign-out | Local preview without an account |
| Profile and setup | `GET/PATCH /profile/`, `POST /profile/onboarding/complete` | Persisted device profile |
| Initial plan | `POST /plan/generate`, `POST /plan/` | Supplied prototype week |
| Week | `GET /workouts/?start_date&end_date` | Supplied prototype sessions |
| Exercise completion | `PATCH /workouts/{workout_id}/exercises/{exercise_id}/completion` | Persisted local state |
| Chat | Streaming `POST /chat/` | Contextual mock replies |
| Set logs, progress rollups, week repair, reminders, connected apps | Backend work still needed | Interactive mock/local behavior |

Preview mode is intentional: no dead buttons are required to review the main flow. Unwired settings are visibly labeled.

## Product flow

- Arcel-styled sign-in, account creation, and password recovery
- Returning accounts load their existing profile and open Today
- New or incomplete accounts continue through setup and generate their first plan
- Five-step setup and first-week reveal
- Today with transparent “ease this week” proposal
- Week calendar and session rationale
- In-session set logging, volume adjustment, effort notes, swap/skip paths
- Separate strength and cardio progress tracks
- Dedicated context-aware Chat tab
- Plan, block, theme, remembered notes, and account/sync settings

For Supabase email links, add the local web URLs (`http://localhost:8081` and `http://localhost:8081/reset-password`) and the production `arcel` app-scheme destinations to Authentication → URL Configuration. Expo Go uses a temporary development URL, while standalone builds use the `arcel` scheme from `app.json`.

## Google sign-in setup

The client-side flow is implemented, but the provider must also be enabled outside the repository:

1. In Google Cloud, create a Web OAuth client and add the Supabase callback URL shown in Supabase Authentication → Providers → Google. It has the form `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase Authentication → Providers → Google, enable Google and enter that client ID and secret.
3. In Supabase Authentication → URL Configuration, allow `arcel://**`, the local web origin used for development, and the production web URL if the web build will support Google sign-in.
4. Test the native flow in a development build before store submission. Expo Go URLs are temporary; the installed development and production builds use the stable `arcel` scheme.

The Google client secret belongs only in Supabase/Google configuration. Do not add it to the mobile `.env` file.

## Checks

```bash
npm run typecheck
npm run export:web
```

## Before store builds

The bundle identifiers in `app.json` are working placeholders. Confirm ownership and change `com.arcel.mobile` if needed before registering the app. Replace the scaffold icon/splash artwork, then install and authenticate the EAS CLI and run:

```bash
npx eas-cli build --platform all --profile production
npx eas-cli submit --platform ios --profile production
npx eas-cli submit --platform android --profile production
```

Do not put Supabase service-role keys or other server secrets in `EXPO_PUBLIC_*` variables. Only the public/publishable Supabase key belongs in the app.

## Store submission checklist

- [ ] Enroll in Apple Developer / Google Play Console and verify the legal developer identity.
- [ ] Confirm the final bundle ID/package name before creating the store records; changing it later creates a different app identity.
- [ ] Replace the placeholder icon and splash assets. Prepare the store name, subtitle/short description, full description, category, keywords, age/content rating, support URL, and current phone screenshots.
- [ ] Publish a privacy policy and accurately complete Apple App Privacy and Google Play Data safety forms, including Supabase and any analytics/crash SDKs.
- [ ] **Backend blocker:** add complete account deletion. Because this client can create accounts, Apple requires an in-app deletion path; Google requires both an in-app path and a deletion-request webpage.
- [ ] Keep the training-not-medical-care language, publish terms, and review all health/fitness claims for accuracy.
- [ ] Test sign-up, email confirmation, sign-in, token refresh, offline/slow-network behavior, logout, and deletion against production—not local—services.
- [ ] Make production EAS builds, test through TestFlight and a Play internal track on real devices, then fix all release-only crashes/layout issues.
- [ ] Give reviewers a working demo account or keep the full preview mode enabled, and add review notes that explain how to reach every gated feature.
- [ ] Select the production build in App Store Connect / Play Console, finish export-compliance and policy questions, submit, and monitor reviewer messages.

Official references: [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Apple account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/), [Apple submission steps](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/), and [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).
