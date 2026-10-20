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
| `server/app/auth/billing.py` | Paid-access dependency on the four specified AI/planning writes; existing `require_user` is unchanged |

Purchase flow: native purchase/restore → authenticated `/billing/sync` → RevenueCat verification → conditional database commit → mobile unlock. SDK entitlement data informs messages; only the backend decision grants access. A confirmed purchase whose verification fails stays retryable and does not automatically purchase again. Webhooks invalidate cached verification; they cannot grant access directly.

Local handoff: the supplied public Test Store SDK key is saved only in ignored `mobile/.env`. The isolated setup below uses ignored backend/mobile `.env.local` overrides with local Supabase credentials and billing enabled. Hosted settings and deployment billing defaults remain unchanged. Native purchase validation remains pending.

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

`SUPABASE_SECRET_KEY` is also required for enabled billing. Backend secrets are represented as `SecretStr` in settings and must never use an `EXPO_PUBLIC_` name. Local/development backends verify sandbox state; ordinary production accounts verify production App Store state. Only the explicitly listed production review/test accounts use sandbox state.

| Mobile variable | Configuration |
| --- | --- |
| `EXPO_PUBLIC_BILLING_ENABLED` | `false` by default; enable locally only after configuring the backend |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | Public SDK key for this build's RevenueCat app: Test Store during local testing, iOS key for Apple sandbox/release |

The public SDK key is shipped with the app; it is not a backend credential. `mobile/eas.json` keeps preview and production billing explicitly disabled. The development profile can opt in through its environment. For non-EAS native store builds, set `ARCEL_STORE_BUILD=true` during configuration/prebuild; EAS store profiles are detected automatically. The guard rejects Test Store keys for store builds and requires the iOS app key for enabled iOS billing.

## Backend and webhook setup

Apply `supabase/migrations/20260919232156_billing_entitlements.sql` only to the intended development database before enabling local billing. It creates **one table**, `billing_entitlements`, and **two service-role-only RPCs**, `invalidate_billing_entitlements` and `commit_billing_entitlement`. Authenticated clients cannot read/write the table directly. There is no billing queue, event-inbox table, or worker to operate.

The backend uses verified Supabase identity to query RevenueCat. A purchase or restore calls `POST /billing/sync`; `GET /billing/status` returns the backend decision. Neither accepts client assertions of paid access. The entitlement projection is partitioned by sandbox/production and is refreshed when missing, invalidated, expired, or older than five minutes. Revision checks prevent an older verification from overwriting newer invalidation.

Configure a RevenueCat webhook with:

- The public HTTPS endpoint **`/billing/webhooks/revenuecat`** on the intended backend. Localhost and LAN addresses are not reachable by RevenueCat; local testing needs a public HTTPS tunnel forwarding to backend port 8000.
- The exact configured Authorization value, plus HMAC signing if enabled. Store the signing secret on the backend and match the allowed app IDs.
- The relevant app and purchase environment; include transfer events so both account identities are invalidated.

The webhook checks authorization and, when configured, the timestamped `X-RevenueCat-Webhook-Signature` against the raw request bytes. It invalidates affected projections durably before acknowledging. Subsequent status or paid requests fetch canonical RevenueCat state. It does not grant access from the event payload. Duplicate or delayed delivery therefore causes re-verification rather than replaying an old entitlement. [RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks)

When billing is enabled, these operations require verified `arcel_pro` access:

- `POST /chat`
- `PUT /planning/schedule`
- `POST /planning/adjustments`
- `POST /planning/jobs/{id}/retry`

Existing profile, workout/history, and subscription-management access remains available. Inactive paid access returns `403 subscription_required`; verification failure returns `503 billing_unavailable` rather than claiming the user needs to buy again. This does not implement the still-separate planning worker.

## Local workflow

Follow [mobile local development](../mobile/README.md): Node **22.18+**, backend **8000**, Metro **8081** or **8082** if occupied. A physical phone needs the computer's LAN API URL; the RevenueCat webhook separately needs a public HTTPS tunnel. Do not point a development billing client at an unconfigured production backend.

After dashboard/environment setup, restart the backend and Metro, sign in, then test the paywall, purchase, restore, and Customer Center. Rebuild the development app when native dependencies change. Install compatible native packages with `npx expo install`; `expo-dev-client` and both RevenueCat packages are already included.

### Isolated local Supabase and webhook tunnel

Use the local Supabase stack for payment development. It includes PostgreSQL 17, Auth and the REST/RPC API that Arcel uses; a standalone PostgreSQL server does not provide the latter two. The local database uses **54322**, leaving the existing Postgres.app instance on **5432** untouched. All seven repository migrations, including billing, have already been applied locally. No production data was copied and no hosted migration was run.

**Where it is configured and stored**

- `supabase/config.toml`: project name, PostgreSQL version and service ports.
- `supabase/migrations/`: SQL that builds the local schema, including `20260919232156_billing_entitlements.sql`.
- `package.json`: the `db:local:*`, `api:local` and `webhook:*` commands below.
- `server/scripts/bind_local_supabase.py`: starts the Supabase CLI stack and binds this project's published Docker ports to `127.0.0.1`, preserving data volumes.
- Docker Desktop → Containers: this project's services have names ending in `_strength-and-conditioning-rag`.
- Docker Desktop → Volumes: `supabase_db_strength-and-conditioning-rag` holds the actual database files inside Docker Desktop's Linux VM. Database data is not in the repository or Postgres.app.
- Ignored `.env.local`, `mobile/.env.local` and `.local-dev/`: machine-specific configuration, local tools and logs.

| Service | Local address |
| --- | --- |
| Supabase Auth/database API | `http://127.0.0.1:54321` |
| PostgreSQL | `127.0.0.1:54322`, database/user `postgres` |
| Supabase Studio | [Open local Studio](http://127.0.0.1:54323) |
| Test email inbox | [Open local inbox](http://127.0.0.1:54324) |
| Arcel API | [Health check](http://127.0.0.1:8000/health) |
| Webhook-only proxy | `http://127.0.0.1:8001` |

**What Studio is**

Studio is the browser dashboard for this local Supabase instance, similar to the hosted Supabase dashboard. Use **Table Editor** for `public.profiles` and `public.billing_entitlements`, **SQL Editor** to run local SQL, and **Authentication → Users** to inspect local accounts. It does not show production accounts or tables. Test confirmation/reset emails appear in the local inbox, not a real mailbox. For a desktop SQL client, use the local PostgreSQL connection URL printed by `npm run db:local:status`.

**Exactly how the environment overrides work**

The backend does not automatically recognize `.env.local`. The `api:local` script in `package.json` explicitly runs:

```sh
.venv/bin/python -m uvicorn app.main:app --env-file .env.local --host 127.0.0.1 --port 8000
```

Uvicorn loads `.env.local` into the process before importing the app. Then `server/app/main.py` calls `load_dotenv()` to fill remaining values from `.env`, without overwriting existing process values. `server/app/config.py` reads those values with Pydantic settings, also using `.env` as a fallback. Precedence for this command is:

```text
already exported shell variables > root .env.local > root .env > settings defaults
```

Use a terminal without manually exported hosted Supabase credentials. Plain `uvicorn app.main:app` does not load `.env.local`, and the existing `docker compose up api` reads `.env`; use `npm run api:local` for this workflow.

| Configuration | Local override | Values retained from the ordinary `.env` |
| --- | --- | --- |
| Backend | Development mode, local Supabase URL/keys, `BILLING_ENABLED=true`, blank Tavily/Sentry, tracing off | RevenueCat server API key, webhook authorization, allowed app IDs, existing AI provider settings |
| Mobile | Local Supabase URL/public key, API at port 8000, `EXPO_PUBLIC_BILLING_ENABLED=true` | RevenueCat public Test Store SDK key |

Expo itself loads `mobile/.env.local` ahead of `mobile/.env` during normal development. No custom loader was added: `mobile/src/services/api.ts` reads the `EXPO_PUBLIC_*` URLs/key, and `mobile/src/services/purchases.ts` reads the billing flag and public SDK key. Existing shell variables can take precedence here too. Restart the backend after backend environment edits; fully reload the app after mobile environment edits. [Expo environment variables](https://docs.expo.dev/guides/environment-variables/)

Both override files are ignored by Git. Local Supabase accounts/data are isolated; RevenueCat still uses its cloud Test Store, and existing AI providers remain external if invoked. This setup does not make every integration offline.

**Start everything after a reboot**

The initial setup already started Supabase, the API, proxy and tunnel in the background. If they are still running, use the dashboard test below directly; do not start another API/proxy on the same ports. Startup commands below are for stopped services.

1. Open Docker Desktop and wait until its engine is running.
2. In each terminal, start from the repository root:

   ```sh
   cd /Users/dimitriosmahairas/Documents/Projects/strength-and-conditioning-rag
   ```

3. Start/check the database:

   ```sh
   npm run db:local:start
   npm run db:local:status
   npm run db:local:migrations
   ```

   `db:local:start` can be repeated safely. For newly added migrations, run `npm run db:local:migrate`; it explicitly uses `--local`. **Do not use `npm run db:push` for local testing**: it targets the linked hosted project. Opening Studio confirms that the dashboard is available. Keep service secrets printed by the status command out of mobile configuration.

4. Leave each of these running in its own terminal:

   | Terminal | Command | Purpose |
   | --- | --- | --- |
   | A | `npm run api:local` | Arcel backend on 8000; open the health-check URL above |
   | B | `npm run webhook:proxy` | Forwards the permitted webhook route from 8001 to 8000 |
   | C | `npm run webhook:tunnel` | Prints a public `https://…trycloudflare.com` address |

5. Whenever the tunnel is restarted, copy the new address from Terminal C and append `/billing/webhooks/revenuecat`. Update the existing RevenueCat webhook URL before testing. The initial background run's URL is saved in `.local-dev/webhook-url.txt`; later manual tunnel commands print their new URL but do not update that file automatically.

**Where the public HTTPS URL comes from**

The setup downloaded the official **Cloudflare `cloudflared` 2026.9.0** macOS ARM64 release, verified its published SHA-256 checksum, and installed it in ignored `.local-dev/bin/cloudflared`. There is no global installation. Cloudflare Quick Tunnels allocate a temporary random `trycloudflare.com` hostname without requiring a Cloudflare account or purchased domain. [Official release](https://github.com/cloudflare/cloudflared/releases/tag/2026.9.0), [Quick Tunnel documentation](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)

```text
RevenueCat → Cloudflare HTTPS → local proxy :8001 → Arcel API :8000 → local Supabase
```

`server/scripts/revenuecat_webhook_proxy.py` forwards only exact `POST /billing/webhooks/revenuecat` requests, including the original body and authorization/signature headers. Supabase, Studio, backend docs and other API routes are not exposed through this tunnel. The backend authenticates webhook deliveries. The Mac must stay awake and all three processes must stay running. Restarting the tunnel normally changes its hostname; this is a development endpoint, not a permanent production URL.

**Test 1: webhook delivery, without the mobile app**

1. Open the existing configuration under RevenueCat **Integrations → Webhooks**.
2. Confirm its URL is the current tunnel URL including `/billing/webhooks/revenuecat`.
3. Set its Authorization header to the complete value of `REVENUECAT_WEBHOOK_AUTHORIZATION` from root `.env`, including `Bearer ` but excluding surrounding quotes. Select **Test Store**, **Sandbox** and all event types. The allowed app ID in the backend is `app33be86dd3f`, not the project ID. Leave HMAC disabled unless the matching signing secret has been configured on the backend.
4. Send the dashboard test event. RevenueCat should show HTTP **200**; the response body is `{"received":true}`. The backend terminal/log should show `POST /billing/webhooks/revenuecat` with status 200. [RevenueCat webhook testing](https://www.revenuecat.com/docs/integrations/webhooks)

The router deliberately skips database writes for event type `TEST`. This verifies delivery, authorization and app filtering; **no new subscription row or paid access is expected**. Opening the webhook URL in a browser sends GET and returns 405, which is expected.

**Test 2: mobile purchase and database verification**

Use an **iOS Simulator on this Mac** with the current local addresses. A physical phone cannot reach these loopback-only services; it needs separate private-LAN configuration for both the Arcel API and Supabase API.

1. Use Node **22.18+**. The shell's default was verified as 22.14.0. This machine also has a compatible bundled Node runtime; to use it in the mobile terminal without changing the global installation:

   ```sh
   export PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
   node --version
   ```

2. Once a native development build is installed, start Metro from the repository root:

   ```sh
   npm --prefix mobile run start -- --dev-client --port 8081
   ```

   Use 8082 if 8081 is occupied; the backend URL stays on 8000. To build the development app with Xcode/CocoaPods configured, run `npx expo run:ios --port 8081` from `mobile/` instead; it also starts Metro. The development build now compiles, installs and launches on the local iOS 27 simulator. Xcode 27 scene lifecycle support is enabled through `expo-build-properties` on Expo 57.0.24; see [native build configuration](../mobile/README.md#native-purchases). Purchase/restore validation remains a separate step. Expo Go is not the validation environment for this native flow.

3. Create a **new local account**, then complete onboarding. Existing hosted accounts do not exist locally. Use the test-email inbox if a confirmation/reset email is required.
4. Confirm the paywall shows both plans. Make a successful simulated Test Store purchase.
5. The app calls `POST /billing/sync`; access should unlock only after the backend verifies `arcel_pro` with RevenueCat.
6. Open Studio → Table Editor → `billing_entitlements`, filtered to this local user's UUID. Expect `environment=sandbox`, `entitlement_key=arcel_pro`, `active=true`, the purchased `product_id` (`monthly` or `yearly`), and expiry/verification timestamps. RevenueCat's customer App User ID should match the UUID in Studio → Authentication → Users.
7. Check RevenueCat's delivery history for the purchase event and a 200 response. A purchase event invalidates the cached verification (`verified_at=null`, revision increases); the next app status/sync request fetches current RevenueCat state. It does not grant access solely from the notification. A webhook arriving after purchase sync may leave `verified_at` null until the next refresh.

For a readable database view, run this in **local Studio → SQL Editor**:

```sql
select user_id, environment, entitlement_key, active, product_id,
       expires_at, verified_at, sync_revision
from public.billing_entitlements
order by updated_at desc;
```

**Logs, stopping and common failures**

For the initial background processes:

```sh
tail -f .local-dev/backend.log .local-dev/webhook-proxy.log .local-dev/tunnel.log
```

Stop foreground API/proxy/tunnel processes with Ctrl+C. For the initial background processes, their `.local-dev/*.pid` files identify only the processes started by this setup. `npm run db:local:stop` stops this project's Supabase services while retaining the local database volume. Do not use `--no-backup` unless intentionally deleting local data.

| Result | Meaning / next check |
| --- | --- |
| Address already in use | That local service may already be running; do not launch a second copy |
| Webhook 401 | Authorization mismatch, or signing mismatch when HMAC is enabled |
| Webhook 403 | Test/event app ID does not match `REVENUECAT_APP_IDS` |
| Webhook 405 from browser | Expected: browser GET is not a webhook POST |
| Tunnel unavailable / 502 | Check the current hostname and running tunnel, proxy and backend |
| Billing/webhook 503 | Inspect backend logs and local DB/settings; billing status/sync also requires RevenueCat availability |
| TEST returns 200 but no billing row | Expected; use Test 2 to verify purchase/database behavior |

### Local environment verification — 2026-09-19

- All seven repository migrations applied to the local Supabase PostgreSQL 17 database only.
- Local signup/profile creation, service-key billing access, and client billing-table denial verified against the running stack.
- Real RevenueCat backend verification returned inactive access for a fresh local account; no purchase was simulated as a paid entitlement.
- Public HTTPS webhook returned 401 without authorization and 200 with authorization; unrelated routes returned 404. A synthetic non-TEST renewal notification durably invalidated the local billing row, followed by successful backend re-verification. A dashboard-style TEST notification only acknowledged delivery.
- Local billing SQL permission/revision fixture passed. Backend regression suite: 187 tests passed; container binding helper: 10 focused tests passed.
- All published Supabase ports, Arcel API and webhook proxy verified on loopback. The local startup command is idempotent and data survived container recreation.
- RevenueCat dashboard webhook configuration and native mobile purchase validation remain user/testing steps. No hosted migration, production deployment or App Store submission was performed.

## Release and validation

Before enabling billing:

1. Run backend tests and mobile typecheck, lint, tests, and web export. Confirm billing-disabled startup works without RevenueCat secrets.
2. Verify monthly/yearly purchase success, cancellation, failure, restore, account switch, expiration, and Customer Center. Check both app display and backend access; a successful SDK callback alone is insufficient.
3. Verify webhook authorization/HMAC, app filtering, duplicate/delayed delivery, transfer invalidation, and provider unavailability. Confirm ordinary production accounts cannot gain access from sandbox purchases.
4. Run native Apple sandbox tests with the `appl_` key and real Apple products. Finalize prices, trial policy, legal URLs, support details, and the paywall configuration.
5. Review production activation separately. Configure GitHub **secrets** for the API key, webhook authorization, and optional signing secret; **variables** for `BILLING_ENABLED`, app IDs, and sandbox user IDs. The deployment workflow rejects incomplete enabled configuration, and supplies disabled defaults when unset. Set the production EAS environment's app-specific public key and deliberately change its billing flag only as part of that release.

**Deployment behavior:** matching pushes to `main` and manual runs of `.github/workflows/deploy-backend-cloud-run.yml` build/push the backend, apply pending Supabase migrations, then deploy Cloud Run. A push affecting this workflow or server/Supabase files can therefore change the live database even when billing is disabled. This setup does not run a deployment or configure any external dashboard.

### Implementation verification — 2026-09-19

- Backend: 177 tests passed; isolated SQL fixtures and billing/planning concurrency checks passed.
- Mobile: 143 tests passed, including 18 billing tests; typecheck, lint, and web export passed.
- Build/deploy configuration: 11 mobile guard cases and eight workflow validation cases passed.
- Native iOS: initial CocoaPods/system Ruby blockers were subsequently resolved. The iOS 27 launch failure was fixed with Expo 57.0.24 and the official `ios.enableSceneSupport` plugin setting. The development build compiles, installs and launches on the iPhone 18 Pro simulator. Mobile tests (143), typecheck, lint, web export and Expo Doctor (21 checks) pass after the patch. RevenueCat purchase/restore validation remains pending.
- Initial local-activation blockers were subsequently resolved by the isolated local setup above: backend/database/webhook services run with local billing enabled, a blank optional-use Tavily key, and configured RevenueCat credentials. The normal hosted configuration and production billing defaults remain unchanged.
- Production has not been deployed or enabled.
