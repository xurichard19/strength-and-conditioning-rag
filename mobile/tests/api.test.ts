import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { load, plain, jsx, type TestValue, type TestModule, type TestNode, type Stubs } from './helpers.ts';
import type { Profile, ChatSource, ChatStage } from '../src/domain/types';
import type { SavedMessage, Conversation } from '../src/services/backend';
const backend = load<typeof import('../src/services/backend')>('services/backend.ts');
const memoryCache = load('state/memory-cache.ts');
const { createChatCache: chatCache } = load<typeof import('../src/state/chat-cache')>('state/chat-cache.ts', { './memory-cache': memoryCache });
const { createCalendarCache } = load<typeof import('../src/state/calendar-cache')>('state/calendar-cache.ts', { './memory-cache': memoryCache, '../lib/calendar': load('lib/calendar.ts') });
const { webUrl } = load<typeof import('../src/lib/links')>('lib/links.ts');
type CacheApi = Parameters<ReturnType<typeof chatCache>['loadList']>[0];
const unexpectedRead = () => { throw new Error('unexpected cache read'); };
const unusedReads: CacheApi = { getConversations: unexpectedRead, getConversation: unexpectedRead, getMessages: unexpectedRead };
// Each test supplies only the endpoint it expects the real cache to call.
function createChatCache(options?: Parameters<typeof chatCache>[0]) {
  const cache = chatCache(options);
  return { ...cache,
    loadList: (api: Pick<CacheApi, 'getConversations'>, older = false) => cache.loadList({ ...unusedReads, ...api }, older),
    loadConversation: (api: Pick<CacheApi, 'getConversation'>, id: string) => cache.loadConversation({ ...unusedReads, ...api }, id),
    loadMessages: (api: Pick<CacheApi, 'getMessages'>, id: string, older = false, force = false) => cache.loadMessages({ ...unusedReads, ...api }, id, older, force),
  };
}
const profile: Profile = { displayName: 'Ada', goal: 'Strong and fit', experienceLevel: 'new',
  trainingDays: ['Mon', 'Wed'], daysPerWeek: 3, sessionMinutes: 45, equipment: 'Dumbbells',
  cardio: 'Bike', theme: 'system', onboardingComplete: false };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const jsonBody = (options?: RequestInit): TestModule => {
  assert.ok(typeof options?.body === 'string');
  return JSON.parse(options.body);
};
const convo = (id: string, title = id): Conversation => ({ id, title, created_at: '2026-09-15T12:00:00Z' });
const savedMessage = (id: string, content = id): SavedMessage => ({ id, role: 'user', content, created_at: '2026-09-15T12:00:00Z' });

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
  const page = (start: number) => Array.from({ length: 20 }, (_, i) => savedMessage(String(start + i).padStart(4, '0')));
  await cache.loadMessages({ getMessages: async () => page(0) }, 'thread');
  clock = 60_001;
  await cache.loadMessages({ getMessages: async () => page(100) }, 'thread');
  assert.equal(cache.peekMessages('thread')!.rows.length, 20);
  assert.equal(cache.peekMessages('thread')!.rows[0].id, '0100');
  assert.equal(cache.peekMessages('thread')!.more, true);
});

test('late older pages cannot splice a gap into a newly refreshed history window', async () => {
  const cache = createChatCache();
  const page = <T>(start: number, count: number, row: (id: string) => T) => Array.from({ length: count }, (_, i) => row(String(start + i).padStart(4, '0')));
  let finish!: (value?: TestValue) => void;
  await cache.loadMessages({ getMessages: async () => page(100, 20, savedMessage) }, 'thread');
  const olderMessages = cache.loadMessages({ getMessages: () => new Promise(resolve => { finish = resolve; }) }, 'thread', true);
  await cache.loadMessages({ getMessages: async () => page(200, 20, savedMessage) }, 'thread', false, true);
  finish(page(80, 20, savedMessage)); await olderMessages;
  assert.equal(cache.peekMessages('thread')!.rows[0].id, '0200');
  assert.equal(cache.peekMessages('thread')!.rows.length, 20);

  let clock = 0;
  const list = createChatCache({ now: () => clock });
  await list.loadList({ getConversations: async () => page(100, 50, convo) });
  const olderList = list.loadList({ getConversations: () => new Promise(resolve => { finish = resolve; }) }, true);
  clock = 60_001;
  await list.loadList({ getConversations: async () => page(200, 50, convo) });
  finish(page(50, 50, convo)); await olderList;
  assert.equal(list.peekList()!.rows.at(-1)!.id, '0200');
  assert.equal(list.peekList()!.rows.length, 50);
});

test('conversation windows remain bounded and reopen at the newest page after older-page eviction', async () => {
  const cache = createChatCache();
  const api = { getConversations: async (before?: string) => {
    const end = before ? Number(before) : 1000;
    return Array.from({ length: 50 }, (_, i) => convo(String(end - 1 - i).padStart(4, '0')));
  } };
  await cache.loadList(api);
  for (let i = 0; i < 10; i++) await cache.loadList(api, true);
  assert.equal(cache.peekList()!.rows.length, 500);
  assert.equal(cache.peekList()!.rows[0].id, '0949');
  await cache.loadList(api);
  assert.equal(cache.peekList()!.rows[0].id, '0999');
});

test('cache stores empty lists, coalesces reads, and refreshes only after expiry', async () => {
  let clock = 0; let calls = 0; let finish!: (value?: TestValue) => void;
  const cache = createChatCache({ now: () => clock });
  const api: Pick<CacheApi, 'getConversations'> = { getConversations: () => { calls++; return new Promise(resolve => { finish = resolve; }); } };
  const first = cache.loadList(api); const second = cache.loadList(api);
  assert.equal(calls, 1); finish([]); await Promise.all([first, second]);
  await cache.loadList(api); assert.equal(calls, 1);
  clock = 60_001;
  const refresh = cache.loadList(api);
  assert.equal(cache.peekList()!.rows.length, 0);
  finish([convo('a')]); await refresh;
  assert.equal(calls, 2);
  assert.equal((await cache.loadConversation(unusedReads, 'a'))?.id, 'a');
});

test('cache rename and deletion defeat older reads without refreshing unrelated list freshness', async () => {
  let clock = 0; let finish!: (value?: TestValue) => void;
  const cache = createChatCache({ now: () => clock });
  await cache.loadList({ getConversations: async () => [convo('a')] });
  clock = 60_001;
  const old = cache.loadList({ getConversations: () => new Promise(resolve => { finish = resolve; }) });
  cache.putConversation(convo('a', 'Renamed'));
  finish([convo('a', 'Old')]); await old;
  assert.equal(cache.peekList()!.rows[0].title, 'Renamed');
  assert.equal(cache.peekList()!.fetchedAt, 0);
  const old2 = cache.loadList({ getConversations: () => new Promise(resolve => { finish = resolve; }) });
  cache.removeConversation('a'); finish([convo('a')]); await old2;
  assert.equal(cache.peekList()!.rows.length, 0);
});

test('cache clear rejects late account reads and failed refresh retains stale data', async () => {
  let clock = 0; let finish!: (value?: TestValue) => void;
  const cache = createChatCache({ now: () => clock });
  await cache.loadList({ getConversations: async () => [convo('a')] });
  clock = 60_001;
  await assert.rejects(cache.loadList({ getConversations: async () => { throw new Error('offline'); } }), /offline/);
  assert.equal(cache.peekList()!.rows[0].id, 'a');
  const old = cache.loadList({ getConversations: () => new Promise(resolve => { finish = resolve; }) });
  cache.clear(); finish([convo('private')]); await old;
  assert.equal(cache.peekList(), undefined);
  assert.equal(cache.peekConversation('private'), undefined);
});

test('message cache deduplicates pages, reuses history, and fences pre-send reads', async () => {
  let clock = 0; let calls = 0; let finish!: (value?: TestValue) => void;
  const cache = createChatCache({ now: () => clock });
  const api = { getMessages: async () => { calls++; return [savedMessage('a')]; } };
  await cache.loadMessages(api, 'thread'); await cache.loadMessages(api, 'thread');
  assert.equal(calls, 1);
  clock = 60_001;
  const old = cache.loadMessages({ getMessages: () => new Promise(resolve => { finish = resolve; }) }, 'thread');
  cache.putMessages('thread', [savedMessage('a'), savedMessage('b')]);
  finish([savedMessage('a')]); await old;
  assert.deepEqual(plain(cache.peekMessages('thread')!.rows.map(row => row.id)), ['a', 'b']);
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
  let finish!: (value?: TestValue) => void;
  const read = cache.loadMessages({ getMessages: () => new Promise(resolve => { finish = resolve; }) }, 'b');
  cache.putMessages('a', [savedMessage('a-message')]);
  finish([savedMessage('b-message')]); await read;
  assert.equal(cache.peekMessages('b')!.rows[0].id, 'b-message');
});

test('conversation pagination retains previously loaded pages across sidebar opens', async () => {
  const cache = createChatCache();
  let calls = 0;
  const api = { getConversations: async (before?: string) => {
    calls++;
    return before ? [convo('000')] : Array.from({ length: 50 }, (_, i) => convo(String(i + 1).padStart(3, '0')));
  } };
  await cache.loadList(api); await cache.loadList(api, true); await cache.loadList(api);
  assert.equal(calls, 2);
  assert.equal(cache.peekList()!.rows.length, 51);
});

test('metadata lookup respects its own TTL and an exhausted refresh removes stale list entries', async () => {
  let clock = 0; let reads = 0;
  const cache = createChatCache({ now: () => clock });
  const api = {
    getConversations: async () => [convo('a'), convo('b')],
    getConversation: async (id: string) => { reads++; return convo(id, 'Remote rename'); },
  };
  await cache.loadList(api);
  await cache.loadConversation(api, 'a'); assert.equal(reads, 0);
  clock = 60_001;
  await cache.loadConversation(api, 'a'); assert.equal(reads, 1);
  await cache.loadList({ getConversations: async () => [convo('a')] });
  assert.equal(cache.peekList()!.rows.length, 1);
});

test('older message windows stay bounded and reopening reloads evicted newest history', async () => {
  const cache = createChatCache();
  let reads = 0;
  const api = { getMessages: async (_id: string, before?: SavedMessage) => {
    reads++;
    const end = before ? Number(before.id) : 1000;
    return Array.from({ length: 20 }, (_, i) => savedMessage(String(end - 20 + i).padStart(4, '0')));
  } };
  await cache.loadMessages(api, 'thread');
  for (let i = 0; i < 10; i++) await cache.loadMessages(api, 'thread', true);
  assert.equal(cache.peekMessages('thread')!.rows.length, 200);
  await cache.loadMessages(api, 'thread');
  assert.equal(cache.peekMessages('thread')!.rows.at(-1)!.id, '0999');
  assert.equal(reads, 12);
});

test('message ordering preserves database microseconds before using the UUID tie breaker', () => {
  const cache = createChatCache();
  cache.putMessages('thread', [
    { ...savedMessage('a'), created_at: '2026-09-15T12:00:00.000900+00:00' },
    { ...savedMessage('z'), created_at: '2026-09-15T12:00:00.000100+00:00' },
  ]);
  assert.deepEqual(plain(cache.peekMessages('thread')!.rows.map(row => row.id)), ['z', 'a']);
});

test('stream confirmations deliver exact saved human and assistant rows to the cache callback', async () => {
  const human = savedMessage('human', 'question');
  const reply = { ...savedMessage('reply', 'answer'), role: 'assistant' };
  const received: SavedMessage[] = [];
  await backend.readChatStream(new Response([
    JSON.stringify({ type: 'saved', message: human }),
    JSON.stringify({ type: 'text', delta: 'answer' }),
    JSON.stringify({ type: 'done', message_id: reply.id, message: reply }),
  ].join('\n')).body!, () => {}, () => {}, row => received.push(plain(row)));
  assert.deepEqual(received, [human, reply]);
});
const stream = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
};
function authFixture() {
  let session: { user: { id: string }; access_token: string } | null = { user: { id: 'user-a' }, access_token: 'fresh-token' };
  const requests: [string, RequestInit?][] = [];
  const auth: Record<string, (...args: TestValue[]) => TestValue> = { getSession: async () => ({ data: { session } }),
    signUp: async () => ({ data: { session } }),
    signInWithPassword: async () => ({ data: { session } }),
    setSession: async tokens => ({ data: { session: { ...session, ...tokens } } }),
    signOut: async () => (session = null, {}),
    startAutoRefresh() {}, stopAutoRefresh() {} };
  let options!: TestModule;
  const api = load<typeof import('../src/services/api')>('services/api.ts', {
    'react-native-url-polyfill/auto': {}, '@react-native-async-storage/async-storage': {},
    '@supabase/supabase-js': { createClient: (_url, key, opts) => {
      assert.equal(key, 'sb_publishable_test'); options = opts; return { auth };
    } },
    'expo-auth-session': { makeRedirectUri: () => 'arcel://' },
    'expo/fetch': { fetch: async (url: string, options?: RequestInit) => { requests.push([url, options]); return response({}); } },
    'expo-linking': { createURL: path => `arcel://${path}` },
    'expo-web-browser': {}, 'react-native': { Platform: { OS: 'ios' }, AppState: { addEventListener() {} } },
    './backend': backend,
  });
  return { api, auth, requests, options, setSession: (value: typeof session) => { session = value; } };
}

test('all survey answers round-trip as one dictionary, without local flags or profile identity', async () => {
  const answers = backend.surveyAnswers(profile, { runCapacity: '10–20 min', pushups: '5–10',
    pain: 'Ankle', note: 'Travel', futureQuestion: { nested: ['value'] } });
  const calls: [string, RequestInit?][] = [];
  const api = backend.createBackend(async (path, opts) => { calls.push([path, opts]); return response({ answers, completed_at: null }); });
  await api.saveAnswers(answers);
  assert.equal(calls[0][0], '/onboarding');
  assert.equal(calls[0][1]?.method, 'PUT');
  assert.deepEqual(jsonBody(calls[0][1]), { answers: plain(answers) });
  assert.equal(answers.theme, undefined);
  assert.equal(answers.displayName, undefined);
  assert.equal(answers.onboardingComplete, undefined);
  assert.equal(answers.pain, 'Ankle');
  const restored = backend.profileFromApi({ id: 'a', display_name: 'Ada', timezone: 'UTC' },
    { answers, completed_at: '2026-09-15' }, profile);
  assert.deepEqual(plain(restored), { ...profile, onboardingComplete: true });
});

test('profile and onboarding use only current endpoints, never planning', async () => {
  const calls: [string, RequestInit?][] = [];
  const api = backend.createBackend(async (path, opts) => { calls.push([path, opts]); return response({}); });
  await api.getProfile(); await api.getOnboarding(); await api.saveProfile(' Ada ', 'UTC');
  await api.saveAnswers({ anything: ['works'] }); await api.completeOnboarding();
  assert.deepEqual(calls.map(call => call[0]), ['/profile', '/onboarding', '/profile', '/onboarding', '/onboarding/complete']);
  assert.deepEqual(jsonBody(calls[2][1]), { display_name: 'Ada', timezone: 'UTC' });
});

test('new users have no completed onboarding even when defaults were previously completed', () => {
  assert.equal(backend.profileFromApi({ id: 'new-user', display_name: null, timezone: 'UTC' }, null, { ...profile, onboardingComplete: true }).onboardingComplete, false);
});

test('chat sends its conversation id and conversation listing supports pagination', async () => {
  const calls: [string, TestModule | undefined][] = [];
  const api = backend.createBackend(async (path, options) => {
    if (path === '/chat') {
      assert.equal(new Headers(options?.headers).get('X-Chat-Saved-Events'), '1');
      assert.equal(new Headers(options?.headers).get('X-Chat-Status-Events'), '1');
    }
    calls.push([path, options?.body ? jsonBody(options) : undefined]);
    return path === '/chat'
      ? new Response('{"type":"done","message_id":"saved"}\n')
      : response([]);
  });
  await api.getConversations('last-thread');
  await api.streamChat('hello', () => {}, () => {}, undefined, 'thread-a');
  assert.equal(calls[0][0], '/chat/conversations?before=last-thread');
  assert.deepEqual(calls[1][1], { text: 'hello', conversation_id: 'thread-a', mode: 'quick' });
  await api.streamChat('research', () => {}, () => {}, undefined, 'thread-a', undefined, undefined, 'deep');
  assert.deepEqual(calls[2][1], { text: 'research', conversation_id: 'thread-a', mode: 'deep' });
});

test('chat mode is captured for a pending turn and survives switching conversations', async () => {
  const modes: string[] = []; let finish!: (value?: TestValue) => void;
  const f = providerFixture({ streamChat: (_text, _delta, _sources, _abort, _thread, _saved, _status, mode) => {
    modes.push(mode); return new Promise(resolve => { finish = resolve; });
  } });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  f.value.setChatMode('deep'); await f.flush();
  const pending = f.value.sendChat('research this'); await f.flush();
  f.value.setChatMode('quick'); f.value.openConversation(); await f.flush();
  assert.deepEqual(modes, ['deep']);
  assert.equal(f.value.chatMode, 'quick');
  finish('saved'); await pending; await f.flush();
  f.value.setChatMode('deep'); await f.flush();
  await f.value.signOut(); await f.flush();
  assert.equal(f.value.chatMode, 'quick');
});

test('saved stream events validate their shape even without a cache callback', async () => {
  for (const message of [null, {}, { ...savedMessage('a'), id: 42 }, { ...savedMessage('a'), created_at: 'invalid' }]) {
    await assert.rejects(backend.readChatStream(new Response(JSON.stringify({ type: 'saved', message })).body!,
      () => {}, () => {}), /Invalid saved message/);
  }
});

test('progress streams separately from text and is never a completion receipt', async () => {
  const stages: ChatStage[] = []; const chunks: string[] = [];
  const events = [{ type: 'status', stage: 'fetching_user_context' }, { type: 'status', stage: 'researching' },
    { type: 'status', stage: 'thinking' }, { type: 'text', delta: 'answer' }, { type: 'done', message_id: 'reply' }];
  const api = backend.createBackend(async () => new Response(events.map(event => JSON.stringify(event)).join('\n')));
  assert.equal(await api.streamChat('question', text => chunks.push(text), () => {}, undefined, 'thread', undefined,
    stage => stages.push(stage)), 'reply');
  assert.deepEqual(stages, ['fetching_user_context', 'researching', 'thinking']);
  assert.deepEqual(chunks, ['answer']);
  for (const stage of [null, {}, 'invented-stage']) {
    await assert.rejects(backend.readChatStream(stream(JSON.stringify({ type: 'status', stage })),
      () => {}, () => {}), /Invalid chat stream/);
  }
  await assert.rejects(backend.readChatStream(stream('{"type":"status","stage":"thinking"}'),
    () => {}, () => {}), /before the reply was confirmed/);
});

test('history passes both cursor fields and a bounded page size', async () => {
  let url!: string;
  await backend.createBackend(async path => { url = path; return response([]); })
    .getMessages('conversation-a', { ...savedMessage('message-a'), created_at: '2026-09-15T00:00:00+00:00' });
  const query = new URL(url, 'https://api.test').searchParams;
  assert.equal(query.get('conversation_id'), 'conversation-a');
  assert.equal(query.get('limit'), '20');
  assert.equal(query.get('before_id'), 'message-a');
  assert.equal(query.get('before_created_at'), '2026-09-15T00:00:00+00:00');
});

test('chat handles split UTF-8, sources, and final persistence receipt without trailing newline', async () => {
  let text = ''; let sources!: ChatSource[];
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
  ] as const) await assert.rejects(backend.readChatStream(stream(body), () => {}, () => {}), expected);
});

test('invalid stream events never reach callbacks and always release the reader', async () => {
  for (const event of [null, [], { type: 'unknown' }, { type: 'text', delta: 42 },
    { type: 'sources', sources: {} }, { type: 'done', message_id: 42 },
    { type: 'saved', message: { ...savedMessage('a'), role: 'assistant' } },
    { type: 'done', message_id: 'a', message: savedMessage('a') },
    { type: 'done', message_id: 'a', message: { ...savedMessage('b'), role: 'assistant' } },
  ]) {
    const body = new Response(JSON.stringify(event)).body!;
    const unexpected = () => assert.fail('invalid event reached a callback');
    await assert.rejects(backend.readChatStream(body, unexpected, unexpected, unexpected), /Invalid/);
    assert.equal(body.locked, false);
  }
});

test('blank stream lines are ignored but an empty completion id is not a saved reply', async () => {
  const body = new Response('\n  \n{"type":"text","delta":"answer"}\n\n{"type":"done","message_id":"saved"}').body!;
  const chunks: string[] = [];
  assert.equal(await backend.readChatStream(body, text => chunks.push(text), () => {}), 'saved');
  assert.deepEqual(chunks, ['answer']);
  assert.equal(body.locked, false);
  await assert.rejects(backend.readChatStream(new Response('{"type":"done","message_id":""}').body!,
    () => {}, () => {}), /before the reply was confirmed/);
});

test('failed POST exposes the server error and is not retried', async () => {
  let count = 0;
  const api = backend.createBackend(async () => { count++; return response({ detail: 'chat unavailable' }, 503); });
  await assert.rejects(api.streamChat('hello', () => {}, () => {}, undefined, 'conversation-a'), /chat unavailable/);
  assert.equal(count, 1);
});

test('signup delegates to Supabase only, with or without email confirmation', async () => {
  const f = authFixture();
  assert.equal((await f.api.signUp('a@test.invalid', 'password'))?.user.id, 'user-a');
  f.setSession(null);
  assert.equal(await f.api.signUp('a@test.invalid', 'password'), null);
  assert.equal(f.requests.length, 0);
  assert.equal(f.options.auth.persistSession, true);
  assert.equal(f.options.auth.autoRefreshToken, true);
});

test('signup includes client timezone even before email confirmation', async () => {
  const f = authFixture();
  let payload!: TestModule;
  f.auth.signUp = async input => { payload = input; return { data: { session: null } }; };
  await f.api.signUp('a@test.invalid', 'password');
  assert.equal(payload.options.data.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone);
});

test('timezone sync patches only timezone, not the display name', async () => {
  let payload!: TestModule;
  const api = backend.createBackend(async (path, options) => {
    assert.equal(path, '/profile'); payload = jsonBody(options); return response({});
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
  assert.equal(new Headers(f.requests[0][1]?.headers).get('Authorization'), 'Bearer fresh-token');
  f.setSession({ user: { id: 'user-b' }, access_token: 'other-token' });
  await assert.rejects(api.saveAnswers({}), /sign in again/);
  assert.equal(f.requests.length, 1);
  await f.api.signOut();
  assert.equal(await f.api.getAuthSession(), null);
});

test('native auth callback restores tokens and rejects invalid links', async () => {
  const f = authFixture();
  assert.equal((await f.api.sessionFromAuthUrl('arcel:///#access_token=access&refresh_token=refresh'))?.access_token, 'access');
  await assert.rejects(f.api.sessionFromAuthUrl('arcel:///#error_description=Expired'), /Expired/);
  await assert.rejects(f.api.sessionFromAuthUrl('arcel:///'), /valid session/);
});

// Deterministic hook harness: exercise the provider without mounting native views.
function providerFixture(apiOverrides: Record<string, (...args: TestValue[]) => TestValue> = {}) {
  const slots: TestValue[] = []; let cursor = 0; let dirty = true; let value!: ReturnType<typeof import('../src/state/app-context').useApp>; let effects: (() => void)[] = [];
  const changed = (a: unknown[] | undefined, b: unknown[] | undefined) => !a || !b || a.length !== b.length || a.some((item, i) => item !== b[i]);
  const hooks = {
    createContext: () => ({ Provider: 'provider' }),
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (update: TestValue) => { slots[index] = typeof update === 'function' ? update(slots[index]) : update; dirty = true; }];
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
  } satisfies Stubs;
  const calls: TestValue[] = [];
  const api = {
    getProfile: async () => ({ id: 'user-a', display_name: 'Ada', timezone: 'UTC' }),
    getOnboarding: async () => null,
    getMessages: async () => [],
    getConversations: async () => [],
    getConversation: async (id: string) => ({ id, title: '2026-09-15 09:30', created_at: 'now' }),
    renameConversation: async (id, title) => ({ id, title: title.trim(), created_at: 'now' }),
    deleteConversation: async () => {},
    saveProfile: async () => { calls.push('profile'); },
    saveAnswers: async answers => { calls.push(['answers', plain(answers)]); },
    completeOnboarding: async () => { calls.push('complete'); return { answers: { note: 'saved' }, completed_at: 'now' }; },
    ...apiOverrides,
  } satisfies Stubs;
  let authListener!: (...args: TestValue[]) => void;
  const provider = load('state/app-context.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx: (_type, props) => (value = props.value) },
    'expo-crypto': { randomUUID },
    './chat-cache': { createChatCache },
    './calendar-cache': { createCalendarCache },
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
  return { flush, calls, get value() { return value; }, auth: (...args: TestValue[]) => authListener(...args) };
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
  let finish!: (value?: TestValue) => void; let delayed = false;
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

test('newer account refresh wins over a late success or failure from the same account', async () => {
  for (const failOlder of [false, true]) {
    let delayed = false;
    const requests: { resolve: (value: TestValue) => void; reject: (error: unknown) => void }[] = []; const timezoneWrites: string[] = [];
    const identity = { id: 'user-a', display_name: 'Original', timezone: 'UTC' };
    const f = providerFixture({
      getProfile: () => delayed ? new Promise((resolve, reject) => requests.push({ resolve, reject })) : Promise.resolve(identity),
      saveTimezone: async timezone => timezoneWrites.push(timezone),
    });
    await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
    delayed = true;
    const older = f.value.refreshLiveData(); const newer = f.value.refreshLiveData();
    requests[1].resolve({ ...identity, display_name: 'Newest' }); await newer;
    if (failOlder) requests[0].reject(new Error('obsolete failure'));
    else requests[0].resolve({ ...identity, display_name: 'Stale', timezone: 'America/New_York' });
    await older; await f.flush();
    assert.equal(f.value.profile.displayName, 'Newest');
    assert.equal(f.value.accountError, null);
    assert.equal(f.value.notice, null);
    assert.deepEqual(timezoneWrites, []);
  }
});

test('account loading syncs a changed device timezone before onboarding', async () => {
  const writes: string[] = [];
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

test('calendar cache is account-scoped and old-account writes cannot invalidate the new account', async () => {
  const f = providerFixture(); await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  const calendar = f.value.calendarCache;
  const dates: [string, string] = ['2026-09-01', '2026-09-30'];
  const response = { workouts: [], sports_workouts: [], revision: null };
  await calendar.load({ getCalendarRange: async () => response }, ...dates);
  f.value.invalidateCalendar('user-a', '2026-09-15', '2026-09-15');
  assert.equal(calendar.peek(...dates)?.fresh, false);
  let finish!: (value?: TestValue) => void;
  const old = calendar.load({ getCalendarRange: () => new Promise(resolve => { finish = resolve; }) }, ...dates);
  f.auth('SIGNED_IN', { user: { id: 'user-b' }, access_token: 'other-token' }); await f.flush();
  assert.equal(calendar.peek(...dates), undefined);
  finish(response); assert.equal(await old, undefined);
  await calendar.load({ getCalendarRange: async () => response }, ...dates);
  f.value.invalidateCalendar('user-a', ...dates);
  assert.equal(calendar.peek(...dates)?.fresh, true);
  await f.value.signOut(); await f.flush();
  assert.equal(calendar.peek(...dates), undefined);
});

test('account refresh replaces live data but preserves theme, chat cache, and pending replies', async () => {
  let profileReads = 0; let onboardingReads = 0; let listReads = 0; let finish!: (value?: TestValue) => void; let signal!: AbortSignal;
  const f = providerFixture({
    getProfile: async () => ({ id: 'user-a', display_name: ++profileReads === 1 ? 'Ada' : 'Updated', timezone: 'UTC' }),
    getOnboarding: async () => ({ answers: { goal: ++onboardingReads === 1 ? 'Original' : 'Updated goal' }, completed_at: 'now' }),
    getConversations: async () => { listReads++; return [convo('saved')]; },
    streamChat: (_text, _delta, _sources, abort) => {
      signal = abort; return new Promise(resolve => { finish = resolve; });
    },
  });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  f.value.setThemeMode('dark'); await f.flush();
  await f.value.refreshConversations(); await f.flush();
  const pending = f.value.sendChat('Still working'); await f.flush();
  const selected = f.value.chatTitle;
  const previews = f.value.sessions;
  await f.value.refreshPreview(); await f.flush();
  assert.equal(profileReads, 1);
  assert.equal(onboardingReads, 1);
  assert.match(f.value.notice ?? '', /preview training data/);
  await f.value.refreshLiveData(); await f.flush();
  assert.equal(profileReads, 2);
  assert.equal(onboardingReads, 2);
  assert.equal(f.value.profile.displayName, 'Updated');
  assert.equal(f.value.profile.goal, 'Updated goal');
  assert.equal(f.value.profile.theme, 'dark');
  assert.equal(f.value.chatTitle, selected);
  assert.equal(f.value.chatBusy, true);
  assert.equal(signal.aborted, false);
  assert.equal(f.value.sessions, previews);
  await f.value.refreshConversations(); await f.flush();
  assert.equal(listReads, 1);
  finish('reply'); await pending; await f.flush();
});

test('a failed account refresh keeps the last good data and reports the failure', async () => {
  let fail = false;
  const f = providerFixture({ getProfile: async () => {
    if (fail) throw new Error('offline');
    return { id: 'user-a', display_name: 'Ada', timezone: 'UTC' };
  } });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  const previous = f.value.profile;
  fail = true;
  await f.value.refreshLiveData(); await f.flush();
  assert.equal(f.value.profile, previous);
  assert.equal(f.value.accountReady, true);
  assert.equal(f.value.notice, 'offline');
});

test('account loading errors do not unlock default onboarding as a valid account', async () => {
  const f = providerFixture({ getProfile: async () => { throw new Error('profile not found'); } });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  assert.equal(f.value.accountReady, false);
  assert.equal(f.value.accountError, 'profile not found');
});

test('logout aborts chat and discards late reply updates', async () => {
  let finish!: (value?: TestValue) => void; let sendDelta!: (text: string) => void; let signal!: AbortSignal;
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

test('new chats are lazy, reuse their id for replies, and reset only on explicit new chat', async () => {
  const ids: string[] = [];
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
  let finish!: (value?: TestValue) => void;
  const f = providerFixture({
    streamChat: () => new Promise(resolve => { finish = resolve; }),
    getConversation: async (id: string) => convo(id, 'hello'),
  });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  const pending = f.value.sendChat('hello'); await f.flush();
  assert.equal(f.value.chatTitle, 'hello');
  assert.equal(f.value.activeConversationId, null);
  finish('saved'); await pending; await f.flush();
  assert.equal(f.value.chatTitle, 'hello');
  assert.notEqual(f.value.activeConversationId, null);
});

test('first-message titles normalize whitespace and truncate at 120 Unicode characters', async () => {
  for (const [message, expected] of [
    ['  How do\n\tI improve  my squat?  ', 'How do I improve my squat?'],
    ['a'.repeat(120), 'a'.repeat(120)],
    ['a'.repeat(121), 'a'.repeat(119) + '…'],
    ['💪'.repeat(121), '💪'.repeat(119) + '…'],
  ]) {
    let sent;
    const f = providerFixture({
      streamChat: async text => { sent = text; return 'saved'; },
      getConversation: async () => { throw new Error('offline'); },
    });
    await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
    await f.value.sendChat(message); await f.flush();
    assert.equal(f.value.chatTitle, expected);
    assert.equal(sent, message.trim()); // Only the title is collapsed/truncated.
  }
});

test('follow-up messages preserve an existing title even when metadata is unavailable', async () => {
  const f = providerFixture({
    streamChat: async () => 'saved',
    getConversation: async () => { throw new Error('offline'); },
  });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  await f.value.sendChat('First question'); await f.flush();
  await f.value.sendChat('Follow-up question'); await f.flush();
  assert.equal(f.value.chatTitle, 'First question');
  await f.value.renameConversation('My custom title'); await f.flush();
  await f.value.sendChat('Another question'); await f.flush();
  assert.equal(f.value.chatTitle, 'My custom title');
});

test('offline first send never enables saved-conversation actions and preserves its retry id', async () => {
  const ids: string[] = [];
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
  assert.match(f.value.chatError ?? '', /interrupted/);
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
  let finish!: (value?: TestValue) => void;
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
    getConversation: async (id: string) => convo(id, 'Original'),
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
  let finish!: (value?: TestValue) => void;
  const f = providerFixture({ getMessages: id => id === 'old'
    ? new Promise(resolve => { finish = resolve; })
    : Promise.resolve([{ id: 'new-message', role: 'user', content: 'new', created_at: 'now' }]) });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  f.value.openConversation('old'); await f.flush();
  f.value.openConversation('new'); await f.flush();
  finish([{ id: 'old-message', role: 'user', content: 'old', created_at: 'then' }]); await f.flush();
  assert.equal(f.value.chatMessages[0].id, 'new-message');
});

// Exercise the real screen's focus and sidebar callbacks without a native renderer.
function chatScreenFixture(provider: ReturnType<typeof providerFixture>) {
  const slots: TestValue[] = []; let cursor = 0; let onFocus: (() => (() => void) | undefined) | undefined; let cleanup: (() => void) | undefined;
  const screen = load('screens/chat-screen.tsx', {
    react: {
      useState: initial => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], (value: TestValue) => { slots[index] = value; }];
      },
      useRef: initial => { const index = cursor++; return slots[index] ??= { current: initial }; },
      useCallback: fn => fn, useEffect: () => {},
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { useLocalSearchParams: () => ({}), useFocusEffect: fn => { onFocus = fn; } },
    'expo-linking': {}, 'lucide-react-native': {},
    'react-native': { Platform: { OS: 'ios' }, StyleSheet: { create: value => value } },
    'react-native-safe-area-context': {},
    '@/components/ui': {}, '@/components/markdown-text': {},
    '@/components/chat-progress': {}, '@/components/chat-mode-selector': {},
    '@/components/message-text-selection': { messageTextProps: () => ({}) },
    '@/components/conversation-menu': { ConversationSidebar: 'sidebar', ConversationActions: 'options' },
    '@/data/mock': { quickQuestions: [] }, '@/design/tokens': { fonts: {}, radius: {} },
    '@/lib/links': { webUrl }, '@/state/app-context': { useApp: () => provider.value },
  });
  const render = () => { cursor = 0; return screen.default(); };
  function find(predicate: (node: TestNode) => boolean) {
    function visit(node: TestValue): TestNode | undefined {
      if (!node || typeof node !== 'object') return;
      if (predicate(node)) return node;
      if (typeof node.type === 'function') return visit(node.type(node.props));
      return [node.props?.children].flat(Infinity).map(visit).find(Boolean);
    }
    const node = visit(render());
    assert.ok(node, 'expected screen element');
    return node.props;
  }
  return {
    focus: () => { render(); cleanup = onFocus?.(); },
    blur: () => { cleanup?.(); cleanup = undefined; },
    find,
    composer: () => find(node => node.type?.name === 'Composer'),
  };
}

test('returning to the chat tab preserves selection, messages, and draft without refetching', async () => {
  let reads = 0;
  const f = providerFixture({
    getMessages: async () => { reads++; return [savedMessage('human', 'hello')]; },
    getConversation: async (id: string) => { reads++; return convo(id, 'Strength questions'); },
  });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  f.value.openConversation('thread-a'); await f.flush();
  const screen = chatScreenFixture(f);
  screen.focus(); await f.flush();
  screen.composer().onChange('Unsent question');
  screen.find(node => node.props?.accessibilityLabel === 'Open conversations').onPress();
  screen.blur(); screen.focus(); await f.flush();
  assert.equal(f.value.activeConversationId, 'thread-a');
  assert.equal(f.value.chatTitle, 'Strength questions');
  assert.equal(f.value.chatMessages[0].text, 'hello');
  assert.equal(screen.composer().draft, 'Unsent question');
  assert.equal(reads, 2);

  // Starting a new chat is still an explicit sidebar action.
  screen.find(node => node.props?.accessibilityLabel === 'Open conversations').onPress();
  screen.find(node => node.type === 'sidebar').onSelect(); await f.flush();
  assert.equal(f.value.activeConversationId, null);
  assert.equal(f.value.chatTitle, 'Ask Arcel');
  assert.equal(f.value.chatMessages.length, 0);
  assert.equal(screen.composer().draft, '');
});

test('returning to the chat tab keeps a pending reply selected through completion', async () => {
  let finish!: (value?: TestValue) => void; let onText!: (text: string) => void; let saved!: (message: SavedMessage) => void; let signal!: AbortSignal; let id!: string;
  const f = providerFixture({ streamChat: (_text, delta, _sources, abort, key, onSaved) => {
    onText = delta; signal = abort; id = key; saved = onSaved;
    onSaved(savedMessage('human', 'hello'));
    return new Promise(resolve => { finish = resolve; });
  } });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  const screen = chatScreenFixture(f); screen.focus(); await f.flush();
  const pending = f.value.sendChat('hello'); await f.flush();
  screen.blur(); onText('partial answer'); await f.flush();
  screen.focus(); await f.flush();
  assert.equal(signal.aborted, false);
  assert.equal(f.value.activeConversationId, id);
  assert.equal(f.value.chatBusy, true);
  assert.equal(f.value.chatMessages.at(-1)!.text, 'partial answer');
  saved({ ...savedMessage('reply', 'answer'), role: 'assistant' });
  finish('reply'); await pending; await f.flush();
  assert.equal(f.value.activeConversationId, id);
  assert.equal(f.value.chatBusy, false);
  assert.deepEqual(plain(f.value.chatMessages.map(row => row.text)), ['hello', 'answer']);
});

test('completed background reply reopens from cache without reloading messages or metadata', async () => {
  let finish!: (value?: TestValue) => void; let saved!: (message: SavedMessage) => void; let onText!: (text: string) => void; let id!: string; let reads = 0; let metadataReads = 0;
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

test('progress belongs to its running conversation, survives tab switches, and clears on completion', async () => {
  let finish!: (id: string) => void; let status!: (stage: ChatStage) => void; let saved!: (row: SavedMessage) => void; let id!: string;
  let delta!: (text: string) => void;
  const f = providerFixture({ streamChat: (_text, onText, _sources, _signal, key, onSaved, onStatus) => {
    id = key; saved = onSaved; status = onStatus; delta = onText;
    onSaved(savedMessage('human', 'hello'));
    return new Promise<string>(resolve => { finish = resolve; });
  } });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  const screen = chatScreenFixture(f); screen.focus();
  const pending = f.value.sendChat('hello'); await f.flush();
  status('researching'); await f.flush();
  assert.equal(f.value.chatMessages.at(-1)?.progress, 'researching');
  screen.blur(); screen.focus(); await f.flush();
  assert.equal(f.value.chatMessages.at(-1)?.progress, 'researching');
  f.value.openConversation(); await f.flush();
  status('thinking'); await f.flush(); assert.equal(f.value.chatMessages.length, 0);
  f.value.openConversation(id); await f.flush();
  assert.equal(f.value.chatMessages.at(-1)?.progress, 'thinking');
  delta('answer'); await f.flush();
  assert.equal(f.value.chatMessages.at(-1)?.progress, undefined);
  assert.equal(f.value.chatMessages.at(-1)?.pending, true);
  status('researching'); await f.flush(); // Tokens replace progress even if a late stage arrives.
  assert.equal(f.value.chatMessages.at(-1)?.progress, undefined);
  saved({ ...savedMessage('reply', 'answer'), role: 'assistant' }); finish('reply'); await pending; await f.flush();
  assert.equal(f.value.chatMessages.at(-1)?.progress, undefined);
  assert.equal(f.value.chatMessages.at(-1)?.pending, false);
  status('researching'); await f.flush(); // A late callback cannot resurrect completed progress.
  assert.equal(f.value.chatMessages.at(-1)?.progress, undefined);
});

test('failed and signed-out runs clear progress and ignore late status callbacks', async () => {
  for (const signOut of [false, true]) {
    let reject!: (error: Error) => void; let status!: (stage: ChatStage) => void;
    const f = providerFixture({ streamChat: (_text, _delta, _sources, _signal, _id, _saved, onStatus) => {
      status = onStatus;
      return new Promise((_, fail) => { reject = fail; });
    } });
    await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
    const pending = f.value.sendChat('hello'); await f.flush();
    status('researching'); await f.flush();
    if (signOut) { await f.value.signOut(); await f.flush(); }
    reject(new Error('offline')); await pending; await f.flush();
    assert.equal(f.value.chatMessages.some(row => row.progress), false);
    assert.equal(f.value.chatBusy, false);
    status('thinking'); await f.flush();
    assert.equal(f.value.chatMessages.some(row => row.progress), false);
  }
});

test('switching conversations keeps the old stream alive without displaying its text in the new chat', async () => {
  let finish!: (value?: TestValue) => void; let delta!: (text: string) => void; let signal!: AbortSignal;
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
  let resolveOld!: (value: TestValue) => void; let count = 0;
  const f = providerFixture({ getProfile: () => ++count === 1
    ? new Promise(resolve => { resolveOld = resolve; })
    : Promise.resolve({ id: 'user-b', display_name: 'Bob', timezone: 'UTC' }) });
  await f.flush(); await f.value.signIn('a', 'password'); await f.flush();
  f.auth('SIGNED_IN', { user: { id: 'user-b' }, access_token: 'b' }); await f.flush();
  resolveOld({ id: 'user-a', display_name: 'Ada', timezone: 'UTC' }); await f.flush();
  assert.equal(f.value.profile.displayName, 'Bob');
});

// Verify the actual ScrollView/RefreshControl props and loading lifecycle without native UI.
function refreshScreenFixture(onRefresh?: () => Promise<void>) {
  const slots: TestValue[] = []; let cursor = 0;
  const { Screen } = load('components/ui.tsx', {
    react: {
      useState: initial => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], (value: TestValue) => { slots[index] = value; }];
      },
      useRef: initial => { const index = cursor++; return slots[index] ??= { current: initial }; },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-linear-gradient': {}, 'expo-router': {}, 'lucide-react-native': {},
    'react-native': { ScrollView: 'scroll', RefreshControl: 'refresh', StyleSheet: { create: value => value } },
    'react-native-safe-area-context': {},
    '@/design/tokens': { fonts: {}, radius: {}, shadow: {} },
    '@/lib/errors': { errorMessage: (error, fallback) => error.message || fallback },
    '@/state/app-context': { useApp: () => ({ colors: {}, previewMode: false }) },
  });
  const render = () => { cursor = 0; return Screen({ title: 'Test', onRefresh, children: null }); };
  return {
    scroll: () => render().props.children.find((node: TestNode) => node.type === 'scroll').props,
    output: () => JSON.stringify(render()),
  };
}

test('pull-to-refresh stays spinning until completion and blocks duplicate pulls', async () => {
  let finish!: (value?: TestValue) => void; let calls = 0;
  const screen = refreshScreenFixture(() => {
    calls++; return new Promise(resolve => { finish = resolve; });
  });
  assert.equal(screen.scroll().alwaysBounceVertical, true); // Short/empty pages can pull too.
  assert.equal(screen.scroll().refreshControl.props.refreshing, false);
  const pending = screen.scroll().refreshControl.props.onRefresh();
  assert.equal(screen.scroll().refreshControl.props.refreshing, true);
  await screen.scroll().refreshControl.props.onRefresh();
  assert.equal(calls, 1);
  finish(); await pending;
  assert.equal(screen.scroll().refreshControl.props.refreshing, false);
});

test('pull-to-refresh stops on failure, shows the error, and allows retry', async () => {
  let fail = true;
  const screen = refreshScreenFixture(async () => { if (fail) throw new Error('offline'); });
  await screen.scroll().refreshControl.props.onRefresh();
  assert.equal(screen.scroll().refreshControl.props.refreshing, false);
  assert.match(screen.output(), /offline/);
  fail = false;
  await screen.scroll().refreshControl.props.onRefresh();
  assert.doesNotMatch(screen.output(), /offline/);
  assert.equal(refreshScreenFixture().scroll().refreshControl, undefined);
});

test('You refreshes account data, Calendar refreshes ranges, other training tabs remain previews', () => {
  const refreshLiveData = async () => {};
  const refreshPreview = async () => {};
  const refreshCalendar = async () => {};
  for (const populated of [false, true]) {
    const value = { colors: {}, profile, block: {}, proposal: null, refreshLiveData, refreshPreview,
      sessions: populated ? [{ id: 's-today', status: 'planned', modality: 'strength', date: '2026-09-15', exercises: [] }] : [],
      metrics: populated ? [{ id: 'metric', lane: 'strength', series: [1, 2] }] : [] };
    for (const tab of ['today', 'week', 'progress', 'you']) {
      const page = load(`screens/${tab}-screen.tsx`, {
        react: { useState: initial => [initial, () => {}], useMemo: fn => fn() },
        'react/jsx-runtime': { jsx, jsxs: jsx },
        'expo-router': {}, 'lucide-react-native': {}, 'react-native-svg': {},
        'react-native': { StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 390 }) },
        '@/components/ui': { Screen: 'screen' },
        '@/components/calendar-day-actions': { CalendarDayActions: 'day-actions' },
        '@/components/sports-workout-details': { SportsWorkoutDetails: 'sport-details' },
        '@/components/policy-links': { PolicyLinks: 'policy-links' },
        '@/data/mock': { milestones: [{ text: 'Preview' }], consistency: [], rememberedNotes: [] },
        '@/lib/dates': { isToday: () => true, todayIso: () => '2026-09-15' },
        '@/lib/calendar': load('lib/calendar.ts'), '@/state/app-context': { useApp: () => value },
        '@/state/use-calendar-range': { useCalendarRange: () => ({ data: { entries: [] }, loading: false, error: null, refresh: refreshCalendar }) },
      }).default();
      assert.equal(page.type, 'screen');
      assert.equal(page.props.onRefresh, tab === 'you' ? refreshLiveData : tab === 'week' ? refreshCalendar : refreshPreview);
    }
  }
});

test('sidebar owns its modal safe area and keeps header spacing separate from insets', () => {
  const { ConversationSidebar } = load('components/conversation-menu.tsx', {
    react: {}, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react-native': {},
    'react-native': { Modal: 'modal', View: 'view', StyleSheet: {} },
    'react-native-safe-area-context': { SafeAreaProvider: 'safe-provider', SafeAreaView: 'safe-view' },
    '@/lib/errors': {}, './ui': {}, '@/state/app-context': { useApp: () => ({ colors: {}, conversations: [] }) },
  });
  for (let opening = 0; opening < 3; opening++) {
    const modal = ConversationSidebar({ onClose() {}, onSelect() {} });
    const provider = modal.props.children;
    assert.equal(provider.type, 'safe-provider');
    const panel = provider.props.children[0];
    assert.equal(panel.type, 'safe-view');
    assert.equal(panel.props.style.paddingTop, undefined);
    assert.equal(panel.props.children[0].props.style.marginTop, 8);
  }
});

test('About Us appears before the policy links and public pages open without auth', async () => {
  let error: string | null = null; let fail = false;
  const urls: string[] = [];
  const { PolicyLinks } = load('components/policy-links.tsx', {
    react: { useState: () => [error, (value: string | null) => { error = value; }] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { StyleSheet: { create: value => value } }, './ui': {},
    'expo-web-browser': { openBrowserAsync: async url => {
      urls.push(url); if (fail) throw new Error('browser unavailable');
    } },
  });
  const links = (): TestNode[] => PolicyLinks().props.children[0].props.children;
  assert.deepEqual(plain(links().map(link => link.props.accessibilityLabel)), ['About Us', 'Privacy Policy', 'Terms of Service']);
  for (const link of links()) {
    assert.equal(link.props.accessibilityRole, 'link');
    link.props.onPress();
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(urls, ['https://arcelassist.vercel.app/about', 'https://arcelassist.vercel.app/privacy', 'https://arcelassist.vercel.app/terms']);
  assert.equal(error, null);
  fail = true;
  links()[0].props.onPress(); await new Promise(resolve => setImmediate(resolve));
  assert.match(error ?? '', /Could not open/);
  fail = false;
  links()[0].props.onPress(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(error, null);
});
