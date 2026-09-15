# Arcel mobile

Live scope: Supabase authentication, profile, onboarding, and persisted streaming chat.
Planning, calendar syncing, workout writes, and background jobs are intentionally not called.
The previous training screens use labeled mock workouts, proposals, and progress charts.
Their interactions only change memory: nothing is synced, and they reset on restart or account change.

## Run

Use Node 22.13+ and install the dependencies in `mobile`:

```sh
npm install
npm start
```

Configure these three values in `mobile/.env`, using `.env.example` as the template:

- `EXPO_PUBLIC_API_BASE_URL`: the deployed backend URL, reachable from the phone.
- `EXPO_PUBLIC_SUPABASE_URL`: the same Supabase project used by the backend.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: its `sb_publishable_...` key.

Restart Expo after changing environment variables. Never include secret keys,
database passwords, or management tokens in the mobile app.

## API handoff

- Signup/login/logout and token refresh use Supabase Auth directly. The database
  signup trigger creates the profile; mobile never calls a profile-create endpoint.
- `GET /profile` and `PATCH /profile` handle identity and timezone.
- `GET /onboarding`, `PUT /onboarding` with `{ answers: { ... } }`, and
  `POST /onboarding/complete` handle the questionnaire. All survey values, including
  running capacity, push-ups, pain, and free-text notes, share one JSON dictionary.
  Display name is saved separately; theme and completion flags are not survey answers.
- Opening Chat starts a fresh, unsaved conversation. The hamburger menu loads
  `GET /chat/conversations` in pages of 50, with the last ID as the `before` cursor.
  The first human message atomically creates the thread, titled YYYY-MM-DD HH:MM in the
  profile timezone. Existing history is preserved as one conversation per user.
- `GET /chat/messages?conversation_id=UUID` loads chronological pages of 20 messages.
  Older pages use timestamp and ID cursors. Foreground refresh stays in the selected thread.
- `POST /chat` accepts `{text, conversation_id}` and streams NDJSON. A `saved` event
  contains the persisted human message; `done.message` contains the saved assistant
  record so the cache can merge exact IDs and timestamps without reloading history.
  Text is provisional until `done.message_id` confirms
  persistence. Only the backend saves human/assistant messages; mobile never inserts
  assistant rows or automatically retries a failed send.
- Account changes clear in-memory state and abort the local chat stream. Late responses
  from an old account are ignored. Account-loading failures have retry/sign-out controls.
- Chat has no demo fallback. Training screens are explicitly mock previews, not live workouts.
  Missing configuration and server errors are visible.
  The older prototype snapshot cache is no longer read or written.

Deploy the conversation migration and backend before running this mobile version.
The chat heading starts as Ask Arcel and switches to the title on first send.
The top-right menu renames or permanently deletes the selected conversation and its messages.
Rename/delete wait for its current reply to finish. Apply the conversation-management migration
for these permissions and minute-precision default titles; existing titles are unchanged.
History loads automatically on selection and app foreground; only errors expose a reload control.
Saved history is displayed in the client but is not passed into AI generation.
History retrieval will be implemented inside workflow nodes separately.
Run setup again opens a local draft; its X exits without saving or clearing completion.

The server still generates chat inside the streaming request. Switching threads no longer
aborts generation: up to three requests can run independently and update their originating
conversation. Logout or provider teardown aborts all requests. Closing the app or
losing the connection can leave a saved human message without a saved reply.
Refreshing history retrieves whatever the server saved; this does not provide
durable background generation. Source citations are currently streamed only, not
stored in the messages table, so they may not appear after restarting the app.

## Chat cache

`src/state/chat-cache.ts` is the account-scoped, memory-only storage boundary.
No SQLite, disk persistence, background worker, or additional dependency is required.
It can be replaced by a persistent implementation later; cache data is never AI context.

- Sidebar: reuse even empty lists for 60 seconds; retain up to 500 loaded records.
  Stale newest pages refresh behind the displayed data; older pages stay available.
  If the new page no longer overlaps cached history, drop the disconnected window.
- Metadata: one shared record per conversation serves the list and heading.
  Records have independent 60-second freshness; selecting an older thread revalidates
  its title when needed. Confirmed renames update the record without refreshing list age.
- Messages: newest-page freshness is 60 seconds; retain five least-recently-used
  conversation windows, at most 200 rows each and about 5 MB of content combined.
  Older scrolling evicts the opposite end when necessary. Oversized responses can be
  displayed without being retained; the budget does not include UI/runtime or live-stream memory.
- Reads for the same key share an in-flight request. Confirmed writes merge by ID;
  deletes evict metadata/messages. Mutations and logout fence off older responses.
- Cache survives tab switches, not process restarts. Failures keep stale data visible.
  Pagination may refetch evicted windows; this does not delete anything from Supabase.

Mobile opts into saved-human stream events with `X-Chat-Saved-Events: 1`.
The backend omits that event for older clients; new clients fall back to one history
read when an older backend does not provide saved records. Backend/mobile releases
do not need to happen simultaneously for this stream change.

## Auth callback configuration

In Supabase Authentication → URL Configuration, allow the actual web origin and
recovery path, plus your development/production app callback URLs. Native builds
use the `arcel` scheme in `app.json`; Expo Go uses a development URL for email links.
Use a development build for reliable native OAuth testing.

Google sign-in additionally requires enabling the Google provider in Supabase and
configuring its callback in Google Cloud. Keep the Google client secret out of mobile.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run export:web
```

Unit tests use fake credentials and mocked HTTP; they do not create real accounts.

On a device, verify:
1. Create a fresh test account; confirm its email if confirmation is enabled.
2. Sign in and complete onboarding. Check that all answers are in the single
   `onboarding_responses.answers` object and completion has a server timestamp.
3. Send a chat message, see the streamed response, and refresh saved messages.
4. Close/reopen the app, then sign out/in. Verify the same onboarding and chat history.
5. Sign into a different account and confirm no previous account data appears.
6. Test invalid credentials, an offline backend, interrupted chat, and password recovery.

After a database reset, existing Auth users may lack profiles because the signup
trigger only runs for new users. Start with a fresh test account; missing profiles
are surfaced rather than silently recreated by the client.
