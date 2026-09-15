import type { ChatSource, Profile } from '../domain/types';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Answers = Record<string, JsonValue>;
export type ApiProfile = { id: string; display_name: string | null; timezone: string };
export type Onboarding = { answers: Answers; completed_at: string | null };
export type SavedMessage = { id: string; role: 'user' | 'assistant'; content: string; created_at: string };
export type ApiRequest = (path: string, options?: RequestInit) => Promise<Response>;

/** Use the device's named timezone, never a guessed UTC offset. */
export function deviceTimezone(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
}

/** Decode API errors without retrying writes whose outcome may be unknown. */
async function checked(response: Response): Promise<Response> {
  if (response.ok) return response;
  const body = await response.json().catch(() => null);
  throw new Error(typeof body?.detail === 'string' ? body.detail : `Request failed (${response.status}).`);
}

/** Keep every survey answer together; identity and local display preferences stay separate. */
export function surveyAnswers(profile: Profile, extra: Answers): Answers {
  return { ...extra, goal: profile.goal, experienceLevel: profile.experienceLevel,
    trainingDays: profile.trainingDays, daysPerWeek: profile.daysPerWeek,
    sessionMinutes: profile.sessionMinutes, equipment: profile.equipment, cardio: profile.cardio };
}

export function profileFromApi(profile: ApiProfile, onboarding: Onboarding | null, defaults: Profile): Profile {
  const answers = onboarding?.answers ?? {};
  const result = { ...defaults, displayName: profile.display_name ?? '',
    onboardingComplete: Boolean(onboarding?.completed_at) };
  for (const key of ['goal', 'equipment', 'cardio'] as const) {
    if (typeof answers[key] === 'string') result[key] = answers[key];
  }
  for (const key of ['daysPerWeek', 'sessionMinutes'] as const) {
    if (typeof answers[key] === 'number' && Number.isFinite(answers[key])) result[key] = answers[key];
  }
  if (['new', 'intermediate', 'experienced'].includes(String(answers.experienceLevel))) {
    result.experienceLevel = answers.experienceLevel as Profile['experienceLevel'];
  }
  if (Array.isArray(answers.trainingDays) && answers.trainingDays.every(day => typeof day === 'string')) {
    result.trainingDays = answers.trainingDays as string[];
  }
  return result;
}

/** HTTP shapes only. Auth is supplied by the mobile adapter; this module never calls planning. */
export function createBackend(request: ApiRequest) {
  async function json<T>(path: string, options?: RequestInit): Promise<T> {
    return (await checked(await request(path, options))).json();
  }
  return {
    getProfile: () => json<ApiProfile>('/profile'),
    getOnboarding: () => json<Onboarding | null>('/onboarding'),
    saveTimezone: (timezone: string) => json<ApiProfile>('/profile', {
      method: 'PATCH', body: JSON.stringify({ timezone }),
    }),
    saveProfile: (displayName: string, timezone: string) => json<ApiProfile>('/profile', {
      method: 'PATCH', body: JSON.stringify({ display_name: displayName.trim() || null, timezone }),
    }),
    saveAnswers: (answers: Answers) => json<Onboarding>('/onboarding', {
      method: 'PUT', body: JSON.stringify({ answers }),
    }),
    completeOnboarding: () => json<Onboarding>('/onboarding/complete', { method: 'POST' }),
    getMessages: (before?: SavedMessage) => {
      const query = new URLSearchParams({ limit: '20' });
      if (before) { query.set('before_created_at', before.created_at); query.set('before_id', before.id); }
      return json<SavedMessage[]>(`/chat/messages?${query}`);
    },
    streamChat: async (text: string, onText: (delta: string) => void,
      onSources: (sources: ChatSource[]) => void, signal?: AbortSignal) => {
      const response = await checked(await request('/chat', {
        method: 'POST', body: JSON.stringify({ text }), signal,
        headers: { Accept: 'application/x-ndjson' },
      }));
      if (!response.body) throw new Error('Chat stream is unavailable.');
      return readChatStream(response.body, onText, onSources);
    },
  };
}

/** Return only after the server confirms persistence; EOF alone is not success. */
export async function readChatStream(body: ReadableStream<Uint8Array>,
  onText: (delta: string) => void, onSources: (sources: ChatSource[]) => void): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let messageId: string | null = null;
  function dispatch(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.message ?? 'Chat failed.');
    if (event.type === 'text' && typeof event.delta === 'string') onText(event.delta);
    else if (event.type === 'sources' && Array.isArray(event.sources)) onSources(event.sources);
    else if (event.type === 'done' && typeof event.message_id === 'string') messageId = event.message_id;
    else throw new Error('Invalid chat stream event.');
  }
  try {
    while (!messageId) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) dispatch(line);
      if (done) { dispatch(buffer); break; }
    }
    if (!messageId) throw new Error('Connection ended before the reply was confirmed saved. Refresh history before sending again.');
    return messageId;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
