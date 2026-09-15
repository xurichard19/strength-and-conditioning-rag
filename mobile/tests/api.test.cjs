const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// Transpile pure TypeScript in memory; no real credentials, network, Expo runtime, or build artifacts.
function load(file, modules = {}) {
  const source = readFileSync(resolve(__dirname, '../src', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (!(name in modules)) throw new Error(`unexpected import: ${name}`);
    return modules[name];
  }, URL, URLSearchParams, Headers, TextDecoder, AbortController, process: { env: {
    EXPO_PUBLIC_API_BASE_URL: 'https://api.test', EXPO_PUBLIC_SUPABASE_URL: 'https://db.test',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  } }, console });
  return exports;
}
const backend = load('services/backend.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const profile = { displayName: 'Ada', goal: 'Strong and fit', experienceLevel: 'new',
  trainingDays: ['Mon', 'Wed'], daysPerWeek: 3, sessionMinutes: 45, equipment: 'Dumbbells',
  cardio: 'Bike', theme: 'system', onboardingComplete: false };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const stream = text => {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
};
function authFixture() {
  let session = { user: { id: 'user-a' }, access_token: 'fresh-token' };
  const requests = [];
  const auth = { getSession: async () => ({ data: { session } }),
    signUp: async () => ({ data: { session } }),
    signInWithPassword: async () => ({ data: { session } }),
    setSession: async tokens => ({ data: { session: { ...session, ...tokens } } }),
    signOut: async () => (session = null, {}),
    startAutoRefresh() {}, stopAutoRefresh() {} };
  let options;
  const api = load('services/api.ts', {
    'react-native-url-polyfill/auto': {}, '@react-native-async-storage/async-storage': {},
    '@supabase/supabase-js': { createClient: (_url, key, opts) => {
      assert.equal(key, 'sb_publishable_test'); options = opts; return { auth };
    } },
    'expo-auth-session': { makeRedirectUri: () => 'arcel://' },
    'expo/fetch': { fetch: async (...args) => { requests.push(args); return response({}); } },
    'expo-linking': { createURL: path => `arcel://${path}` },
    'expo-web-browser': {}, 'react-native': { Platform: { OS: 'ios' }, AppState: { addEventListener() {} } },
    './backend': backend,
  });
  return { api, auth, requests, options, setSession: value => { session = value; } };
}

test('all survey answers round-trip as one dictionary, without local flags or profile identity', async () => {
  const answers = backend.surveyAnswers(profile, { runCapacity: '10–20 min', pushups: '5–10',
    pain: 'Ankle', note: 'Travel', futureQuestion: { nested: ['value'] } });
  const calls = [];
  const api = backend.createBackend(async (path, opts) => { calls.push([path, opts]); return response({ answers, completed_at: null }); });
  await api.saveAnswers(answers);
  assert.equal(calls[0][0], '/onboarding');
  assert.equal(calls[0][1].method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0][1].body), { answers: plain(answers) });
  assert.equal(answers.theme, undefined);
  assert.equal(answers.displayName, undefined);
  assert.equal(answers.onboardingComplete, undefined);
  assert.equal(answers.pain, 'Ankle');
  const restored = backend.profileFromApi({ id: 'a', display_name: 'Ada', timezone: 'UTC' },
    { answers, completed_at: '2026-09-15' }, profile);
  assert.deepEqual(plain(restored), { ...profile, onboardingComplete: true });
});

test('profile and onboarding use only current endpoints, never planning', async () => {
  const calls = [];
  const api = backend.createBackend(async (path, opts) => { calls.push([path, opts]); return response({}); });
  await api.getProfile(); await api.getOnboarding(); await api.saveProfile(' Ada ', 'UTC');
  await api.saveAnswers({ anything: ['works'] }); await api.completeOnboarding();
  assert.deepEqual(calls.map(call => call[0]), ['/profile', '/onboarding', '/profile', '/onboarding', '/onboarding/complete']);
  assert.deepEqual(JSON.parse(calls[2][1].body), { display_name: 'Ada', timezone: 'UTC' });
});

test('new users have no completed onboarding even when defaults were previously completed', () => {
  assert.equal(backend.profileFromApi({ display_name: null }, null, { ...profile, onboardingComplete: true }).onboardingComplete, false);
});

test('chat sends its conversation id and conversation listing supports pagination', async () => {
  const calls = [];
  const api = backend.createBackend(async (path, options) => {
    calls.push([path, options?.body && JSON.parse(options.body)]);
    return path === '/chat'
      ? new Response('{"type":"done","message_id":"saved"}\n')
      : response([]);
  });
  await api.getConversations('last-thread');
  await api.streamChat('hello', () => {}, () => {}, undefined, 'thread-a');
  assert.equal(calls[0][0], '/chat/conversations?before=last-thread');
  assert.deepEqual(calls[1][1], { text: 'hello', conversation_id: 'thread-a' });
});

test('history passes both cursor fields and a bounded page size', async () => {
  let url;
  await backend.createBackend(async path => { url = path; return response([]); })
    .getMessages('conversation-a', { id: 'message-a', created_at: '2026-09-15T00:00:00+00:00' });
  const query = new URL(url, 'https://api.test').searchParams;
  assert.equal(query.get('conversation_id'), 'conversation-a');
  assert.equal(query.get('limit'), '20');
  assert.equal(query.get('before_id'), 'message-a');
  assert.equal(query.get('before_created_at'), '2026-09-15T00:00:00+00:00');
});

test('chat handles split UTF-8, sources, and final persistence receipt without trailing newline', async () => {
  let text = ''; let sources;
  const id = await backend.readChatStream(stream([
    JSON.stringify({ type: 'text', delta: 'café 🏋️' }),
    JSON.stringify({ type: 'sources', sources: [{ title: 'Source' }] }),
    JSON.stringify({ type: 'done', message_id: 'saved-id' }),
  ].join('\n')), delta => { text += delta; }, value => { sources = value; });
  assert.equal(text, 'café 🏋️'); assert.equal(id, 'saved-id'); assert.equal(sources[0].title, 'Source');
});

test('chat rejects interrupted, malformed, and server-error streams', async () => {
  for (const [body, expected] of [
    ['{"type":"text","delta":"partial"}\n', /before the reply was confirmed/],
    ['{"type":"error","message":"save failed"}', /save failed/],
    ['not-json', /JSON|Unexpected/],
    ['{"type":"done"}', /Invalid chat/],
  ]) await assert.rejects(backend.readChatStream(stream(body), () => {}, () => {}), expected);
});

test('failed POST exposes the server error and is not retried', async () => {
  let count = 0;
  const api = backend.createBackend(async () => { count++; return response({ detail: 'chat unavailable' }, 503); });
  await assert.rejects(api.streamChat('hello', () => {}, () => {}, undefined, 'conversation-a'), /chat unavailable/);
  assert.equal(count, 1);
});

test('signup delegates to Supabase only, with or without email confirmation', async () => {
  const f = authFixture();
  assert.equal((await f.api.signUp('a@test.invalid', 'password')).user.id, 'user-a');
  f.setSession(null);
  assert.equal(await f.api.signUp('a@test.invalid', 'password'), null);
  assert.equal(f.requests.length, 0);
  assert.equal(f.options.auth.persistSession, true);
  assert.equal(f.options.auth.autoRefreshToken, true);
});

test('signup includes client timezone even before email confirmation', async () => {
  const f = authFixture();
  let payload;
  f.auth.signUp = async input => { payload = input; return { data: { session: null } }; };
  await f.api.signUp('a@test.invalid', 'password');
  assert.equal(payload.options.data.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone);
});

test('timezone sync patches only timezone, not the display name', async () => {
  let payload;
  const api = backend.createBackend(async (path, options) => {
    assert.equal(path, '/profile'); payload = JSON.parse(options.body); return response({});
  });
  await api.saveTimezone('America/New_York');
  assert.deepEqual(payload, { timezone: 'America/New_York' });
});

test('sign-in failures stay errors, not demo sessions', async () => {
  const f = authFixture();
  f.auth.signInWithPassword = async () => ({ error: new Error('Invalid credentials') });
  await assert.rejects(f.api.signIn('a', 'bad'), /Invalid credentials/);
});

test('requests use the refreshed session token and reject account switches before sending', async () => {
  const f = authFixture();
  const api = f.api.backendFor('user-a');
  await api.getProfile();
  assert.equal(f.requests[0][1].headers.get('Authorization'), 'Bearer fresh-token');
  f.setSession({ user: { id: 'user-b' }, access_token: 'other-token' });
  await assert.rejects(api.saveAnswers({}), /sign in again/);
  assert.equal(f.requests.length, 1);
  await f.api.signOut();
  assert.equal(await f.api.getAuthSession(), null);
});

test('native auth callback restores tokens and rejects invalid links', async () => {
  const f = authFixture();
  assert.equal((await f.api.sessionFromAuthUrl('arcel:///#access_token=access&refresh_token=refresh')).access_token, 'access');
  await assert.rejects(f.api.sessionFromAuthUrl('arcel:///#error_description=Expired'), /Expired/);
  await assert.rejects(f.api.sessionFromAuthUrl('arcel:///'), /valid session/);
});

// Deterministic hook harness: exercise the provider without mounting native views.
function providerFixture(apiOverrides = {}) {
  const slots = []; let cursor = 0; let dirty = true; let value; let effects = [];
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((item, i) => item !== b[i]);
  const hooks = {
    createContext: () => ({ Provider: 'provider' }),
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], update => { slots[index] = typeof update === 'function' ? update(slots[index]) : update; dirty = true; }];
    },
    useRef: initial => { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback: (fn, deps) => {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { deps, fn };
      return slots[index].fn;
    },
    useEffect: (fn, deps) => {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  const calls = [];
  const api = {
    getProfile: async () => ({ id: 'user-a', display_name: 'Ada', timezone: 'UTC' }),
    getOnboarding: async () => null,
    getMessages: async () => [],
    getConversations: async () => [],
    saveProfile: async () => { calls.push('profile'); },
    saveAnswers: async answers => { calls.push(['answers', plain(answers)]); },
    completeOnboarding: async () => { calls.push('complete'); return { answers: { note: 'saved' }, completed_at: 'now' }; },
    ...apiOverrides,
  };
  let authListener;
  const provider = load('state/app-context.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx: (_type, props) => (value = props.value) },
    'expo-crypto': { randomUUID: require('node:crypto').randomUUID },
    'expo-haptics': {},
    'expo-linking': { getInitialURL: async () => null, addEventListener: () => ({ remove() {} }) },
    'react-native': { Platform: { OS: 'ios' }, useColorScheme: () => 'light', AppState: { addEventListener: () => ({ remove() {} }) } },
    '@/design/tokens': { palettes: { light: {}, dark: {} } },
    '@/data/mock': { defaultProfile: profile, currentBlock: {}, initialWeek: [], initialProposal: null, progressMetrics: [] },
    '@/lib/errors': { errorMessage: (error, fallback) => error.message || fallback },
    '@/services/api': {
      backendFor: () => api, getAuthSession: async () => null, profileFromApi: backend.profileFromApi,
      deviceTimezone: () => 'UTC',
      signIn: async () => ({ user: { id: 'user-a' }, access_token: 'token' }),
      signOut: async () => {},
      supabase: { auth: { onAuthStateChange: fn => (authListener = fn, { data: { subscription: { unsubscribe() {} } } }) } },
    },
  });
  async function flush() {
    for (let i = 0; i < 20; i++) {
      if (dirty) { dirty = false; cursor = 0; provider.AppProvider({ children: null }); }
      const work = effects; effects = []; work.forEach(fn => fn());
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  return { flush, calls, get value() { return value; }, auth: (...args) => authListener(...args) };
}

test('provider finishes onboarding only after API save and never calls planning', async () => {
  const f = providerFixture(); await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  assert.equal(f.value.accountReady, true);
  assert.equal(f.value.sessions.length, 0);
  assert.equal(await f.value.finishOnboarding(profile, { pain: 'ankle' }), true);
  await f.flush();
  assert.deepEqual(f.calls, ['profile', ['answers', { pain: 'ankle' }], 'complete']);
  assert.equal(f.value.profile.onboardingComplete, true);
});

test('account loading syncs a changed device timezone before onboarding', async () => {
  const writes = [];
  const f = providerFixture({
    getProfile: async () => ({ id: 'user-a', display_name: 'Ada', timezone: 'America/New_York' }),
    saveTimezone: async timezone => { writes.push(timezone); },
  });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  assert.deepEqual(writes, ['UTC']); // fixture device timezone, not the stored timezone
  assert.equal(f.value.accountReady, true);
});

test('failed onboarding stays incomplete and exposes the error', async () => {
  const f = providerFixture({ saveAnswers: async () => { throw new Error('offline'); } });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  assert.equal(await f.value.finishOnboarding(profile, {}), false); await f.flush();
  assert.equal(f.value.profile.onboardingComplete, false);
  assert.equal(f.value.notice, 'offline');
});

test('account loading errors do not unlock default onboarding as a valid account', async () => {
  const f = providerFixture({ getProfile: async () => { throw new Error('profile not found'); } });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  assert.equal(f.value.accountReady, false);
  assert.equal(f.value.accountError, 'profile not found');
});

test('logout aborts chat and discards late reply updates', async () => {
  let finish; let sendDelta; let signal;
  const f = providerFixture({ streamChat: (_text, delta, _sources, abortSignal) => {
    signal = abortSignal; sendDelta = delta; return new Promise(resolve => { finish = resolve; });
  } });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  const pending = f.value.sendChat('hello'); await f.flush();
  await f.value.signOut(); await f.flush();
  assert.equal(signal.aborted, true);
  sendDelta('old account reply'); finish('saved-id'); await pending; await f.flush();
  assert.equal(f.value.chatMessages.length, 0);
  assert.equal(f.value.authSession, null);
});

test('new chats are lazy, reuse their id for replies, and reset on opening chat', async () => {
  const ids = [];
  const f = providerFixture({ streamChat: async (_text, _delta, _sources, _signal, id) => {
    ids.push(id); return 'saved';
  } });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  f.value.openConversation(); await f.flush();
  assert.equal(ids.length, 0);
  await f.value.sendChat('first'); await f.flush();
  await f.value.sendChat('second'); await f.flush();
  assert.equal(ids[0], ids[1]);
  f.value.openConversation(); await f.flush();
  assert.equal(f.value.chatMessages.length, 0);
  await f.value.sendChat('new thread'); await f.flush();
  assert.notEqual(ids[0], ids[2]);
});

test('switching conversations discards a late history response', async () => {
  let finish;
  const f = providerFixture({ getMessages: id => id === 'old'
    ? new Promise(resolve => { finish = resolve; })
    : Promise.resolve([{ id: 'new-message', role: 'user', content: 'new', created_at: 'now' }]) });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  f.value.openConversation('old'); await f.flush();
  f.value.openConversation('new'); await f.flush();
  finish([{ id: 'old-message', role: 'user', content: 'old', created_at: 'then' }]); await f.flush();
  assert.equal(f.value.chatMessages[0].id, 'new-message');
});

test('switching conversations aborts the old stream and ignores its late text', async () => {
  let finish; let delta; let signal;
  const f = providerFixture({ streamChat: (_text, onText, _sources, abort) => {
    delta = onText; signal = abort; return new Promise(resolve => { finish = resolve; });
  } });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  const pending = f.value.sendChat('old'); await f.flush();
  f.value.openConversation(); await f.flush();
  assert.equal(signal.aborted, true);
  delta('late'); finish('saved'); await pending; await f.flush();
  assert.equal(f.value.chatMessages.length, 0);
  assert.equal(f.value.chatBusy, false);
});

test('a late profile load from the previous user cannot overwrite a new account', async () => {
  let resolveOld; let count = 0;
  const f = providerFixture({ getProfile: () => ++count === 1
    ? new Promise(resolve => { resolveOld = resolve; })
    : Promise.resolve({ id: 'user-b', display_name: 'Bob', timezone: 'UTC' }) });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  f.auth('SIGNED_IN', { user: { id: 'user-b' }, access_token: 'b' }); await f.flush();
  resolveOld({ id: 'user-a', display_name: 'Ada', timezone: 'UTC' }); await f.flush();
  assert.equal(f.value.profile.displayName, 'Bob');
});
