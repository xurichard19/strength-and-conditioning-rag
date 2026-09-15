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
const { createChatCache } = load('state/chat-cache.ts');
const { webUrl } = load('lib/links.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const profile = { displayName: 'Ada', goal: 'Strong and fit', experienceLevel: 'new',
  trainingDays: ['Mon', 'Wed'], daysPerWeek: 3, sessionMinutes: 45, equipment: 'Dumbbells',
  cardio: 'Bike', theme: 'system', onboardingComplete: false };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const convo = (id, title = id) => ({ id, title, created_at: '2026-09-15T12:00:00Z' });
const savedMessage = (id, content = id) => ({ id, role: 'user', content, created_at: '2026-09-15T12:00:00Z' });

test('AI and retrieved links cannot launch script, file, or native app schemes', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,unsafe', 'file:///secret',
    'intent://open', 'arcel:///#access_token=attacker', 'https://user:password@example.com', '//example.com', null]) {
    assert.equal(webUrl(url), null);
  }
  assert.equal(webUrl('https://doi.org/10.1/paper'), 'https://doi.org/10.1/paper');
  assert.equal(webUrl('http://example.com'), 'http://example.com/');
});

test('refreshing a disconnected newest page drops older cached rows rather than hiding a gap', async () => {
  let clock = 0;
  const cache = createChatCache({ now: () => clock });
  const page = start => Array.from({ length: 20 }, (_, i) => savedMessage(String(start + i).padStart(4, '0')));
  await cache.loadMessages({ getMessages: async () => page(0) }, 'thread');
  clock = 60_001;
  await cache.loadMessages({ getMessages: async () => page(100) }, 'thread');
  assert.equal(cache.peekMessages('thread').rows.length, 20);
  assert.equal(cache.peekMessages('thread').rows[0].id, '0100');
  assert.equal(cache.peekMessages('thread').more, true);
});

test('late older pages cannot splice a gap into a newly refreshed history window', async () => {
  const cache = createChatCache();
  const page = (start, count, row) => Array.from({ length: count }, (_, i) => row(String(start + i).padStart(4, '0')));
  let finish;
  await cache.loadMessages({ getMessages: async () => page(100, 20, savedMessage) }, 'thread');
  const olderMessages = cache.loadMessages({ getMessages: () => new Promise(resolve => { finish = resolve; }) }, 'thread', true);
  await cache.loadMessages({ getMessages: async () => page(200, 20, savedMessage) }, 'thread', false, true);
  finish(page(80, 20, savedMessage)); await olderMessages;
  assert.equal(cache.peekMessages('thread').rows[0].id, '0200');
  assert.equal(cache.peekMessages('thread').rows.length, 20);

  let clock = 0;
  const list = createChatCache({ now: () => clock });
  await list.loadList({ getConversations: async () => page(100, 50, convo) });
  const olderList = list.loadList({ getConversations: () => new Promise(resolve => { finish = resolve; }) }, true);
  clock = 60_001;
  await list.loadList({ getConversations: async () => page(200, 50, convo) });
  finish(page(50, 50, convo)); await olderList;
  assert.equal(list.peekList().rows.at(-1).id, '0200');
  assert.equal(list.peekList().rows.length, 50);
});

test('conversation windows remain bounded and reopen at the newest page after older-page eviction', async () => {
  const cache = createChatCache();
  const api = { getConversations: async before => {
    const end = before ? Number(before) : 1000;
    return Array.from({ length: 50 }, (_, i) => convo(String(end - 1 - i).padStart(4, '0')));
  } };
  await cache.loadList(api);
  for (let i = 0; i < 10; i++) await cache.loadList(api, true);
  assert.equal(cache.peekList().rows.length, 500);
  assert.equal(cache.peekList().rows[0].id, '0949');
  await cache.loadList(api);
  assert.equal(cache.peekList().rows[0].id, '0999');
});

test('cache stores empty lists, coalesces reads, and refreshes only after expiry', async () => {
  let clock = 0; let calls = 0; let finish;
  const cache = createChatCache({ now: () => clock });
  const api = { getConversations: () => { calls++; return new Promise(resolve => { finish = resolve; }); } };
  const first = cache.loadList(api); const second = cache.loadList(api);
  assert.equal(calls, 1); finish([]); await Promise.all([first, second]);
  await cache.loadList(api); assert.equal(calls, 1);
  clock = 60_001;
  const refresh = cache.loadList(api);
  assert.equal(cache.peekList().rows.length, 0);
  finish([convo('a')]); await refresh;
  assert.equal(calls, 2);
  assert.equal((await cache.loadConversation(api, 'a')).id, 'a');
});

test('cache rename and deletion defeat older reads without refreshing unrelated list freshness', async () => {
  let clock = 0; let finish;
  const cache = createChatCache({ now: () => clock });
  await cache.loadList({ getConversations: async () => [convo('a')] });
  clock = 60_001;
  const old = cache.loadList({ getConversations: () => new Promise(resolve => { finish = resolve; }) });
  cache.putConversation(convo('a', 'Renamed'));
  finish([convo('a', 'Old')]); await old;
  assert.equal(cache.peekList().rows[0].title, 'Renamed');
  assert.equal(cache.peekList().fetchedAt, 0);
  const old2 = cache.loadList({ getConversations: () => new Promise(resolve => { finish = resolve; }) });
  cache.removeConversation('a'); finish([convo('a')]); await old2;
  assert.equal(cache.peekList().rows.length, 0);
});

test('cache clear rejects late account reads and failed refresh retains stale data', async () => {
  let clock = 0; let finish;
  const cache = createChatCache({ now: () => clock });
  await cache.loadList({ getConversations: async () => [convo('a')] });
  clock = 60_001;
  await assert.rejects(cache.loadList({ getConversations: async () => { throw new Error('offline'); } }), /offline/);
  assert.equal(cache.peekList().rows[0].id, 'a');
  const old = cache.loadList({ getConversations: () => new Promise(resolve => { finish = resolve; }) });
  cache.clear(); finish([convo('private')]); await old;
  assert.equal(cache.peekList(), undefined);
  assert.equal(cache.peekConversation('private'), undefined);
});

test('message cache deduplicates pages, reuses history, and fences pre-send reads', async () => {
  let clock = 0; let calls = 0; let finish;
  const cache = createChatCache({ now: () => clock });
  const api = { getMessages: async () => { calls++; return [savedMessage('a')]; } };
  await cache.loadMessages(api, 'thread'); await cache.loadMessages(api, 'thread');
  assert.equal(calls, 1);
  clock = 60_001;
  const old = cache.loadMessages({ getMessages: () => new Promise(resolve => { finish = resolve; }) }, 'thread');
  cache.putMessages('thread', [savedMessage('a'), savedMessage('b')]);
  finish([savedMessage('a')]); await old;
  assert.deepEqual(plain(cache.peekMessages('thread').rows.map(row => row.id)), ['a', 'b']);
});

test('message cache enforces LRU and content budgets', async () => {
  const cache = createChatCache({ maxThreads: 2, maxBytes: 1000 });
  cache.putMessages('a', [savedMessage('1')]);
  cache.putMessages('b', [savedMessage('2')]);
  cache.peekMessages('a');
  cache.putMessages('c', [savedMessage('3')]);
  assert.equal(cache.peekMessages('b'), undefined);
  assert.notEqual(cache.peekMessages('a'), undefined);
  cache.putMessages('huge', [savedMessage('4', 'x'.repeat(1000))]);
  assert.equal(cache.peekMessages('huge'), undefined);
});

test('writes invalidate only related reads, not other conversations', async () => {
  const cache = createChatCache();
  let finish;
  const read = cache.loadMessages({ getMessages: () => new Promise(resolve => { finish = resolve; }) }, 'b');
  cache.putMessages('a', [savedMessage('a-message')]);
  finish([savedMessage('b-message')]); await read;
  assert.equal(cache.peekMessages('b').rows[0].id, 'b-message');
});

test('conversation pagination retains previously loaded pages across sidebar opens', async () => {
  const cache = createChatCache();
  let calls = 0;
  const api = { getConversations: async before => {
    calls++;
    return before ? [convo('000')] : Array.from({ length: 50 }, (_, i) => convo(String(i + 1).padStart(3, '0')));
  } };
  await cache.loadList(api); await cache.loadList(api, true); await cache.loadList(api);
  assert.equal(calls, 2);
  assert.equal(cache.peekList().rows.length, 51);
});

test('metadata lookup respects its own TTL and an exhausted refresh removes stale list entries', async () => {
  let clock = 0; let reads = 0;
  const cache = createChatCache({ now: () => clock });
  const api = {
    getConversations: async () => [convo('a'), convo('b')],
    getConversation: async id => { reads++; return convo(id, 'Remote rename'); },
  };
  await cache.loadList(api);
  await cache.loadConversation(api, 'a'); assert.equal(reads, 0);
  clock = 60_001;
  await cache.loadConversation(api, 'a'); assert.equal(reads, 1);
  await cache.loadList({ getConversations: async () => [convo('a')] });
  assert.equal(cache.peekList().rows.length, 1);
});

test('older message windows stay bounded and reopening reloads evicted newest history', async () => {
  const cache = createChatCache();
  let reads = 0;
  const api = { getMessages: async (_id, before) => {
    reads++;
    const end = before ? Number(before.id) : 1000;
    return Array.from({ length: 20 }, (_, i) => savedMessage(String(end - 20 + i).padStart(4, '0')));
  } };
  await cache.loadMessages(api, 'thread');
  for (let i = 0; i < 10; i++) await cache.loadMessages(api, 'thread', true);
  assert.equal(cache.peekMessages('thread').rows.length, 200);
  await cache.loadMessages(api, 'thread');
  assert.equal(cache.peekMessages('thread').rows.at(-1).id, '0999');
  assert.equal(reads, 12);
});

test('message ordering preserves database microseconds before using the UUID tie breaker', () => {
  const cache = createChatCache();
  cache.putMessages('thread', [
    { ...savedMessage('a'), created_at: '2026-09-15T12:00:00.000900+00:00' },
    { ...savedMessage('z'), created_at: '2026-09-15T12:00:00.000100+00:00' },
  ]);
  assert.deepEqual(plain(cache.peekMessages('thread').rows.map(row => row.id)), ['z', 'a']);
});

test('stream confirmations deliver exact saved human and assistant rows to the cache callback', async () => {
  const human = savedMessage('human', 'question');
  const reply = { ...savedMessage('reply', 'answer'), role: 'assistant' };
  const received = [];
  await backend.readChatStream(new Response([
    JSON.stringify({ type: 'saved', message: human }),
    JSON.stringify({ type: 'text', delta: 'answer' }),
    JSON.stringify({ type: 'done', message_id: reply.id, message: reply }),
  ].join('\n')).body, () => {}, () => {}, row => received.push(plain(row)));
  assert.deepEqual(received, [human, reply]);
});
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
    if (path === '/chat') assert.equal(options.headers['X-Chat-Saved-Events'], '1');
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

test('saved stream events validate their shape even without a cache callback', async () => {
  for (const message of [null, {}, savedMessage(42), { ...savedMessage('a'), created_at: 'invalid' }]) {
    await assert.rejects(backend.readChatStream(new Response(JSON.stringify({ type: 'saved', message })).body,
      () => {}, () => {}), /Invalid saved message/);
  }
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
    getConversation: async id => ({ id, title: '2026-09-15 09:30', created_at: 'now' }),
    renameConversation: async (id, title) => ({ id, title: title.trim(), created_at: 'now' }),
    deleteConversation: async () => {},
    saveProfile: async () => { calls.push('profile'); },
    saveAnswers: async answers => { calls.push(['answers', plain(answers)]); },
    completeOnboarding: async () => { calls.push('complete'); return { answers: { note: 'saved' }, completed_at: 'now' }; },
    ...apiOverrides,
  };
  let authListener;
  const provider = load('state/app-context.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx: (_type, props) => (value = props.value) },
    'expo-crypto': { randomUUID: require('node:crypto').randomUUID },
    './chat-cache': { createChatCache },
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

test('an older account read cannot overwrite newly completed onboarding', async () => {
  let finish; let delayed = false;
  const f = providerFixture({ getOnboarding: () => delayed
    ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(null) });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  delayed = true;
  const pending = f.value.refreshLiveData(); await f.flush();
  await f.value.finishOnboarding(profile, {}); await f.flush();
  finish(null); await pending; await f.flush();
  assert.equal(f.value.profile.onboardingComplete, true);
  assert.deepEqual(plain(f.value.onboardingAnswers), { note: 'saved' });
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

test('older-server reconciliation does not duplicate the optimistic human message', async () => {
  const human = savedMessage('human', 'hello');
  const reply = { ...savedMessage('reply', 'answer'), role: 'assistant' };
  const f = providerFixture({
    streamChat: async (_text, delta) => { delta('answer'); return reply.id; },
    getMessages: async () => [human, reply],
  });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  await f.value.sendChat('hello'); await f.flush();
  assert.deepEqual(plain(f.value.chatMessages.map(row => row.id)), ['human', 'reply']);
});

test('conversation headings follow selection and saved renames; deletion opens an empty chat', async () => {
  const f = providerFixture();
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  assert.equal(f.value.chatTitle, 'Ask Arcel');
  f.value.openConversation('thread-a', '2026-09-15 09:30'); await f.flush();
  assert.equal(f.value.chatTitle, '2026-09-15 09:30');
  await f.value.renameConversation('Training questions'); await f.flush();
  assert.equal(f.value.chatTitle, 'Training questions');
  await f.value.deleteConversation(); await f.flush();
  assert.equal(f.value.chatTitle, 'Ask Arcel');
  assert.equal(f.value.activeConversationId, null);
});

test('first send changes heading before the reply completes', async () => {
  let finish;
  const f = providerFixture({ streamChat: () => new Promise(resolve => { finish = resolve; }) });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  const pending = f.value.sendChat('hello'); await f.flush();
  assert.match(f.value.chatTitle, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(f.value.activeConversationId, null);
  finish('saved'); await pending; await f.flush();
  assert.equal(f.value.chatTitle, '2026-09-15 09:30');
  assert.notEqual(f.value.activeConversationId, null);
});

test('offline first send never enables saved-conversation actions and preserves its retry id', async () => {
  const ids = [];
  const f = providerFixture({
    streamChat: async (_text, _delta, _sources, _signal, id) => { ids.push(id); throw new Error('offline'); },
    getConversation: async () => { throw new Error('offline'); },
  });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  await f.value.sendChat('hello'); await f.flush();
  assert.equal(f.value.activeConversationId, null);
  assert.equal(f.value.chatBusy, false);
  await f.value.sendChat('retry'); await f.flush();
  assert.equal(ids[0], ids[1]);
  assert.equal(f.value.activeConversationId, null);
});

test('failed reply still recognizes a persisted conversation without retrying the send', async () => {
  let sends = 0;
  const f = providerFixture({ streamChat: async () => { sends++; throw new Error('interrupted'); } });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  await f.value.sendChat('hello'); await f.flush();
  assert.equal(sends, 1);
  assert.notEqual(f.value.activeConversationId, null);
  assert.equal(f.value.chatTitle, '2026-09-15 09:30');
  assert.match(f.value.chatError, /interrupted/);
});

test('saved reply confirms the conversation even when the title lookup fails', async () => {
  const f = providerFixture({
    streamChat: async () => 'saved-message',
    getConversation: async () => { throw new Error('offline'); },
  });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  await f.value.sendChat('hello'); await f.flush();
  assert.notEqual(f.value.activeConversationId, null);
  assert.equal(f.value.chatError, null);
  assert.equal(f.value.chatBusy, false);
});

test('late conversation confirmation cannot activate a newly opened empty chat', async () => {
  let finish;
  const f = providerFixture({
    streamChat: async () => { throw new Error('interrupted'); },
    getConversation: () => new Promise(resolve => { finish = resolve; }),
  });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  const pending = f.value.sendChat('hello'); await f.flush();
  f.value.openConversation(); await f.flush();
  finish({ id: 'old-thread', title: 'Old title' }); await pending; await f.flush();
  assert.equal(f.value.activeConversationId, null);
  assert.equal(f.value.chatTitle, 'Ask Arcel');
});

test('failed rename/delete preserves the current heading and conversation', async () => {
  const f = providerFixture({
    getConversation: async id => convo(id, 'Original'),
    renameConversation: async () => { throw new Error('offline'); },
    deleteConversation: async () => { throw new Error('offline'); },
  });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  f.value.openConversation('thread-a', 'Original'); await f.flush();
  await assert.rejects(f.value.renameConversation('Changed'), /offline/);
  await assert.rejects(f.value.deleteConversation(), /offline/);
  await f.flush();
  assert.equal(f.value.chatTitle, 'Original');
  assert.equal(f.value.activeConversationId, 'thread-a');
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

test('completed background reply reopens from cache without reloading messages or metadata', async () => {
  let finish; let saved; let onText; let id; let reads = 0; let metadataReads = 0;
  const f = providerFixture({
    getMessages: async () => { reads++; return []; },
    getConversation: async key => { metadataReads++; return convo(key); },
    streamChat: (_text, delta, _sources, _signal, key, onSaved) => {
      id = key; saved = onSaved; onText = delta;
      onSaved(savedMessage('human', 'hello'));
      return new Promise(resolve => { finish = resolve; });
    },
  });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  await f.value.refreshConversations(); await f.flush();
  const pending = f.value.sendChat('hello'); await f.flush();
  f.value.openConversation(); await f.flush();
  onText('answer');
  saved({ ...savedMessage('reply', 'answer'), role: 'assistant' });
  finish('reply'); await pending; await f.flush();
  assert.equal(f.value.chatMessages.length, 0);
  f.value.openConversation(id); await f.flush();
  assert.deepEqual(plain(f.value.chatMessages.map(row => row.text)), ['hello', 'answer']);
  assert.equal(reads, 0);
  assert.equal(metadataReads, 1);
  assert.equal(f.value.chatBusy, false);
  assert.equal(f.value.conversations[0].id, id);
});

test('sidebar reads are reused, including after opening and closing it repeatedly', async () => {
  let reads = 0;
  const f = providerFixture({ getConversations: async () => { reads++; return [convo('a')]; } });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  await Promise.all([f.value.refreshConversations(), f.value.refreshConversations()]); await f.flush();
  await f.value.refreshConversations(); await f.flush();
  assert.equal(reads, 1);
  assert.equal(f.value.conversations.length, 1);
});

test('switching conversations keeps the old stream alive without displaying its text in the new chat', async () => {
  let finish; let delta; let signal;
  const f = providerFixture({ streamChat: (_text, onText, _sources, abort) => {
    delta = onText; signal = abort; return new Promise(resolve => { finish = resolve; });
  } });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  const pending = f.value.sendChat('old'); await f.flush();
  f.value.openConversation(); await f.flush();
  assert.equal(signal.aborted, false);
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
