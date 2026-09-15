# Arcel mobile

Live scope: Supabase authentication, profile, onboarding, and persisted streaming chat.
Planning, calendar syncing, workout writes, and background jobs are intentionally not called.

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
- `GET /chat/messages` loads chronological pages of 20 messages. Older pages use
  both timestamp and ID cursors. History refreshes on chat focus and app foreground.
- `POST /chat` streams NDJSON. Text is provisional until `done.message_id` confirms
  persistence. Only the backend saves human/assistant messages; mobile never inserts
  assistant rows or automatically retries a failed send.
- Account changes clear in-memory state and abort the local chat stream. Late responses
  from an old account are ignored. Account-loading failures have retry/sign-out controls.
- No demo chat or workout fallback. Missing configuration and server errors are visible.
  The older prototype snapshot cache is no longer read or written.

The server still generates chat inside the streaming request. Closing the app or
losing the connection can leave a saved human message without a saved reply.
Refreshing history retrieves whatever the server saved; this does not provide
durable background generation. Source citations are currently streamed only, not
stored in the messages table, so they may not appear after restarting the app.

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
