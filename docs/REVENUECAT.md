# RevenueCat setup

Billing is implemented behind independent backend and mobile flags, both **off by default**. Keep production disabled until dashboard configuration, native purchase tests, and deployment review are complete. Prices, trial duration, and production activation are not decided by this implementation.

## Implementation layout

| Area | Responsibility |
| --- | --- |
| `mobile/src/services/purchases.ts` | Configure RevenueCat once, serialize account changes, fetch customer info/offerings, and present native paywall/Customer Center |
| `mobile/src/state/subscription-store.ts` and `subscription-context.tsx` | Account-scoped access, backend synchronization, expiry/foreground refresh, and stale-response rejection |
| `mobile/src/screens/paywall-screen.tsx` | Present once after onboarding; retain a locked recovery screen after dismissal or verification failure |
| `mobile/src/screens/account-screen.tsx` | Subscription status, restoration, management, support, and sign-out |
| `server/app/api/schemas.py` and `api/routers/billing.py` | Public HTTP requests/responses, authenticated ownership, and webhook delivery |
| `server/app/contracts.py` and `services/billing.py` | Internal snapshots, freshness policy, environment selection, and access decisions |
| `server/app/integrations/revenuecat.py` | Bounded provider requests, payload normalization, and webhook authentication |
| `server/app/db/supabase/billing.py` | Typed database reads and revision-guarded RPC calls |
| `server/app/auth/billing.py` | Paid-access dependency on all chat, calendar, workout, sports-workout, and planning routes |
| `server/app/services/planning_access.py` | Shared payment verification, durable planning pause/resume, and best-effort post-purchase activation |
| `server/app/jobs/scheduler.py` and `replan_worker.py` | Verify before task delivery and revalidate the entitlement revision atomically before a generation attempt |
| `mobile/src/components/initial-plan-status.tsx` | Shared first-plan progress and retry experience in Today and Plans |

Purchase flow: native purchase/restore → authenticated `/billing/sync` → RevenueCat verification → conditional database commit → mobile unlock. SDK entitlement data informs messages; only the backend decision grants access. A confirmed purchase whose verification fails stays retryable and does not automatically purchase again. Webhooks invalidate cached verification; they cannot grant access directly.


## Account and product configuration

1. Use the existing RevenueCat project. Create/select its Test Store for local testing; connect the iOS app with bundle identifier `com.arcel.mobile` before StoreKit testing.
2. Create the entitlement **`arcel_pro`**. Attach the Test Store subscription products with IDs **`monthly`** and **`yearly`** to it.
3. Create an offering, make it **current**, and add the standard **`$rc_monthly`** and **`$rc_annual`** packages with the matching products for each store. Product IDs can differ between Test Store and Apple; application access depends on the entitlement, not a hardcoded price or product ID.
4. Create/publish the RevenueCat paywall for that offering. Include both packages, accurate localized prices, restore access, and the app's real terms/privacy URLs. Leave free trials unconfigured until their duration and eligibility policy are approved. [Offerings](https://www.revenuecat.com/docs/offerings/overview)
5. Retain RevenueCat's default **transfer purchases to the new App User ID** restore behavior. The SDK identifies a signed-in customer with their Supabase user UUID. Verify restore and account-switch behavior using two test accounts before release. [Restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior)
6. Configure **Customer Center** with support contact details, missing-purchase/restore and subscription-management paths. Configure any refund/plan-change options for iOS. Keep unapproved promotional retention offers disabled; those require matching store offers. [Customer Center configuration](https://www.revenuecat.com/docs/tools/customer-center/customer-center-configuration)

Test Store uses a separate public `test_` SDK key, simulated purchase outcomes, and sandbox entitlements. It does not validate StoreKit behavior or real store account handling. Before launch, switch to the iOS app's `appl_` key and test Apple sandbox purchases; TestFlight also uses store sandbox purchases. Never submit a Test Store key in a store build. [Test Store](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store), [sandbox testing](https://www.revenuecat.com/docs/test-and-launch/sandbox)

## Environment values

Set real values only in ignored environment files or the appropriate deployment secret/variable store. The examples intentionally contain no RevenueCat key.

| Backend variable | Configuration |
| --- | --- |
| `BILLING_ENABLED` | `false` by default; `true` only for a configured environment |
| `REVENUECAT_API_KEY` | Dedicated server secret API key that can read subscriber state through RevenueCat API v1 |
| `REVENUECAT_WEBHOOK_AUTHORIZATION` | Exact private Authorization header value configured on the webhook |
| `REVENUECAT_WEBHOOK_SIGNING_SECRET` | Optional signing secret; configure it when dashboard HMAC signing is enabled |
| `REVENUECAT_APP_IDS` | JSON array of allowed RevenueCat app IDs; include the Test Store app ID during testing. These are not bundle IDs or SDK keys |
| `BILLING_SANDBOX_USER_IDS` | JSON array of Supabase user UUIDs permitted to use sandbox verification on the production backend |

`SUPABASE_SECRET_KEY` is also required for enabled billing. Backend secrets are represented as `SecretStr` in settings and must never use an `EXPO_PUBLIC_` name. Local/development backends verify sandbox state; ordinary production accounts verify production App Store state. Only the explicitly listed production review/test accounts use sandbox state. The API, planning worker, and dispatcher must use the same `BILLING_ENABLED`, provider key, sandbox account allowlist, and deployment environment. The job services need the provider credentials but do not need webhook authorization or app IDs; the dispatcher does not need AI provider credentials.

| Mobile variable | Configuration |
| --- | --- |
| `EXPO_PUBLIC_BILLING_ENABLED` | `false` by default; enable locally only after configuring the backend |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | Public SDK key for this build's RevenueCat app: Test Store during local testing, iOS key for Apple sandbox/release |

The public SDK key is shipped with the app; it is not a backend credential. `mobile/eas.json` keeps preview and production billing explicitly disabled. The development profile can opt in through its environment. For non-EAS native store builds, set `ARCEL_STORE_BUILD=true` during configuration/prebuild; EAS store profiles are detected automatically. The guard rejects Test Store keys for store builds and requires the iOS app key for enabled iOS billing.

## Backend and webhook setup

Apply the repository migrations only to the intended environment before deploying compatible services. `20260919232156_billing_entitlements.sql` creates the private entitlement projection and revision-guarded RPCs. `20261109060513_payment_gated_planning.sql` adds payment pause/recheck fields and extends queue operations. `20261110054537_event_driven_planning_billing.sql` adds durable event wake-ups, atomic paid-verification activation, and revision-fenced unpaid waiting. `20261114155918_billing_outage_resilience.sql` adds a fixed paid outage deadline and provider retry time, separating routine verification from webhook invalidation. Existing RPC signatures remain available; keep billing disabled while old services drain because their record models cannot read the new columns. Authenticated clients cannot read/write billing state or call queue RPCs directly. There is no separate billing queue, event-inbox table, or billing worker to operate. The direct-client training/chat privilege cutover is staged separately, as described under Release and validation.

The backend uses verified Supabase identity to query RevenueCat. A purchase or restore calls `POST /billing/sync`; `GET /billing/status` returns the backend decision. Neither accepts client assertions of paid access. The entitlement projection is partitioned by sandbox/production and is refreshed when missing, invalidated, expired, or older than five minutes. Revision checks prevent an older verification from overwriting newer invalidation.

Temporary RevenueCat failures can reuse a previously verified paid subscription for up to 24 hours after successful verification, capped at its known paid expiry. Ordinary checks share a 60-second retry cooldown; explicit purchase/restore sync can retry immediately. Failures never extend the allowance. Unknown accounts, confirmed nonpayment, trials, grace periods, and invalid provider data do not qualify. Every webhook invalidation clears the allowance until successful verification, including renewal/cancellation notifications. New planning attempts still require fresh verification. A verification superseded by a newer revision briefly waits for its result within the existing verification budget instead of replacing its claim. If no usable result arrives, the request returns unavailable and a later request can retry; older results never overwrite newer state.

Configure a RevenueCat webhook with:

- The public HTTPS endpoint **`/billing/webhooks/revenuecat`** on the intended backend. Localhost and LAN addresses are not reachable by RevenueCat; local testing needs a public HTTPS tunnel forwarding to backend port 8000.
- The exact configured Authorization value, plus HMAC signing if enabled. Store the signing secret on the backend and match the allowed app IDs.
- The relevant app and purchase environment; include transfer events so both account identities are invalidated.

The webhook checks authorization and, when configured, the timestamped `X-RevenueCat-Webhook-Signature` against the raw request bytes. It invalidates affected projections durably before acknowledging. Subsequent status or paid requests fetch canonical RevenueCat state. It does not grant access from the event payload. Duplicate or delayed delivery therefore causes re-verification rather than replaying an old entitlement. [RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks)

When billing is enabled, every chat, calendar, workout, sports-workout, and planning read or write requires verified `arcel_pro` access. Auth, profile, onboarding, and subscription-management routes remain available. Training/chat database access goes through the backend service credential with explicit authenticated-owner filters. Inactive paid access returns `403 subscription_required`; verification failure returns `503 billing_unavailable` rather than claiming the user needs to buy again.

### Paid access and automatic planning

- Onboarding saves answers and durable planning intent before payment. Finishing onboarding does not authorize generation.
- A current, verified **normal or introductory paid period** grants access. Trials and billing grace do not. Turning off auto-renewal retains access until the paid expiry. Unknown active period types fail closed as verification unavailable; definitively expired/refunded history with missing or unsupported string periods returns inactive.
- Paid verification commits any necessary planning wake in the same database transaction. Onboarding completion and webhooks also persist wakes. A successful `/billing/sync` may accelerate activation after the response using that verified revision; failure of this optional callback does not lose accepted work. Cached `/billing/status` reads do not repeat planning activation.
- The dispatcher checks payment before submitting or recovering a delivery. The worker checks again before claiming an attempt. The database atomically checks the environment, entitlement revision, verification freshness, paid expiry, and completed onboarding under its existing locks.
- Confirmed unpaid accounts stop periodic checks and wait for a webhook or subsequent successful backend verification from purchase, restore, or an app visit. There is no daily fallback. If both notifications and subsequent verification are absent, recovery waits for the user to return or restore. Temporary billing failures retry after one minute.
- Each tick bulk-enqueues up to 20 due requests for unpaused accounts, then alternates ready deliveries with up to 20 event/outage rechecks within a 45-second admission budget. Event and outage candidates share capacity fairly. Queuing intent does not spend generation attempts or bypass payment verification; the counts are batch limits, not guaranteed throughput.
- Deferral retires pending delivery tokens without consuming attempts. Permanent unpaid waiting must match the observed entitlement revision, so an older denial cannot strand a newly paid user. Reconciliation only acknowledges its observed wake token; a newer event remains pending.
- An already-authorized running attempt may finish. A later retry or new attempt must verify again. Saved plans, workouts, and history remain stored after payment loss, but are not viewable through the app until paid access is restored.
- Resumption creates current coverage, coalesces pending automatic edits, and preserves manual requests. An exhausted first-plan job remains visible and retryable; reconciliation does not silently restart it or discard it during history cleanup.
- Today and Plans display queued, running, deferred, failed, or ready first-plan state. A failed or cancelled first job has an explicit retry action. A temporarily deferred job waits for reconciliation; neither state requires another purchase.
- Confirmed backend denial clears protected mobile training/chat caches and rejects late responses from the old access session. Any same-account access previously granted by the backend keeps the current screen through temporary network/503/timeout failures, with a warning and retry. This includes access granted while backend billing is off during rollout; it does not change backend payment enforcement. Expiry triggers verification rather than a device-clock denial. Unknown accounts remain blocked. Authentication failures require sign-in recovery, and logout/account changes still clear account-owned memory. Keeping a screen open does not make failed saves succeed or provide offline synchronization.
- Trial/grace responses show policy-specific recovery guidance rather than claiming access is active or a purchase is still syncing. They do not automatically reopen purchasing. Subscription management, restore, refresh, and support remain available.

The five-minute verified entitlement cache still applies. The backend checks paid expiry, and a webhook invalidates both verification and outage eligibility. Provider requests remain bounded; outage fallback permits ordinary protected requests but cannot authorize new planning attempts. With `BILLING_ENABLED=false`, APIs and job claims retain the previous behavior, including processing jobs paused while billing was enabled.

Keep free-trial offers and Apple's optional Billing Grace Period disabled for this paid-only release. Apple's grace feature is intended to retain service while billing recovery runs; enabling it requires an explicit policy change and matching backend/mobile behavior. Dashboard settings are not changed by these migrations.

## Development verification

Use an isolated development Supabase project or local stack, with the repository migrations applied. Local Supabase supplies Auth and the REST/RPC API as well as PostgreSQL; a standalone PostgreSQL server is insufficient for app testing. Keep development credentials in ignored environment files. Do not point a billing-enabled development client at an unconfigured production backend.

Follow [mobile setup](../mobile/README.md) for the native development build. For a local backend override, run from the repository root:

```sh
.venv/bin/python -m uvicorn app.main:app --env-file .env.local --host 127.0.0.1 --port 8000
```

Uvicorn loads `.env.local` before application settings; exported shell values take precedence, and root `.env` supplies remaining values. Expo loads `mobile/.env.local` ahead of `mobile/.env`. Restart the backend and Metro after configuration changes. A physical phone needs reachable API and Supabase addresses; its `localhost` is the phone itself. Bind services to the intended private network only when needed.

For webhook testing, use an HTTPS tunnel to the local webhook endpoint, restrict public routing to that endpoint, and configure RevenueCat with the tunnel's current URL and matching authorization. A dashboard `TEST` event should return `200 {"received":true}` without writing billing state. A browser GET returns 405 because the endpoint accepts POST only.

Verify the following with a new development account:

1. Complete onboarding. Confirm the paywall appears and planning does not generate before verified payment.
2. Exercise cancelled, failed and successful Test Store purchases. Only successful backend verification through `/billing/sync` should unlock access and resume planning.
3. Confirm `billing_entitlements` records the user's UUID, sandbox environment, `arcel_pro`, product, expiry and verification timestamps. RevenueCat's identified App User ID should match that UUID.
4. Check a real purchase webhook receives 200. It invalidates verification (`verified_at` becomes null and the revision increases); a subsequent backend verification restores canonical state. It does not grant access from the notification alone.
5. Test restore feedback, account switching, Customer Center, expiry and recovery from unavailable verification. Check both protected API access and the app's state, including preservation of drafts during temporary failures.

Test Store validates the integration flow; the Apple sandbox rehearsal and deployed planning checks below remain necessary before release.

## Release and validation

Before enabling billing:

1. Run `python tests/run.py backend`, `python tests/run.py mobile`, and `python tests/run.py database` from the repository root with the project Python environment and Node 22.18+. The centralized suites include the payment tests and billing concurrency checks. Run the mobile web export as well. Confirm billing-disabled startup works without RevenueCat secrets.
2. Verify monthly/yearly purchase success, cancellation, failure, restore, account switch, expiration, and Customer Center. Check both app display and backend access; a successful SDK callback alone is insufficient.
3. Verify webhook authorization/HMAC, app filtering, duplicate/delayed delivery, transfer invalidation, and provider unavailability. Confirm ordinary production accounts cannot gain access from sandbox purchases.
4. Run native Apple sandbox tests with the `appl_` key and real Apple products. Finalize prices, trial policy, legal URLs, support details, and the paywall configuration.
5. Review production activation separately. Configure GitHub **secrets** for the API key, webhook authorization, and optional signing secret; **variables** for `BILLING_ENABLED`, app IDs, and sandbox user IDs. The deployment workflow rejects incomplete enabled configuration, and supplies disabled defaults when unset. Set the production EAS environment's app-specific public key and deliberately change its billing flag only as part of that release.

**Deployment behavior:** matching pushes to `main` and manual runs of `.github/workflows/deploy-backend-cloud-run.yml` build/push the backend, apply pending Supabase migrations, then deploy Cloud Run. A push affecting this workflow or server/Supabase files can therefore change the live database even when billing is disabled. Review these workflow triggers before merging.

The deployment uses `supabase db push --linked --include-all --yes` because the billing-table migration predates some already-deployed migrations. The root `db:push:check` (dry run) and `db:push` scripts use the same target and migration selection. This includes migrations missing from database history in timestamp order and skips those already applied. Keep the existing migration IDs so local testing databases retain their history. The separate staged permissions script is not included in these commands.

### Ordered planning enforcement rollout

1. Apply the additive billing/planning migrations and deploy the compatible API, worker, and dispatcher with billing disabled. Keep billing off throughout this transition: older billing record models reject the new outage columns. Existing rows receive no outage allowance until successful paid verification. Validate account ownership, profile/onboarding access, and the existing planning lifecycle. Pause the queue/scheduler while replacing old job-service revisions; drain old API and worker revisions before the access cutover.
2. Review `supabase/staged/backend_only_training_access.sql`. It revokes direct authenticated access to training/chat tables, the separately granted message/conversation columns, and the calendar RPC. Keep it outside automatic migrations until the compatible backend is serving all traffic. Apply it in a transaction as the separate second deployment step; the database test suite exercises this staged SQL against disposable data.
3. Verify two-account isolation through the API and denial of direct authenticated training/chat reads and mutations. Profile/onboarding must still work, and service-role training/chat operations must still work. Do not roll back to a JWT-based old API after this cutover without a separately reviewed privilege restoration.
4. Distribute the mobile build with billing enabled before activating backend enforcement; backend billing off remains compatible with that build. Decide how older installed builds will be updated or handled before the cutover. Then enable the same backend billing configuration on the API, worker, and dispatcher. Resume planning only after all three services are compatible and configured. Confirm unpaid onboarding creates no generation attempts; purchase/restore resumes one current first plan; duplicate sync/webhook/task deliveries do not duplicate generation.
5. Exercise expiry, trial, grace, refund/transfer invalidation, provider outage, an already-running attempt, retry after first-plan failure, and app closure immediately after purchase. Inspect both the entitlement row and the existing schedule/job records. Complete native Apple purchase validation before production activation.

Keeping stage two outside `supabase/migrations` is deliberate: the current migration-before-deploy workflow would otherwise revoke privileges from the still-running old API. The default feature flags remain disabled; neither this document nor the implementation enables production billing.
